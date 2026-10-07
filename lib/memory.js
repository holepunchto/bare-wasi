let inodes = 0n

class MemoryNode {
  constructor(type) {
    const now = timestamp()

    this.type = type
    this.ino = ++inodes
    this.nlink = 1n
    this.atime = now
    this.mtime = now
    this.ctime = now
  }

  get size() {
    return 0
  }

  stat() {
    return {
      ino: this.ino,
      nlink: this.nlink,
      size: BigInt(this.size),
      atime: this.atime,
      mtime: this.mtime,
      ctime: this.ctime
    }
  }

  setTimes(atime, mtime) {
    if (atime !== undefined) this.atime = atime
    if (mtime !== undefined) this.mtime = mtime

    this.ctime = timestamp()
  }

  _modified() {
    this.mtime = this.ctime = timestamp()
  }
}

class MemoryFile extends MemoryNode {
  constructor(data = new Uint8Array(0)) {
    super('file')

    if (typeof data === 'string') data = Buffer.from(data)

    this._data = new Uint8Array(data)
    this._size = this._data.byteLength
  }

  get size() {
    return this._size
  }

  get data() {
    return this._data.subarray(0, this._size)
  }

  read(buffer, position) {
    const len = Math.max(0, Math.min(buffer.byteLength, this._size - position))

    buffer.set(this._data.subarray(position, position + len))

    return len
  }

  write(buffer, position) {
    this._reserve(position + buffer.byteLength)

    this._data.set(buffer, position)
    this._size = Math.max(this._size, position + buffer.byteLength)
    this._modified()

    return buffer.byteLength
  }

  truncate(size) {
    this._reserve(size)

    if (size < this._size) this._data.fill(0, size, this._size)

    this._size = size
    this._modified()
  }

  _reserve(size) {
    if (size <= this._data.byteLength) return

    const data = new Uint8Array(Math.max(size, this._data.byteLength * 2))

    data.set(this._data.subarray(0, this._size))

    this._data = data
  }
}

class MemorySymlink extends MemoryNode {
  constructor(target) {
    super('symlink')

    this.target = target
  }

  get size() {
    return Buffer.byteLength(this.target)
  }
}

class MemoryDirectory extends MemoryNode {
  constructor(entries = {}) {
    super('directory')

    this._entries = new Map()

    for (const [name, value] of Object.entries(entries)) this._entries.set(name, from(value))
  }

  get size() {
    return this._entries.size
  }

  lookup(name) {
    return this._entries.get(name) || null
  }

  entries() {
    return this._entries.entries()
  }

  create(name, type) {
    if (type !== 'file' && type !== 'directory') {
      throw error('EINVAL', `Cannot create a node of type '${type}'`)
    }

    return this._insert(name, type === 'file' ? new MemoryFile() : new MemoryDirectory())
  }

  symlink(name, target) {
    return this._insert(name, new MemorySymlink(target))
  }

  link(name, node) {
    if (!(node instanceof MemoryNode)) throw error('EXDEV', 'Cannot link across backends')
    if (node.type === 'directory') throw error('EPERM', 'Cannot link a directory')

    this._insert(name, node)

    node.nlink++
    node.ctime = timestamp()
  }

  unlink(name) {
    const node = this._get(name)

    if (node.type === 'directory') throw error('EISDIR', `'${name}' is a directory`)

    node.nlink--
    node.ctime = timestamp()

    this._remove(name)
  }

  rmdir(name) {
    const node = this._get(name)

    if (node.type !== 'directory') throw error('ENOTDIR', `'${name}' is not a directory`)
    if (node._entries.size > 0) throw error('ENOTEMPTY', `'${name}' is not empty`)

    this._remove(name)
  }

  rename(name, directory, target) {
    if (!(directory instanceof MemoryDirectory)) {
      throw error('EXDEV', 'Cannot rename across backends')
    }

    const node = this._get(name)
    const existing = directory.lookup(target)

    if (existing === node) return

    if (existing !== null) {
      if (existing.type === 'directory') {
        if (node.type !== 'directory') throw error('EISDIR', `'${target}' is a directory`)
        if (existing._entries.size > 0) throw error('ENOTEMPTY', `'${target}' is not empty`)
      } else if (node.type === 'directory') {
        throw error('ENOTDIR', `'${target}' is not a directory`)
      }

      existing.nlink--
    }

    this._remove(name)
    directory._entries.set(target, node)
    directory._modified()

    node.ctime = timestamp()
  }

  _get(name) {
    const node = this._entries.get(name)
    if (node === undefined) throw error('ENOENT', `'${name}' does not exist`)
    return node
  }

  _insert(name, node) {
    if (this._entries.has(name)) throw error('EEXIST', `'${name}' already exists`)

    this._entries.set(name, node)
    this._modified()

    return node
  }

  _remove(name) {
    this._entries.delete(name)
    this._modified()
  }
}

exports.MemoryNode = MemoryNode
exports.MemoryFile = MemoryFile
exports.MemorySymlink = MemorySymlink
exports.MemoryDirectory = MemoryDirectory

function from(value) {
  if (value instanceof MemoryNode) return value
  if (typeof value === 'string' || value instanceof Uint8Array) return new MemoryFile(value)
  if (typeof value === 'object' && value !== null) return new MemoryDirectory(value)

  throw new TypeError(`Cannot create a node from ${value}`)
}

function timestamp() {
  return BigInt(Date.now()) * 1000000n
}

function error(code, msg) {
  const err = new Error(`${code}: ${msg}`)
  err.code = code
  return err
}
