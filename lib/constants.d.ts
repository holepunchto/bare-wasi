/** The constants of WASI preview 1, keyed by their names in the specification. */
declare const constants: {
  /** Error codes, such as `errno.NOENT`. */
  errno: Record<string, number>
  /** The types of file descriptors and filesystem nodes. */
  filetype: Record<string, number>
  /** Clock identifiers. */
  clockid: Record<string, number>
  /** The positions an offset passed to `fd_seek` is relative to. */
  whence: Record<string, number>
  /** Flags of `path_open`, such as `oflags.CREAT`. */
  oflags: Record<string, number>
  /** Flags of file descriptors, such as `fdflags.APPEND`. */
  fdflags: Record<string, number>
  /** Flags that control how paths are looked up. */
  lookupflags: Record<string, number>
  /** Flags of `fd_filestat_set_times` and `path_filestat_set_times`. */
  fstflags: Record<string, number>
  /** The rights of file descriptors, such as `rights.FD_READ`. */
  rights: Record<string, bigint>
  /** The types of events reported by `poll_oneoff`. */
  eventtype: Record<string, number>
  /** Flags of clock subscriptions passed to `poll_oneoff`. */
  subclockflags: Record<string, number>
  /** The types of preopened resources. */
  preopentype: Record<string, number>
}

export = constants
