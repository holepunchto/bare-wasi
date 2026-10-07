const { test, hook } = require('brittle')
const fs = require('bare-fs')
const path = require('bare-path')
const fetch = require('bare-fetch')
const zlib = require('bare-zlib')
const tar = require('tar-stream')
const WASI = require('..')
const { MemoryDirectory, MemoryFile, MemorySymlink } = require('../lib/memory')
const expectations = require('./suite.json')

const commit = 'e0aa527fab67f2f311882bcee4f62cc755433b73'

const root = path.join(__dirname, 'suite')

const suites = ['assemblyscript', 'c', 'rust'].map((language) => ({
  language,
  directory: `tests/${language}/testsuite/wasm32-wasip1`
}))

hook('fetch the WASI test suite', { timeout: 5 * 60 * 1000 }, async () => {
  const marker = path.join(root, '.commit')

  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === commit) return

  fs.rmSync(root, { recursive: true, force: true })

  await download(`https://github.com/WebAssembly/wasi-testsuite/archive/${commit}.tar.gz`)

  fs.writeFileSync(marker, commit)
})

test('WASI test suite', async (t) => {
  for (const { language, directory } of suites) {
    const tests = path.join(root, directory)

    for (const file of fs.readdirSync(tests).sort()) {
      if (path.extname(file) !== '.wasm') continue

      const name = `${language}/${path.basename(file, '.wasm')}`
      const spec = path.join(tests, path.basename(file, '.wasm') + '.json')

      const config = fs.existsSync(spec) ? JSON.parse(fs.readFileSync(spec)) : {}

      await t.test(name, (t) => {
        const failures = run(path.join(tests, file), config)
        const reason = expectations[name]

        if (reason === undefined) {
          t.alike(failures, [], failures.join('\n'))
        } else {
          t.ok(failures.length > 0, `expected to fail, as ${reason}`)
        }
      })
    }
  }
})

// Mirrors how the upstream runner treats a legacy test.
function run(file, config) {
  const {
    args = [],
    env = {},
    root = null,
    stdout = null,
    stderr = null,
    exit_code: expected = 0
  } = config

  const output = { stdout: [], stderr: [] }

  const wasi = new WASI({
    args: [path.basename(file), ...args],
    env,
    preopens: root === null ? {} : { '/': load(path.join(path.dirname(file), root)) },
    stdin: new Uint8Array(0),
    stdout: (data) => output.stdout.push(data),
    stderr: (data) => output.stderr.push(data),
    random: (buffer) => {
      for (let i = 0; i < buffer.byteLength; i++) buffer[i] = Math.floor(Math.random() * 256)
    }
  })

  const failures = []

  let code

  try {
    const module = new WebAssembly.Module(fs.readFileSync(file))
    code = wasi.start(new WebAssembly.Instance(module, wasi.getImportObject()))
  } catch (err) {
    failures.push(`threw ${err.stack || err}`)
  }

  const actual = {
    stdout: Buffer.concat(output.stdout).toString(),
    stderr: Buffer.concat(output.stderr).toString()
  }

  if (code !== undefined && code !== expected) {
    failures.push(`exited with ${code}, expected ${expected}`)
  }

  if (stdout !== null && !actual.stdout.startsWith(stdout)) {
    failures.push(`stdout did not start with ${JSON.stringify(stdout)}`)
  }

  if (stderr !== null && !actual.stderr.startsWith(stderr)) {
    failures.push(`stderr did not start with ${JSON.stringify(stderr)}`)
  }

  if (failures.length > 0) {
    if (actual.stdout) failures.push(`stdout: ${actual.stdout.trim()}`)
    if (actual.stderr) failures.push(`stderr: ${actual.stderr.trim()}`)
  }

  return failures
}

function load(directory) {
  const entries = {}

  for (const name of fs.readdirSync(directory)) {
    const entry = path.join(directory, name)
    const stat = fs.lstatSync(entry)

    if (stat.isSymbolicLink()) entries[name] = new MemorySymlink(fs.readlinkSync(entry))
    else if (stat.isDirectory()) entries[name] = load(entry)
    else entries[name] = new MemoryFile(fs.readFileSync(entry))
  }

  return new MemoryDirectory(entries)
}

async function download(url) {
  const response = await fetch(url)

  if (!response.ok) throw new Error(`Fetching ${url} failed with status ${response.status}`)

  const gunzip = zlib.createGunzip()
  const extract = tar.extract()

  const finished = new Promise((resolve, reject) => {
    gunzip.on('error', reject)
    extract.on('error', reject).on('finish', resolve)
  })

  extract.on('entry', (header, stream, next) => {
    const name = header.name.slice(header.name.indexOf('/') + 1)
    const wanted =
      name === 'LICENSE' || suites.some(({ directory }) => name.startsWith(directory + '/'))

    if (!wanted || header.type !== 'file' || name.split('/').includes('..')) {
      stream.on('end', next).resume()
      return
    }

    const chunks = []

    stream
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        const target = path.join(root, name)

        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, Buffer.concat(chunks))

        next()
      })
  })

  gunzip.pipe(extract)

  const reader = response.body.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    gunzip.write(value)
  }

  gunzip.end()

  await finished
}
