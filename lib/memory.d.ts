import { WASIDirectory, WASIFile, WASINode, WASINodeStat, WASISymlink } from '..'

/**
 * The initial entries of a `MemoryDirectory`, where strings and buffers become
 * files and plain objects become directories.
 */
type MemoryEntries = { [name: string]: string | Uint8Array | MemoryNode | MemoryEntries }

/** A node of an in-memory filesystem. */
declare class MemoryNode implements WASINode {
  /** The type of the node. */
  readonly type: 'file' | 'directory' | 'symlink'

  /**
   * The size of the node: the length in bytes of a file or of the target of a
   * symbolic link, and the number of entries of a directory.
   */
  readonly size: number

  /** Get the metadata of the node. */
  stat(): WASINodeStat

  /**
   * Set the access and modification times of the node.
   * @param atime - The time of last access in nanoseconds since the Unix
   * epoch, or `undefined` to leave it unchanged.
   * @param mtime - The time of last modification in nanoseconds since the Unix
   * epoch, or `undefined` to leave it unchanged.
   */
  setTimes(atime: bigint | undefined, mtime: bigint | undefined): void
}

/** A regular file held in memory. */
declare class MemoryFile extends MemoryNode implements WASIFile {
  /** The type of the node, which is always `'file'`. */
  readonly type: 'file'

  /** The contents of the file, as a view that is invalidated by the next write. */
  readonly data: Uint8Array

  /**
   * Create a file.
   * @param data - The initial contents of the file, which are copied. Defaults to an empty file.
   */
  constructor(data?: string | Uint8Array)

  /**
   * Read from the file into `buffer`, returning the number of bytes read.
   * @param buffer - The buffer to read into.
   * @param position - The byte offset to read from.
   */
  read(buffer: Uint8Array, position: number): number

  /**
   * Write `buffer` to the file, extending it as needed, and return the number of bytes written.
   * @param buffer - The data to write.
   * @param position - The byte offset to write at.
   */
  write(buffer: Uint8Array, position: number): number

  /**
   * Shorten or extend the file to `size` bytes, filling any extension with zeros.
   * @param size - The new size of the file in bytes.
   */
  truncate(size: number): void
}

/** A symbolic link held in memory. */
declare class MemorySymlink extends MemoryNode implements WASISymlink {
  /** The type of the node, which is always `'symlink'`. */
  readonly type: 'symlink'

  /** The path the link points at. */
  readonly target: string

  /**
   * Create a symbolic link.
   * @param target - The path the link points at.
   */
  constructor(target: string)
}

/** A directory held in memory. */
declare class MemoryDirectory extends MemoryNode implements WASIDirectory {
  /** The type of the node, which is always `'directory'`. */
  readonly type: 'directory'

  /**
   * Create a directory.
   * @param entries - The initial entries of the directory. Defaults to an empty directory.
   */
  constructor(entries?: MemoryEntries)

  /**
   * Look up an entry of the directory.
   * @param name - The name of the entry.
   * @returns The entry, or `null` if there is none by that name.
   */
  lookup(name: string): MemoryNode | null

  /** Iterate the entries of the directory as pairs of names and nodes. */
  entries(): IterableIterator<[string, MemoryNode]>

  /**
   * Create an entry in the directory, throwing `EEXIST` if one by that name already exists.
   * @param name - The name of the entry.
   * @param type - The type of node to create.
   * @returns The created node.
   */
  create(name: string, type: 'file' | 'directory'): MemoryFile | MemoryDirectory

  /**
   * Remove an entry that is not a directory, throwing `ENOENT` if there is none by that name and
   * `EISDIR` if it is a directory.
   * @param name - The name of the entry.
   */
  unlink(name: string): void

  /**
   * Remove an empty directory, throwing `ENOENT` if there is none by that name, `ENOTDIR` if it is
   * not a directory, and `ENOTEMPTY` if it has entries.
   * @param name - The name of the entry.
   */
  rmdir(name: string): void

  /**
   * Move an entry, replacing any entry of the same type at the target. Throws `ENOTEMPTY` if the
   * entry it would replace is a directory with entries, and `EXDEV` if `directory` is not a
   * `MemoryDirectory`.
   * @param name - The name of the entry to move.
   * @param directory - The directory to move it to, which may be this one.
   * @param target - The name to give it in `directory`.
   */
  rename(name: string, directory: MemoryDirectory, target: string): void

  /**
   * Create a symbolic link in the directory, throwing `EEXIST` if an entry by that name already
   * exists.
   * @param name - The name of the link.
   * @param target - The path the link points at.
   * @returns The created link.
   */
  symlink(name: string, target: string): MemorySymlink

  /**
   * Add another name for an existing node that is not a directory, throwing `EEXIST` if an entry
   * by that name already exists and `EPERM` if `node` is a directory.
   * @param name - The name of the new entry.
   * @param node - The node to link to.
   */
  link(name: string, node: MemoryNode): void
}

export { MemoryNode, MemoryFile, MemorySymlink, MemoryDirectory }
