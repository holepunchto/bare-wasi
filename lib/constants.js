const errno = [
  'SUCCESS',
  '2BIG',
  'ACCES',
  'ADDRINUSE',
  'ADDRNOTAVAIL',
  'AFNOSUPPORT',
  'AGAIN',
  'ALREADY',
  'BADF',
  'BADMSG',
  'BUSY',
  'CANCELED',
  'CHILD',
  'CONNABORTED',
  'CONNREFUSED',
  'CONNRESET',
  'DEADLK',
  'DESTADDRREQ',
  'DOM',
  'DQUOT',
  'EXIST',
  'FAULT',
  'FBIG',
  'HOSTUNREACH',
  'IDRM',
  'ILSEQ',
  'INPROGRESS',
  'INTR',
  'INVAL',
  'IO',
  'ISCONN',
  'ISDIR',
  'LOOP',
  'MFILE',
  'MLINK',
  'MSGSIZE',
  'MULTIHOP',
  'NAMETOOLONG',
  'NETDOWN',
  'NETRESET',
  'NETUNREACH',
  'NFILE',
  'NOBUFS',
  'NODEV',
  'NOENT',
  'NOEXEC',
  'NOLCK',
  'NOLINK',
  'NOMEM',
  'NOMSG',
  'NOPROTOOPT',
  'NOSPC',
  'NOSYS',
  'NOTCONN',
  'NOTDIR',
  'NOTEMPTY',
  'NOTRECOVERABLE',
  'NOTSOCK',
  'NOTSUP',
  'NOTTY',
  'NXIO',
  'OVERFLOW',
  'OWNERDEAD',
  'PERM',
  'PIPE',
  'PROTO',
  'PROTONOSUPPORT',
  'PROTOTYPE',
  'RANGE',
  'ROFS',
  'SPIPE',
  'SRCH',
  'STALE',
  'TIMEDOUT',
  'TXTBSY',
  'XDEV',
  'NOTCAPABLE'
]

exports.errno = Object.fromEntries(errno.map((name, value) => [name, value]))

exports.filetype = {
  UNKNOWN: 0,
  BLOCK_DEVICE: 1,
  CHARACTER_DEVICE: 2,
  DIRECTORY: 3,
  REGULAR_FILE: 4,
  SOCKET_DGRAM: 5,
  SOCKET_STREAM: 6,
  SYMBOLIC_LINK: 7
}

exports.clockid = {
  REALTIME: 0,
  MONOTONIC: 1,
  PROCESS_CPUTIME_ID: 2,
  THREAD_CPUTIME_ID: 3
}

exports.whence = {
  SET: 0,
  CUR: 1,
  END: 2
}

exports.oflags = {
  CREAT: 1,
  DIRECTORY: 2,
  EXCL: 4,
  TRUNC: 8
}

exports.fdflags = {
  APPEND: 1,
  DSYNC: 2,
  NONBLOCK: 4,
  RSYNC: 8,
  SYNC: 16
}

exports.lookupflags = {
  SYMLINK_FOLLOW: 1
}

exports.fstflags = {
  ATIM: 1,
  ATIM_NOW: 2,
  MTIM: 4,
  MTIM_NOW: 8
}

exports.rights = {
  FD_DATASYNC: 1n << 0n,
  FD_READ: 1n << 1n,
  FD_SEEK: 1n << 2n,
  FD_FDSTAT_SET_FLAGS: 1n << 3n,
  FD_SYNC: 1n << 4n,
  FD_TELL: 1n << 5n,
  FD_WRITE: 1n << 6n,
  FD_ADVISE: 1n << 7n,
  FD_ALLOCATE: 1n << 8n,
  PATH_CREATE_DIRECTORY: 1n << 9n,
  PATH_CREATE_FILE: 1n << 10n,
  PATH_LINK_SOURCE: 1n << 11n,
  PATH_LINK_TARGET: 1n << 12n,
  PATH_OPEN: 1n << 13n,
  FD_READDIR: 1n << 14n,
  PATH_READLINK: 1n << 15n,
  PATH_RENAME_SOURCE: 1n << 16n,
  PATH_RENAME_TARGET: 1n << 17n,
  PATH_FILESTAT_GET: 1n << 18n,
  PATH_FILESTAT_SET_SIZE: 1n << 19n,
  PATH_FILESTAT_SET_TIMES: 1n << 20n,
  FD_FILESTAT_GET: 1n << 21n,
  FD_FILESTAT_SET_SIZE: 1n << 22n,
  FD_FILESTAT_SET_TIMES: 1n << 23n,
  PATH_SYMLINK: 1n << 24n,
  PATH_REMOVE_DIRECTORY: 1n << 25n,
  PATH_UNLINK_FILE: 1n << 26n,
  POLL_FD_READWRITE: 1n << 27n,
  SOCK_SHUTDOWN: 1n << 28n,
  SOCK_ACCEPT: 1n << 29n
}

exports.eventtype = {
  CLOCK: 0,
  FD_READ: 1,
  FD_WRITE: 2
}

exports.subclockflags = {
  SUBSCRIPTION_CLOCK_ABSTIME: 1
}

exports.preopentype = {
  DIR: 0
}
