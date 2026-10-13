import { DirectorySync } from 'bare-directory'
import { WASIDirectory } from '..'

/**
 * A host directory backed by a `bare-directory` capability. The guest reaches
 * only what the capability reaches, with its rights, and `bare-wasi` resolves
 * symbolic links within the preopen. On Windows, link targets use `/` as the
 * separator and drive letter, UNC, and device paths are absolute.
 *
 * Files are opened when looked up, with the most access the rights and the file
 * allow, so an open file stays the same file if it's renamed. Creating symbolic
 * and hard links isn't supported, and renaming into a directory of another
 * backend fails with `EXDEV`.
 */
declare class HostDirectory implements WASIDirectory {
  /**
   * @param directory - The `bare-directory` capability to expose to the guest.
   */
  constructor(directory: DirectorySync)

  readonly type: 'directory'
  readonly size: number

  stat: WASIDirectory['stat']
  setTimes: NonNullable<WASIDirectory['setTimes']>
  lookup: WASIDirectory['lookup']
  entries: WASIDirectory['entries']
  create: WASIDirectory['create']
  unlink: WASIDirectory['unlink']
  rmdir: WASIDirectory['rmdir']
  rename: WASIDirectory['rename']
}

export { HostDirectory }
