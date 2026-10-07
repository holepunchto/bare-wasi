import constants from './lib/constants'
import WASIError from './lib/errors'

/** The metadata of a filesystem node. */
interface WASINodeStat {
  /** The inode number, which identifies the node within its backend. */
  ino: bigint
  /** The number of hard links to the node. */
  nlink: bigint
  /** The size of the node in bytes. */
  size: bigint
  /** The time of last access in nanoseconds since the Unix epoch. */
  atime: bigint
  /** The time of last modification in nanoseconds since the Unix epoch. */
  mtime: bigint
  /** The time of last status change in nanoseconds since the Unix epoch. */
  ctime: bigint
}

/**
 * A node of a filesystem backend. Backends are synchronous and report failures
 * by throwing errors whose `code` is a POSIX error name, such as `'ENOENT'`,
 * which is passed on to the guest as the corresponding WASI error.
 */
interface WASINode {
  /** The type of the node. */
  readonly type: 'file' | 'directory' | 'symlink' | 'character-device'

  /**
   * The size of the node: the length in bytes of a file or of the target of a
   * symbolic link, and the number of entries of a directory.
   */
  readonly size: number

  /** Get the metadata of the node. */
  stat(): WASINodeStat

  /**
   * Set the access and modification times of the node. Leave this out if the
   * backend does not support changing them, in which case the guest is told
   * `ENOTSUP`.
   * @param atime - The time of last access in nanoseconds since the Unix
   * epoch, or `undefined` to leave it unchanged.
   * @param mtime - The time of last modification in nanoseconds since the Unix
   * epoch, or `undefined` to leave it unchanged.
   */
  setTimes?(atime: bigint | undefined, mtime: bigint | undefined): void
}

/** A regular file of a filesystem backend. */
interface WASIFile extends WASINode {
  /** The type of the node, which is always `'file'`. */
  readonly type: 'file'

  /**
   * Read from the file into `buffer`, returning the number of bytes read,
   * which is less than the length of `buffer` only at the end of the file.
   * @param buffer - The buffer to read into.
   * @param position - The byte offset to read from.
   */
  read(buffer: Uint8Array, position: number): number

  /**
   * Write `buffer` to the file, extending it as needed, and return the number
   * of bytes written.
   * @param buffer - The data to write.
   * @param position - The byte offset to write at.
   */
  write(buffer: Uint8Array, position: number): number

  /**
   * Shorten or extend the file to `size` bytes, filling any extension with
   * zeros.
   * @param size - The new size of the file in bytes.
   */
  truncate(size: number): void

  /** Flush the contents of the file to storage, if the backend has any. */
  sync?(): void
}

/** A symbolic link of a filesystem backend. */
interface WASISymlink extends WASINode {
  /** The type of the node, which is always `'symlink'`. */
  readonly type: 'symlink'

  /**
   * The path the link points at. Paths are only ever followed within the
   * directory a lookup started from, so a target that is absolute or that
   * climbs above that directory fails with `ENOTCAPABLE` when followed.
   */
  readonly target: string
}

/**
 * A directory of a filesystem backend. Every operation takes a single name
 * rather than a path, as paths are resolved by the WASI implementation itself.
 * Names are never empty, `.`, or `..`, and never contain `/` or NUL.
 */
interface WASIDirectory extends WASINode {
  /** The type of the node, which is always `'directory'`. */
  readonly type: 'directory'

  /**
   * Look up an entry of the directory.
   * @param name - The name of the entry.
   * @returns The entry, or `null` if there is none by that name.
   */
  lookup(name: string): WASINode | null

  /** Iterate the entries of the directory as pairs of names and nodes. */
  entries(): Iterable<[name: string, node: WASINode]>

  /**
   * Create an entry in the directory, throwing `EEXIST` if one by that name
   * already exists.
   * @param name - The name of the entry.
   * @param type - The type of node to create.
   * @returns The created node.
   */
  create(name: string, type: 'file' | 'directory'): WASIFile | WASIDirectory

  /**
   * Remove an entry that is not a directory, throwing `ENOENT` if there is
   * none by that name and `EISDIR` if it is a directory.
   * @param name - The name of the entry.
   */
  unlink(name: string): void

  /**
   * Remove an empty directory, throwing `ENOENT` if there is none by that
   * name, `ENOTDIR` if it is not a directory, and `ENOTEMPTY` if it has
   * entries.
   * @param name - The name of the entry.
   */
  rmdir(name: string): void

  /**
   * Move an entry, replacing any entry of the same type at the target. Throw
   * `ENOTEMPTY` if the entry it would replace is a directory with entries, and
   * `EXDEV` if `directory` belongs to another backend.
   * @param name - The name of the entry to move.
   * @param directory - The directory to move it to, which may be this one.
   * @param target - The name to give it in `directory`.
   */
  rename(name: string, directory: WASIDirectory, target: string): void

  /**
   * Create a symbolic link in the directory, throwing `EEXIST` if an entry by
   * that name already exists. Leave this out if the backend does not support
   * symbolic links, in which case the guest is told `ENOTSUP`.
   * @param name - The name of the link.
   * @param target - The path the link points at.
   * @returns The created link.
   */
  symlink?(name: string, target: string): WASISymlink

  /**
   * Add another name for an existing node that is not a directory, throwing
   * `EEXIST` if an entry by that name already exists. Leave this out if the
   * backend does not support hard links, in which case the guest is told
   * `ENOTSUP`.
   * @param name - The name of the new entry.
   * @param node - The node to link to.
   */
  link?(name: string, node: WASINode): void
}

/** A source of standard input. */
interface WASIReadable {
  /**
   * Synchronously read into `buffer`, returning the number of bytes read or
   * `0` at the end of input.
   * @param buffer - The buffer to read into.
   */
  read(buffer: Uint8Array): number
}

/** A destination of standard output or standard error. */
interface WASIWritable {
  /**
   * Write `data`, which is a copy that may be kept.
   * @param data - The data written by the guest.
   */
  write(data: Uint8Array): unknown
}

/** The clocks available to the guest. */
interface WASIClock {
  /** Get the number of nanoseconds since the Unix epoch. */
  realtime(): bigint

  /** Get the number of nanoseconds since an arbitrary point that never moves backwards. */
  monotonic(): bigint
}

/** The capabilities granted to an instance, none of which are granted by default except clocks. */
interface WASIOptions {
  /** The arguments of the program, including its name. Defaults to `[]`. */
  args?: string[]

  /** The environment variables of the program. Defaults to `{}`. */
  env?: Record<string, string>

  /**
   * The directories made available to the program, keyed by the path the
   * program sees each of them at. Defaults to `{}`.
   */
  preopens?: Record<string, WASIDirectory>

  /**
   * The standard input of the program, given as its contents, as a source to
   * read from, or as a file. Standard input does not exist if `null`, which is
   * the default.
   */
  stdin?: string | Uint8Array | WASIReadable | WASIFile | null

  /**
   * The standard output of the program, given as a function called with each
   * write, as a destination to write to, or as a file. Standard output does
   * not exist if `null`, which is the default.
   */
  stdout?: ((data: Uint8Array) => void) | WASIWritable | WASIFile | null

  /**
   * The standard error of the program, given in the same ways as `stdout`.
   * Standard error does not exist if `null`, which is the default.
   */
  stderr?: ((data: Uint8Array) => void) | WASIWritable | WASIFile | null

  /**
   * The clocks of the program, or `null` to deny access to clocks, which then
   * fail with `ENOTCAPABLE`. Defaults to the clocks of the host.
   */
  clock?: WASIClock | null

  /**
   * A function that fills `buffer` with cryptographically secure random bytes,
   * or `null` to deny access to randomness, which then fails with
   * `ENOTCAPABLE`. Defaults to `null`.
   */
  random?: ((buffer: Uint8Array) => void) | null

  /**
   * Whether `start()` returns the exit code of the program rather than
   * exiting the process with it. Defaults to `true`.
   */
  returnOnExit?: boolean
}

/** A WebAssembly instance, or anything with the same `exports`. */
interface WASIInstance {
  /** The exports of the instance, which must include its `memory`. */
  exports: WebAssembly.Exports
}

/**
 * A capability based implementation of WASI preview 1 for a single WebAssembly
 * instance. The instance can only reach the streams, directories, clocks, and
 * randomness it is given.
 */
declare class WASI {
  /**
   * Create a WASI implementation for a single instance.
   * @param opts - The capabilities of the instance.
   */
  constructor(opts?: WASIOptions)

  /** The functions of the `wasi_snapshot_preview1` import module. */
  readonly wasiImport: Record<string, (...args: any[]) => number>

  /** Get an import object to pass when instantiating a WebAssembly module. */
  getImportObject(): { wasi_snapshot_preview1: Record<string, (...args: any[]) => number> }

  /**
   * Run the `_start()` export of a command instance. The instance must export
   * its `memory` and must not export `_initialize()`, and an implementation
   * may only be used with a single instance.
   * @param instance - The instance to run.
   * @returns The exit code of the program, if `returnOnExit` is `true`. The
   * process is exited with it otherwise.
   */
  start(instance: WASIInstance): number | undefined

  /**
   * Initialize a reactor instance by calling its `_initialize()` export, if it
   * has one. The instance must export its `memory` and must not export
   * `_start()`, and an implementation may only be used with a single instance.
   * @param instance - The instance to initialize.
   */
  initialize(instance: WASIInstance): void
}

declare namespace WASI {
  export {
    type WASIOptions,
    type WASIInstance,
    type WASINode,
    type WASINodeStat,
    type WASIFile,
    type WASIDirectory,
    type WASISymlink,
    type WASIReadable,
    type WASIWritable,
    type WASIClock,
    constants,
    WASIError as errors
  }
}

export = WASI
