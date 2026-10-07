const test = require('brittle')
const WASI = require('.')
const { MemoryDirectory, MemoryFile, MemorySymlink } = require('./lib/memory')

const { errno, rights, oflags } = WASI.constants

const fixtures = {
  args: require('./test/fixtures/args.wasm', { with: { type: 'binary' } }),
  clock: require('./test/fixtures/clock.wasm', { with: { type: 'binary' } }),
  escape: require('./test/fixtures/escape.wasm', { with: { type: 'binary' } }),
  exit: require('./test/fixtures/exit.wasm', { with: { type: 'binary' } }),
  fs: require('./test/fixtures/fs.wasm', { with: { type: 'binary' } }),
  hello: require('./test/fixtures/hello.wasm', { with: { type: 'binary' } }),
  random: require('./test/fixtures/random.wasm', { with: { type: 'binary' } }),
  stdin: require('./test/fixtures/stdin.wasm', { with: { type: 'binary' } })
}

test('stdout and stderr', (t) => {
  const { code, stdout, stderr } = run('hello')

  t.is(code, 0)
  t.is(stdout, 'hello stdout\n')
  t.is(stderr, 'hello stderr\n')
})

test('streams that were not granted do not exist', (t) => {
  const wasi = new WASI()
  const instance = instantiate('hello', wasi)

  t.is(wasi.start(instance), 0)
})

test('stdin', (t) => {
  t.is(run('stdin', { stdin: 'shout\n' }).stdout, 'SHOUT\n')
})

test('args and env', (t) => {
  const { stdout } = run('args', { args: ['args', 'a b', 'c'], env: { FOO: 'bar' } })

  t.is(stdout, 'arg args\narg a b\narg c\nenv FOO=bar\n')
})

test('exit code', (t) => {
  t.is(run('exit').code, 7)
})

test('random is denied unless granted', (t) => {
  const denied = run('random')

  t.is(denied.code, 1)
  t.ok(denied.stdout.startsWith('error'))

  const granted = run('random', { random: (buffer) => buffer.fill(0xab) })

  t.is(granted.code, 0)
  t.is(granted.stdout, 'ab'.repeat(16) + '\n')
})

test('clocks and sleeping', (t) => {
  t.is(run('clock').stdout, 'slept enough\nrealtime plausible\n')
})

test('filesystem', (t) => {
  const data = new MemoryDirectory({ 'hello.txt': 'hello from js' })

  const { code, stdout } = run('fs', { preopens: { '/data': data } })

  t.is(code, 0, stdout)
  t.is(
    stdout,
    [
      'read hello from js',
      'size 18 regular 1',
      'link renamed.txt',
      'seek from',
      'entry link',
      'entry renamed.txt',
      'truncated 7',
      'done',
      ''
    ].join('\n')
  )

  t.is(data.lookup('hello.txt'), null)
  t.is(Buffer.from(data.lookup('dir').lookup('renamed.txt').data).toString(), 'written')
})

test('paths cannot escape a preopen', (t) => {
  const outer = new MemoryDirectory({
    secret: 'top secret',
    data: { sub: {}, 'inside.txt': 'fine', absolute: new MemorySymlink('/secret') }
  })

  const { stdout } = run('escape', { preopens: { '/data': outer.lookup('data') } })

  t.is(
    stdout,
    [
      '/data/../secret Capabilities insufficient',
      '/data/sub/../../secret Capabilities insufficient',
      '/secret No such file or directory',
      '/data/relative Capabilities insufficient',
      '/data/absolute Capabilities insufficient',
      '/data/loop Symbolic link loop',
      '/data/sub/../inside.txt opened',
      ''
    ].join('\n')
  )
})

test('path_open refuses paths outside its directory', (t) => {
  const { wasi, memory } = initialize({
    preopens: { '/data': new MemoryDirectory({ sub: { 'file.txt': 'x' } }) }
  })

  const open = (path) => {
    const len = write(memory, 64, path)
    return wasi.wasiImport.path_open(3, 1, 64, len, 0, rights.FD_READ, 0n, 0, 32)
  }

  t.is(open('sub/file.txt'), errno.SUCCESS)
  t.is(open('sub/../sub/file.txt'), errno.SUCCESS)
  t.is(open('..'), errno.NOTCAPABLE)
  t.is(open('sub/../../x'), errno.NOTCAPABLE)
  t.is(open('/sub/file.txt'), errno.NOTCAPABLE)
  t.is(open('missing'), errno.NOENT)
  t.is(open('sub/file.txt/'), errno.NOTDIR)
  t.is(open(''), errno.NOENT)
})

test('path_symlink refuses absolute targets', (t) => {
  const { wasi, memory } = initialize({ preopens: { '/data': new MemoryDirectory() } })

  const target = write(memory, 64, '/etc/passwd')
  const name = write(memory, 128, 'link')

  t.is(wasi.wasiImport.path_symlink(64, target, 3, 128, name), errno.NOTCAPABLE)
})

test('rights can be dropped but not regained', (t) => {
  const { wasi, memory } = initialize({
    preopens: { '/data': new MemoryDirectory({ 'file.txt': 'x' }) }
  })

  const view = new DataView(memory.buffer)
  const len = write(memory, 64, 'file.txt')

  t.is(wasi.wasiImport.fd_fdstat_get(3, 256), errno.SUCCESS)

  const base = view.getBigUint64(256 + 8, true)
  const inheriting = view.getBigUint64(256 + 16, true)

  t.is(base & rights.FD_SEEK, 0n, 'directories cannot seek')

  t.is(wasi.wasiImport.fd_fdstat_set_rights(3, base & ~rights.PATH_OPEN, inheriting), errno.SUCCESS)
  t.is(wasi.wasiImport.path_open(3, 0, 64, len, 0, rights.FD_READ, 0n, 0, 32), errno.NOTCAPABLE)
  t.is(wasi.wasiImport.fd_fdstat_set_rights(3, base, inheriting), errno.NOTCAPABLE)
})

test('path_open refuses paths that are not valid UTF-8', (t) => {
  const { wasi, memory } = initialize({ preopens: { '/data': new MemoryDirectory() } })

  new Uint8Array(memory.buffer).set([0x66, 0xff, 0x6f], 64)

  t.is(
    wasi.wasiImport.path_open(3, 0, 64, 3, oflags.CREAT, rights.FD_WRITE, 0n, 0, 32),
    errno.ILSEQ
  )

  new Uint8Array(memory.buffer).set([0x61, 0x00, 0x62], 64)

  t.is(
    wasi.wasiImport.path_open(3, 0, 64, 3, oflags.CREAT, rights.FD_WRITE, 0n, 0, 32),
    errno.ILSEQ
  )
})

test('pointers outside of memory fail with EFAULT', (t) => {
  const { wasi, memory } = initialize({ preopens: { '/data': new MemoryDirectory() } })

  t.is(
    wasi.wasiImport.path_open(3, 0, memory.buffer.byteLength - 2, 8, 0, 0n, 0n, 0, 32),
    errno.FAULT
  )
  t.is(wasi.wasiImport.fd_prestat_get(3, memory.buffer.byteLength), errno.FAULT)
  t.is(wasi.wasiImport.clock_time_get(0, 0n, -1), errno.FAULT)
})

test('descriptors that do not exist fail with EBADF', (t) => {
  const { wasi } = initialize()

  t.is(wasi.wasiImport.fd_write(1, 0, 0, 32), errno.BADF)
  t.is(wasi.wasiImport.fd_close(3), errno.BADF)
  t.is(wasi.wasiImport.fd_prestat_get(3, 32), errno.BADF)
})

test('clocks can be denied', (t) => {
  const { wasi } = initialize({ clock: null })

  t.is(wasi.wasiImport.clock_time_get(1, 0n, 32), errno.NOTCAPABLE)
})

test('read only descriptors cannot be written', (t) => {
  const { wasi, memory } = initialize({
    preopens: { '/data': new MemoryDirectory({ 'file.txt': 'x' }) }
  })

  const len = write(memory, 64, 'file.txt')

  t.is(wasi.wasiImport.path_open(3, 0, 64, len, 0, rights.FD_READ, 0n, 0, 32), errno.SUCCESS)

  const fd = new DataView(memory.buffer).getUint32(32, true)
  const view = new DataView(memory.buffer)

  view.setUint32(128, 64, true)
  view.setUint32(132, 1, true)

  t.is(wasi.wasiImport.fd_write(fd, 128, 1, 32), errno.BADF)
})

test('preopens must be directories', (t) => {
  t.exception(() => new WASI({ preopens: { '/file': new MemoryFile('x') } }), /INVALID_PREOPEN/)
})

test('an instance can only be started once', (t) => {
  const wasi = new WASI()
  const instance = instantiate('exit', wasi)

  wasi.start(instance)

  t.exception(() => wasi.start(instance), /ALREADY_STARTED/)
})

function instantiate(name, wasi) {
  return new WebAssembly.Instance(new WebAssembly.Module(fixtures[name]), wasi.getImportObject())
}

function run(name, opts = {}) {
  const stdout = []
  const stderr = []

  const wasi = new WASI({
    stdout: (data) => stdout.push(data),
    stderr: (data) => stderr.push(data),
    ...opts
  })

  const code = wasi.start(instantiate(name, wasi))

  return {
    code,
    stdout: Buffer.concat(stdout).toString(),
    stderr: Buffer.concat(stderr).toString()
  }
}

function initialize(opts) {
  const wasi = new WASI(opts)
  const memory = new WebAssembly.Memory({ initial: 1 })

  wasi.initialize({ exports: { memory } })

  return { wasi, memory }
}

function write(memory, ptr, string) {
  const bytes = Buffer.from(string)
  new Uint8Array(memory.buffer).set(bytes, ptr)
  return bytes.byteLength
}

require('./test/suite')
