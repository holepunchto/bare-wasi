const hrtime = require('bare-hrtime')
const constants = require('./lib/constants')
const errors = require('./lib/errors')

const {
  errno,
  filetype,
  clockid,
  whence,
  oflags,
  fdflags,
  lookupflags,
  fstflags,
  rights,
  eventtype,
  subclockflags,
  preopentype
} = constants

const MAX_SYMLINKS = 40

const FILE_RIGHTS =
  rights.FD_DATASYNC |
  rights.FD_READ |
  rights.FD_SEEK |
  rights.FD_FDSTAT_SET_FLAGS |
  rights.FD_SYNC |
  rights.FD_TELL |
  rights.FD_WRITE |
  rights.FD_ADVISE |
  rights.FD_ALLOCATE |
  rights.FD_FILESTAT_GET |
  rights.FD_FILESTAT_SET_SIZE |
  rights.FD_FILESTAT_SET_TIMES |
  rights.POLL_FD_READWRITE

const DIRECTORY_RIGHTS =
  rights.FD_FDSTAT_SET_FLAGS |
  rights.FD_SYNC |
  rights.FD_DATASYNC |
  rights.PATH_CREATE_DIRECTORY |
  rights.PATH_CREATE_FILE |
  rights.PATH_LINK_SOURCE |
  rights.PATH_LINK_TARGET |
  rights.PATH_OPEN |
  rights.FD_READDIR |
  rights.PATH_READLINK |
  rights.PATH_RENAME_SOURCE |
  rights.PATH_RENAME_TARGET |
  rights.PATH_FILESTAT_GET |
  rights.PATH_FILESTAT_SET_SIZE |
  rights.PATH_FILESTAT_SET_TIMES |
  rights.FD_FILESTAT_GET |
  rights.FD_FILESTAT_SET_TIMES |
  rights.PATH_SYMLINK |
  rights.PATH_REMOVE_DIRECTORY |
  rights.PATH_UNLINK_FILE |
  rights.POLL_FD_READWRITE

const STREAM_RIGHTS = rights.FD_FDSTAT_SET_FLAGS | rights.FD_FILESTAT_GET | rights.POLL_FD_READWRITE

const SYSCALL = /^_(args|environ|clock|fd|path|poll|proc|sched|random|sock)_/

class Errno extends Error {
  constructor(code) {
    super(`WASI errno ${code}`)
    this.errno = code
  }
}

class Exit extends Error {
  constructor(code) {
    super(`WASI exit ${code}`)
    this.code = code
  }
}

class Stream {
  constructor(source) {
    this.type = 'character-device'
    this._source = source
    this._position = 0
  }

  stat() {
    return { ino: 0n, nlink: 1n, size: 0n, atime: 0n, mtime: 0n, ctime: 0n }
  }

  read(buffer) {
    const source = this._source

    if (typeof source.read === 'function') return source.read(buffer)

    const len = Math.min(buffer.byteLength, source.byteLength - this._position)

    buffer.set(source.subarray(this._position, this._position + len))

    this._position += len

    return len
  }

  write(buffer) {
    const data = Buffer.from(buffer)

    if (typeof this._source === 'function') this._source(data)
    else this._source.write(data)

    return buffer.byteLength
  }
}

const defaultClock = {
  realtime() {
    return BigInt(Date.now()) * 1000000n
  },
  monotonic() {
    return hrtime.bigint()
  }
}

module.exports = exports = class WASI {
  constructor(opts = {}) {
    const {
      args = [],
      env = {},
      preopens = {},
      stdin = null,
      stdout = null,
      stderr = null,
      clock = defaultClock,
      random = null,
      returnOnExit = true
    } = opts

    this._args = args.map((arg) => Buffer.from(String(arg) + '\0'))
    this._env = Object.entries(env).map(([key, value]) => Buffer.from(`${key}=${value}\0`))
    this._clock = clock
    this._random = random
    this._returnOnExit = returnOnExit

    this._memory = null
    this._started = false

    this._fds = new Map()

    if (stdin !== null) this._fds.set(0, stream(stdin, false))
    if (stdout !== null) this._fds.set(1, stream(stdout, true))
    if (stderr !== null) this._fds.set(2, stream(stderr, true))

    let fd = 3

    for (const [name, directory] of Object.entries(preopens)) {
      if (directory?.type !== 'directory') {
        throw errors.INVALID_PREOPEN(`Preopen '${name}' is not a directory`)
      }

      this._fds.set(fd++, {
        ...descriptor(directory, DIRECTORY_RIGHTS, DIRECTORY_RIGHTS | FILE_RIGHTS),
        preopen: Buffer.from(name)
      })
    }

    this.wasiImport = Object.create(null)

    for (const name of Object.getOwnPropertyNames(WASI.prototype)) {
      if (!SYSCALL.test(name)) continue

      this.wasiImport[name.slice(1)] = (...args) => {
        try {
          return this[name](...args) ?? errno.SUCCESS
        } catch (err) {
          return this._errno(err)
        }
      }
    }
  }

  getImportObject() {
    return { wasi_snapshot_preview1: this.wasiImport }
  }

  start(instance) {
    const { _start, _initialize } = this._bind(instance)

    if (typeof _start !== 'function') {
      throw errors.MISSING_EXPORT("Instance does not export '_start'")
    }

    if (_initialize !== undefined) {
      throw errors.UNEXPECTED_EXPORT("Instance exports '_initialize' and cannot be started")
    }

    try {
      _start()
    } catch (err) {
      if (err instanceof Exit) return this._exit(err.code)
      throw err
    }

    return this._exit(0)
  }

  initialize(instance) {
    const { _start, _initialize } = this._bind(instance)

    if (_start !== undefined) {
      throw errors.UNEXPECTED_EXPORT("Instance exports '_start' and cannot be initialized")
    }

    if (typeof _initialize === 'function') _initialize()
  }

  _bind(instance) {
    if (this._started) throw errors.ALREADY_STARTED('Instance has already been started')

    const { exports } = instance

    if (!(exports.memory instanceof WebAssembly.Memory)) {
      throw errors.MISSING_EXPORT("Instance does not export a 'memory'")
    }

    this._started = true
    this._memory = exports.memory

    return exports
  }

  _exit(code) {
    if (this._returnOnExit) return code

    Bare.exit(code)
  }

  _errno(err) {
    if (err instanceof Exit) throw err
    if (err instanceof Errno) return err.errno
    if (err instanceof RangeError) return errno.FAULT

    const code = typeof err?.code === 'string' ? errno[err.code.replace(/^E/, '')] : undefined

    return code ?? errno.IO
  }

  get _view() {
    return new DataView(this._memory.buffer)
  }

  get _bytes() {
    return new Uint8Array(this._memory.buffer)
  }

  _slice(ptr, len) {
    return new Uint8Array(this._memory.buffer, ptr >>> 0, len >>> 0)
  }

  _string(ptr, len) {
    const bytes = this._slice(ptr, len)
    const string = Buffer.from(bytes).toString()

    if (!Buffer.from(string).equals(bytes) || string.includes('\0')) throw new Errno(errno.ILSEQ)

    return string
  }

  _iovs(ptr, len) {
    const view = this._view
    const iovs = []

    for (let i = 0; i < len >>> 0; i++) {
      const at = (ptr >>> 0) + i * 8

      iovs.push(this._slice(view.getUint32(at, true), view.getUint32(at + 4, true)))
    }

    return iovs
  }

  _fd(fd, required = 0n) {
    const entry = this._fds.get(fd >>> 0)
    if (entry === undefined) throw new Errno(errno.BADF)
    return this._require(entry, required)
  }

  _file(fd, required) {
    const entry = this._fd(fd)
    if (entry.node.type === 'directory') throw new Errno(errno.ISDIR)
    return this._require(entry, required)
  }

  _directory(fd, required) {
    const entry = this._fd(fd)
    if (entry.node.type !== 'directory') throw new Errno(errno.NOTDIR)
    return this._require(entry, required)
  }

  // Lacking access to read or write is EBADF, as in POSIX.
  _require(entry, required = 0n) {
    if ((entry.rights & required) !== required) {
      throw new Errno(required & (rights.FD_READ | rights.FD_WRITE) ? errno.BADF : errno.NOTCAPABLE)
    }

    return entry
  }

  _allocate(entry) {
    let fd = 0

    while (this._fds.has(fd)) fd++

    this._fds.set(fd, entry)

    return fd
  }

  // A path can never name anything outside the directory of `fd`: absolute
  // paths are refused, and `..` may not climb above where resolution started.
  _resolve(fd, path, follow, required) {
    const root = this._directory(fd, required).node

    if (path.length === 0) throw new Errno(errno.NOENT)
    if (path[0] === '/') throw new Errno(errno.NOTCAPABLE)

    const trailing = path[path.length - 1] === '/'

    if (trailing) follow = true

    const stack = [root]

    let queue = path.split('/').filter((name) => name !== '')
    let links = 0

    while (true) {
      const name = queue.shift()
      const last = queue.length === 0
      const directory = stack[stack.length - 1]

      if (name === '.' || name === '..') {
        if (name === '..') {
          if (stack.length === 1) throw new Errno(errno.NOTCAPABLE)
          stack.pop()
        }

        if (last) {
          const node = stack[stack.length - 1]
          return { directory: node, name: '.', node, ancestors: stack, trailing }
        }

        continue
      }

      const node = directory.lookup(name)

      if (node !== null && node.type === 'symlink' && (!last || follow)) {
        if (++links > MAX_SYMLINKS) throw new Errno(errno.LOOP)

        const { target } = node

        if (target.length === 0) throw new Errno(errno.NOENT)
        if (target[0] === '/') throw new Errno(errno.NOTCAPABLE)

        queue = [...target.split('/').filter((name) => name !== ''), ...queue]

        continue
      }

      if (last) {
        if (trailing && node !== null && node.type !== 'directory') throw new Errno(errno.NOTDIR)

        return { directory, name, node, ancestors: stack, trailing }
      }

      if (node === null) throw new Errno(errno.NOENT)
      if (node.type !== 'directory') throw new Errno(errno.NOTDIR)

      stack.push(node)
    }
  }

  _existing(fd, path, follow, required) {
    const resolved = this._resolve(fd, path, follow, required)
    if (resolved.node === null) throw new Errno(errno.NOENT)
    return resolved
  }

  _filestat(ptr, node) {
    const stat = node.stat()
    const view = this._view

    ptr >>>= 0

    this._bytes.fill(0, ptr, ptr + 64)

    view.setBigUint64(ptr, 0n, true)
    view.setBigUint64(ptr + 8, stat.ino, true)
    view.setUint8(ptr + 16, filetypeOf(node))
    view.setBigUint64(ptr + 24, stat.nlink, true)
    view.setBigUint64(ptr + 32, stat.size, true)
    view.setBigUint64(ptr + 40, stat.atime, true)
    view.setBigUint64(ptr + 48, stat.mtime, true)
    view.setBigUint64(ptr + 56, stat.ctime, true)
  }

  _times(node, atim, mtim, flags) {
    if (flags & fstflags.ATIM && flags & fstflags.ATIM_NOW) throw new Errno(errno.INVAL)
    if (flags & fstflags.MTIM && flags & fstflags.MTIM_NOW) throw new Errno(errno.INVAL)
    if (typeof node.setTimes !== 'function') throw new Errno(errno.NOTSUP)

    const now = defaultClock.realtime()

    node.setTimes(
      flags & fstflags.ATIM ? atim : flags & fstflags.ATIM_NOW ? now : undefined,
      flags & fstflags.MTIM ? mtim : flags & fstflags.MTIM_NOW ? now : undefined
    )
  }

  _strings(strings, ptrs, buf) {
    const view = this._view
    const bytes = this._bytes

    ptrs >>>= 0
    buf >>>= 0

    for (const string of strings) {
      view.setUint32(ptrs, buf, true)
      bytes.set(string, buf)

      ptrs += 4
      buf += string.byteLength
    }
  }

  _sizes(strings, count, size) {
    const view = this._view

    view.setUint32(count >>> 0, strings.length, true)
    view.setUint32(
      size >>> 0,
      strings.reduce((total, string) => total + string.byteLength, 0),
      true
    )
  }

  _args_get(argv, buf) {
    this._strings(this._args, argv, buf)
  }

  _args_sizes_get(count, size) {
    this._sizes(this._args, count, size)
  }

  _environ_get(environ, buf) {
    this._strings(this._env, environ, buf)
  }

  _environ_sizes_get(count, size) {
    this._sizes(this._env, count, size)
  }

  _now(id) {
    if (this._clock === null) throw new Errno(errno.NOTCAPABLE)

    switch (id) {
      case clockid.REALTIME:
        return this._clock.realtime()
      case clockid.MONOTONIC:
        return this._clock.monotonic()
      default:
        throw new Errno(errno.INVAL)
    }
  }

  _clock_res_get(id, resolution) {
    this._now(id)

    this._view.setBigUint64(resolution >>> 0, id === clockid.REALTIME ? 1000000n : 1n, true)
  }

  _clock_time_get(id, precision, time) {
    this._view.setBigUint64(time >>> 0, this._now(id), true)
  }

  _fd_advise(fd) {
    this._file(fd, rights.FD_ADVISE)
  }

  _fd_allocate(fd, offset, len) {
    const { node } = this._file(fd, rights.FD_ALLOCATE)

    if (node.type !== 'file') throw new Errno(errno.NODEV)

    const size = Number(offset + len)

    if (size > node.size) node.truncate(size)
  }

  _fd_close(fd) {
    this._fd(fd)
    this._fds.delete(fd >>> 0)
  }

  _fd_datasync(fd) {
    this._sync(this._fd(fd, rights.FD_DATASYNC))
  }

  _fd_sync(fd) {
    this._sync(this._fd(fd, rights.FD_SYNC))
  }

  _sync({ node }) {
    if (typeof node.sync === 'function') node.sync()
  }

  _fd_fdstat_get(fd, ptr) {
    const entry = this._fd(fd)
    const view = this._view

    ptr >>>= 0

    this._bytes.fill(0, ptr, ptr + 24)

    view.setUint8(ptr, filetypeOf(entry.node))
    view.setUint16(ptr + 2, entry.flags, true)
    view.setBigUint64(ptr + 8, entry.rights, true)
    view.setBigUint64(ptr + 16, entry.inheriting, true)
  }

  _fd_fdstat_set_flags(fd, flags) {
    this._fd(fd, rights.FD_FDSTAT_SET_FLAGS).flags = flags
  }

  _fd_fdstat_set_rights(fd, base, inheriting) {
    const entry = this._fd(fd)

    if ((base & ~entry.rights) !== 0n || (inheriting & ~entry.inheriting) !== 0n) {
      throw new Errno(errno.NOTCAPABLE)
    }

    entry.rights = base
    entry.inheriting = inheriting
  }

  _fd_filestat_get(fd, ptr) {
    this._filestat(ptr, this._fd(fd, rights.FD_FILESTAT_GET).node)
  }

  _fd_filestat_set_size(fd, size) {
    this._file(fd, rights.FD_FILESTAT_SET_SIZE).node.truncate(Number(size))
  }

  _fd_filestat_set_times(fd, atim, mtim, flags) {
    this._times(this._fd(fd, rights.FD_FILESTAT_SET_TIMES).node, atim, mtim, flags)
  }

  _read(entry, iovs, position) {
    let total = 0

    for (const iov of iovs) {
      const len = entry.node.read(iov, position === null ? null : position + total)

      total += len

      if (len < iov.byteLength) break
    }

    return total
  }

  _write(entry, iovs, position) {
    let total = 0

    for (const iov of iovs) {
      total += entry.node.write(iov, position === null ? null : position + total)
    }

    return total
  }

  _fd_read(fd, iovs, len, nread) {
    const entry = this._file(fd, rights.FD_READ)
    const stream = entry.node.type === 'character-device'

    const total = this._read(entry, this._iovs(iovs, len), stream ? null : entry.position)

    if (!stream) entry.position += total

    this._view.setUint32(nread >>> 0, total, true)
  }

  _fd_pread(fd, iovs, len, offset, nread) {
    const entry = this._file(fd, rights.FD_READ)

    if (entry.node.type === 'character-device') throw new Errno(errno.SPIPE)

    this._fd(fd, rights.FD_SEEK)

    this._view.setUint32(
      nread >>> 0,
      this._read(entry, this._iovs(iovs, len), Number(offset)),
      true
    )
  }

  _fd_write(fd, iovs, len, nwritten) {
    const entry = this._file(fd, rights.FD_WRITE)
    const stream = entry.node.type === 'character-device'

    if (!stream && entry.flags & fdflags.APPEND) entry.position = entry.node.size

    const total = this._write(entry, this._iovs(iovs, len), stream ? null : entry.position)

    if (!stream) entry.position += total

    this._view.setUint32(nwritten >>> 0, total, true)
  }

  _fd_pwrite(fd, iovs, len, offset, nwritten) {
    const entry = this._file(fd, rights.FD_WRITE)

    if (entry.node.type === 'character-device') throw new Errno(errno.SPIPE)

    this._fd(fd, rights.FD_SEEK)

    this._view.setUint32(
      nwritten >>> 0,
      this._write(entry, this._iovs(iovs, len), Number(offset)),
      true
    )
  }

  _fd_prestat_get(fd, ptr) {
    const { preopen } = this._fd(fd)

    if (preopen === undefined) throw new Errno(errno.BADF)

    const view = this._view

    view.setUint8(ptr >>> 0, preopentype.DIR)
    view.setUint32((ptr >>> 0) + 4, preopen.byteLength, true)
  }

  _fd_prestat_dir_name(fd, ptr, len) {
    const { preopen } = this._fd(fd)

    if (preopen === undefined) throw new Errno(errno.BADF)
    if (len >>> 0 < preopen.byteLength) throw new Errno(errno.NAMETOOLONG)

    this._bytes.set(preopen, ptr >>> 0)
  }

  _fd_readdir(fd, buf, len, cookie, used) {
    const { node } = this._directory(fd, rights.FD_READDIR)

    const entries = [
      ['.', node],
      ['..', node],
      ...[...node.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    ]

    const view = this._view
    const bytes = this._bytes

    buf >>>= 0
    len >>>= 0

    let offset = 0

    for (let i = Number(cookie); i < entries.length && offset < len; i++) {
      const [name, entry] = entries[i]
      const encoded = Buffer.from(name)
      const dirent = new Uint8Array(24 + encoded.byteLength)
      const header = new DataView(dirent.buffer)

      header.setBigUint64(0, BigInt(i + 1), true)
      header.setBigUint64(8, entry.stat().ino, true)
      header.setUint32(16, encoded.byteLength, true)
      header.setUint8(20, filetypeOf(entry))

      dirent.set(encoded, 24)

      const n = Math.min(dirent.byteLength, len - offset)

      bytes.set(dirent.subarray(0, n), buf + offset)

      offset += n
    }

    view.setUint32(used >>> 0, offset, true)
  }

  _fd_renumber(from, to) {
    const entry = this._fd(from)

    this._fd(to)
    this._fds.set(to >>> 0, entry)
    this._fds.delete(from >>> 0)
  }

  _fd_seek(fd, offset, from, result) {
    const tell = from === whence.CUR && offset === 0n
    const entry = this._file(fd, tell ? rights.FD_TELL : rights.FD_SEEK)

    if (entry.node.type === 'character-device') throw new Errno(errno.SPIPE)

    let position

    switch (from) {
      case whence.SET:
        position = offset
        break
      case whence.CUR:
        position = BigInt(entry.position) + offset
        break
      case whence.END:
        position = BigInt(entry.node.size) + offset
        break
      default:
        throw new Errno(errno.INVAL)
    }

    if (position < 0n) throw new Errno(errno.INVAL)

    entry.position = Number(position)

    this._view.setBigUint64(result >>> 0, position, true)
  }

  _fd_tell(fd, result) {
    const entry = this._file(fd, rights.FD_TELL)

    if (entry.node.type === 'character-device') throw new Errno(errno.SPIPE)

    this._view.setBigUint64(result >>> 0, BigInt(entry.position), true)
  }

  _path_create_directory(fd, ptr, len) {
    const { directory, name, node } = this._resolve(
      fd,
      this._string(ptr, len),
      false,
      rights.PATH_CREATE_DIRECTORY
    )

    if (node !== null) throw new Errno(errno.EXIST)

    directory.create(name, 'directory')
  }

  _path_filestat_get(fd, flags, ptr, len, buf) {
    const { node } = this._existing(
      fd,
      this._string(ptr, len),
      (flags & lookupflags.SYMLINK_FOLLOW) !== 0,
      rights.PATH_FILESTAT_GET
    )

    this._filestat(buf, node)
  }

  _path_filestat_set_times(fd, flags, ptr, len, atim, mtim, fst) {
    const { node } = this._existing(
      fd,
      this._string(ptr, len),
      (flags & lookupflags.SYMLINK_FOLLOW) !== 0,
      rights.PATH_FILESTAT_SET_TIMES
    )

    this._times(node, atim, mtim, fst)
  }

  _path_link(fd, flags, ptr, len, target, targetPtr, targetLen) {
    const source = this._existing(
      fd,
      this._string(ptr, len),
      (flags & lookupflags.SYMLINK_FOLLOW) !== 0,
      rights.PATH_LINK_SOURCE
    )

    const destination = this._resolve(
      target,
      this._string(targetPtr, targetLen),
      false,
      rights.PATH_LINK_TARGET
    )

    if (source.node.type === 'directory') throw new Errno(errno.PERM)
    if (destination.node !== null) throw new Errno(errno.EXIST)
    if (destination.trailing) throw new Errno(errno.NOENT)
    if (typeof destination.directory.link !== 'function') throw new Errno(errno.NOTSUP)

    destination.directory.link(destination.name, source.node)
  }

  _path_open(fd, dirflags, ptr, len, oflag, base, inheriting, fdflag, result) {
    let required = rights.PATH_OPEN

    if (oflag & oflags.CREAT) required |= rights.PATH_CREATE_FILE
    if (oflag & oflags.TRUNC) required |= rights.PATH_FILESTAT_SET_SIZE

    const { directory, name, node, trailing } = this._resolve(
      fd,
      this._string(ptr, len),
      (dirflags & lookupflags.SYMLINK_FOLLOW) !== 0,
      required
    )

    const writable = (base & rights.FD_WRITE) !== 0n

    let target = node

    if (target === null) {
      if ((oflag & oflags.CREAT) === 0) throw new Errno(errno.NOENT)
      if (oflag & oflags.DIRECTORY) throw new Errno(errno.INVAL)
      if (trailing) throw new Errno(errno.ISDIR)

      target = directory.create(name, 'file')
    } else {
      if (oflag & oflags.CREAT && oflag & oflags.EXCL) throw new Errno(errno.EXIST)
      if (target.type === 'symlink') throw new Errno(errno.LOOP)
      if (oflag & oflags.DIRECTORY && target.type !== 'directory') throw new Errno(errno.NOTDIR)
    }

    if (target.type === 'directory') {
      if (writable || oflag & oflags.TRUNC) throw new Errno(errno.ISDIR)
    } else if (oflag & oflags.TRUNC) {
      target.truncate(0)
    }

    const parent = this._fd(fd)
    const isDirectory = target.type === 'directory'

    let granted = (isDirectory ? DIRECTORY_RIGHTS : FILE_RIGHTS) & parent.inheriting

    if ((base & rights.FD_READ) === 0n) granted &= ~rights.FD_READ
    if (!writable) granted &= ~rights.FD_WRITE

    const opened = this._allocate(
      descriptor(target, granted, isDirectory ? parent.inheriting : 0n, fdflag)
    )

    this._view.setUint32(result >>> 0, opened, true)
  }

  _path_readlink(fd, ptr, len, buf, bufLen, used) {
    const { node } = this._existing(fd, this._string(ptr, len), false, rights.PATH_READLINK)

    if (node.type !== 'symlink') throw new Errno(errno.INVAL)

    const target = Buffer.from(node.target)
    const n = Math.min(target.byteLength, bufLen >>> 0)

    this._bytes.set(target.subarray(0, n), buf >>> 0)
    this._view.setUint32(used >>> 0, n, true)
  }

  _path_remove_directory(fd, ptr, len) {
    const { directory, name, node } = this._existing(
      fd,
      this._string(ptr, len),
      false,
      rights.PATH_REMOVE_DIRECTORY
    )

    if (name === '.') throw new Errno(errno.INVAL)
    if (node.type !== 'directory') throw new Errno(errno.NOTDIR)

    directory.rmdir(name)
  }

  _path_rename(fd, ptr, len, target, targetPtr, targetLen) {
    const source = this._existing(fd, this._string(ptr, len), false, rights.PATH_RENAME_SOURCE)

    const destination = this._resolve(
      target,
      this._string(targetPtr, targetLen),
      false,
      rights.PATH_RENAME_TARGET
    )

    if (source.name === '.' || destination.name === '.') throw new Errno(errno.BUSY)

    if (source.node.type === 'directory' && destination.ancestors.includes(source.node)) {
      throw new Errno(errno.INVAL)
    }

    source.directory.rename(source.name, destination.directory, destination.name)
  }

  _path_symlink(ptr, len, fd, targetPtr, targetLen) {
    const target = this._string(ptr, len)

    if (target[0] === '/') throw new Errno(errno.NOTCAPABLE)

    const { directory, name, node, trailing } = this._resolve(
      fd,
      this._string(targetPtr, targetLen),
      false,
      rights.PATH_SYMLINK
    )

    if (node !== null) throw new Errno(errno.EXIST)
    if (trailing) throw new Errno(errno.NOENT)
    if (typeof directory.symlink !== 'function') throw new Errno(errno.NOTSUP)

    directory.symlink(name, target)
  }

  _path_unlink_file(fd, ptr, len) {
    const { directory, name, node } = this._existing(
      fd,
      this._string(ptr, len),
      false,
      rights.PATH_UNLINK_FILE
    )

    if (node.type === 'directory') throw new Errno(errno.ISDIR)

    directory.unlink(name)
  }

  _poll_oneoff(subscriptions, events, count, nevents) {
    const view = this._view

    subscriptions >>>= 0
    events >>>= 0

    const ready = []
    const timers = []

    for (let i = 0; i < count >>> 0; i++) {
      const at = subscriptions + i * 48
      const userdata = view.getBigUint64(at, true)
      const type = view.getUint8(at + 8)

      if (type === eventtype.CLOCK) {
        const id = view.getUint32(at + 16, true)
        const timeout = view.getBigUint64(at + 24, true)
        const flags = view.getUint16(at + 40, true)

        let delay = timeout

        try {
          if (flags & subclockflags.SUBSCRIPTION_CLOCK_ABSTIME) delay = timeout - this._now(id)
          else if (id !== clockid.REALTIME && id !== clockid.MONOTONIC) throw new Errno(errno.INVAL)
        } catch (err) {
          ready.push({ userdata, type, error: this._errno(err), nbytes: 0n })
          continue
        }

        timers.push({ userdata, type, delay: delay < 0n ? 0n : delay })
      } else if (type === eventtype.FD_READ || type === eventtype.FD_WRITE) {
        const entry = this._fds.get(view.getUint32(at + 16, true))

        if (entry === undefined) {
          ready.push({ userdata, type, error: errno.BADF, nbytes: 0n })
        } else {
          const remaining =
            type === eventtype.FD_READ && entry.node.type === 'file'
              ? BigInt(Math.max(0, entry.node.size - entry.position))
              : 0n

          ready.push({ userdata, type, error: errno.SUCCESS, nbytes: remaining })
        }
      } else {
        throw new Errno(errno.INVAL)
      }
    }

    let delay = 0n

    if (ready.length === 0 && timers.length > 0) {
      delay = timers.reduce(
        (min, timer) => (timer.delay < min ? timer.delay : min),
        timers[0].delay
      )
      sleep(delay)
    }

    for (const timer of timers) {
      if (timer.delay <= delay) ready.push({ ...timer, error: errno.SUCCESS, nbytes: 0n })
    }

    this._bytes.fill(0, events, events + ready.length * 32)

    for (let i = 0; i < ready.length; i++) {
      const at = events + i * 32
      const event = ready[i]

      view.setBigUint64(at, event.userdata, true)
      view.setUint16(at + 8, event.error, true)
      view.setUint8(at + 10, event.type)
      view.setBigUint64(at + 16, event.nbytes, true)
    }

    view.setUint32(nevents >>> 0, ready.length, true)
  }

  _proc_exit(code) {
    throw new Exit(code >>> 0)
  }

  _proc_raise() {
    return errno.NOSYS
  }

  _sched_yield() {}

  _random_get(ptr, len) {
    if (this._random === null) throw new Errno(errno.NOTCAPABLE)

    this._random(this._slice(ptr, len))
  }

  _sock_accept(fd) {
    this._fd(fd)
    return errno.NOTSOCK
  }

  _sock_recv(fd) {
    return this._sock_accept(fd)
  }

  _sock_send(fd) {
    return this._sock_accept(fd)
  }

  _sock_shutdown(fd) {
    return this._sock_accept(fd)
  }
}

exports.constants = constants
exports.errors = errors

function descriptor(node, rights, inheriting = 0n, flags = 0) {
  return { node, preopen: undefined, rights, inheriting, flags, position: 0 }
}

function stream(source, writable) {
  const access = writable ? rights.FD_WRITE : rights.FD_READ

  if (typeof source?.stat === 'function') {
    return descriptor(source, (FILE_RIGHTS & ~(rights.FD_READ | rights.FD_WRITE)) | access)
  }

  if (typeof source === 'string') source = Buffer.from(source)

  return descriptor(new Stream(source), STREAM_RIGHTS | access)
}

const filetypes = {
  file: filetype.REGULAR_FILE,
  directory: filetype.DIRECTORY,
  symlink: filetype.SYMBOLIC_LINK,
  'character-device': filetype.CHARACTER_DEVICE
}

function filetypeOf(node) {
  return filetypes[node.type] ?? filetype.UNKNOWN
}

const sleeper = new Int32Array(new SharedArrayBuffer(4))

function sleep(ns) {
  if (ns > 0n) Atomics.wait(sleeper, 0, 0, Number(ns) / 1e6)
}
