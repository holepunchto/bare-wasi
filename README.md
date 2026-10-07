# bare-wasi

Capability based WASI for JavaScript. Implements WASI preview 1 for WebAssembly instances, where a guest is granted nothing by default and can only reach the streams, directories, clocks, and randomness it is handed.

```
npm i bare-wasi
```

## Usage

```js
const WASI = require('bare-wasi')
const { MemoryDirectory } = require('bare-wasi/memory')

const wasi = new WASI({
  args: ['program'],
  preopens: {
    '/data': new MemoryDirectory({ 'hello.txt': 'Hello from JavaScript' })
  },
  stdout: (data) => console.log(data.toString())
})

const module = new WebAssembly.Module(bytes)
const instance = new WebAssembly.Instance(module, wasi.getImportObject())

const exitCode = wasi.start(instance)
```

## Capabilities

Every resource a guest can reach is passed in by the embedder:

- **Streams.** Standard input, output, and error exist only if `stdin`, `stdout`, and `stderr` are given.
- **Directories.** A guest can only reach the directories given as `preopens`, and paths are resolved by `bare-wasi` itself, one name at a time. Absolute paths, symbolic links that point outside of a directory, and `..` beyond where a lookup started all fail with `ENOTCAPABLE`.
- **Clocks.** Clocks are available by default, as they are to any JavaScript, and can be denied with `clock: null`.
- **Randomness.** `random_get` fails with `ENOTCAPABLE` unless a `random` function is given.

Beyond these, a guest only sees the arguments and environment variables it is given. There are no sockets.

## Conformance

`bare-wasi` passes the WASI preview 1 tests of the [WASI test suite](https://github.com/WebAssembly/wasi-testsuite), which are fetched at a pinned commit and run as part of `npm test`. Tests that are known to fail are listed with the reason in [`test/suite.json`](test/suite.json), and a listed test that starts passing fails the run.

## Backends

Preopens are backed by objects implementing a small, synchronous interface. Directories are only ever asked about a single name, never a path, which keeps the resolution of paths, and so the enforcement of capabilities, in one place. Failures are reported by throwing errors with a POSIX `code`, such as `'ENOENT'`. See [`index.d.ts`](index.d.ts) for the interface.

### In memory

```js
const { MemoryDirectory, MemoryFile, MemorySymlink } = require('bare-wasi/memory')

const directory = new MemoryDirectory({
  'file.txt': 'contents',
  nested: { 'data.bin': new Uint8Array([1, 2, 3]) }
})
```

## License

Apache-2.0
