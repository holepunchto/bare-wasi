const isWindows = Bare.platform === 'win32'

// A file refused in one mode may still open in another.
const denied = new Set(['EACCES', 'EPERM', 'ENOTCAPABLE'])

class HostDirectory {
  constructor(directory) {
    this.type = 'directory'
    this._directory = directory
  }

  get size() {
    return this._directory.list().length
  }

  stat() {
    return this._directory.stat()
  }

  setTimes(atime, mtime) {
    this._directory.setTimes(atime, mtime)
  }

  lookup(name) {
    let stat

    try {
      stat = this._directory.stat(name)
    } catch (err) {
      if (err.code === 'ENOENT') return null
      throw err
    }

    switch (stat.type) {
      case 'directory':
        return new HostDirectory(this._directory.openDirectory(name))
      case 'file':
        return new HostFile(this._directory, name)
      case 'symlink':
        return new HostSymlink(this._directory, name)
      default:
        return new HostEntry(this._directory, name, stat.type)
    }
  }

  *entries() {
    for (const { name, type } of this._directory.list()) {
      yield [name, new HostEntry(this._directory, name, type)]
    }
  }

  create(name, type) {
    if (type === 'directory') {
      this._directory.createDirectory(name)

      return new HostDirectory(this._directory.openDirectory(name))
    }

    const file = this._directory.openFile(name, {
      read: this._directory.rights.includes('read'),
      write: true,
      create: true,
      exclusive: true
    })

    return new HostFile(this._directory, name, file)
  }

  unlink(name) {
    this._directory.removeFile(name)
  }

  rmdir(name) {
    this._directory.removeDirectory(name)
  }

  rename(name, directory, target) {
    if (!(directory instanceof HostDirectory)) {
      throw error('EXDEV', 'cross-device link not permitted')
    }

    this._directory.rename(name, directory._directory, target)
  }
}

class HostEntry {
  constructor(directory, name, type) {
    this.type = type
    this._directory = directory
    this._name = name
  }

  get size() {
    return Number(this.stat().size)
  }

  stat() {
    return this._directory.stat(this._name)
  }
}

// A file is opened when it's looked up, so that it stays the same file however
// its directory changes after.
class HostFile extends HostEntry {
  constructor(directory, name, file = null) {
    super(directory, name, 'file')

    this._file = file
    this._error = null

    if (file === null) this._open()
  }

  stat() {
    return this._file === null ? super.stat() : this._file.stat()
  }

  setTimes(atime, mtime) {
    this._opened().setTimes(atime, mtime)
  }

  read(buffer, position) {
    return this._opened().read(buffer, position ?? 0)
  }

  write(buffer, position) {
    return this._opened().write(buffer, position ?? 0)
  }

  truncate(size) {
    this._opened().truncate(size)
  }

  sync() {
    this._opened().sync()
  }

  // Opens the file with as much access as the directory and the file allow.
  _open() {
    const { rights } = this._directory

    const read = rights.includes('read')
    const write = rights.includes('write')
    const append = !write && rights.includes('append')

    const modes = []

    if (read && (write || append)) modes.push({ read, write, append })
    if (read) modes.push({ read })
    if (write || append) modes.push({ write, append })

    this._error = error('ENOTCAPABLE', 'capabilities insufficient')

    for (const mode of modes) {
      try {
        this._file = this._directory.openFile(this._name, mode)
        this._error = null
        return
      } catch (err) {
        if (!denied.has(err.code)) throw err

        this._error = err
      }
    }
  }

  _opened() {
    if (this._file === null) throw this._error

    return this._file
  }
}

class HostSymlink extends HostEntry {
  constructor(directory, name) {
    super(directory, name, 'symlink')
  }

  get target() {
    const target = this._directory.readLink(this._name)

    return isWindows ? fromWindowsTarget(target) : target
  }

  get size() {
    return Buffer.byteLength(this.target)
  }
}

// Drive letter paths are made absolute along with the rooted, UNC, and device
// paths, which start with a separator.
function fromWindowsTarget(target) {
  target = target.replace(/\\/g, '/')

  return /^[a-z]:/i.test(target) ? '/' + target : target
}

function error(code, message) {
  const err = new Error(`${code}: ${message}`)
  err.code = code
  return err
}

module.exports = { HostDirectory }
