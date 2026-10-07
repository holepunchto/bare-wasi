module.exports = class WASIError extends Error {
  constructor(msg, code, fn = WASIError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'WASIError'
  }

  static ALREADY_STARTED(msg) {
    return new WASIError(msg, 'ALREADY_STARTED', WASIError.ALREADY_STARTED)
  }

  static MISSING_EXPORT(msg) {
    return new WASIError(msg, 'MISSING_EXPORT', WASIError.MISSING_EXPORT)
  }

  static UNEXPECTED_EXPORT(msg) {
    return new WASIError(msg, 'UNEXPECTED_EXPORT', WASIError.UNEXPECTED_EXPORT)
  }

  static INVALID_PREOPEN(msg) {
    return new WASIError(msg, 'INVALID_PREOPEN', WASIError.INVALID_PREOPEN)
  }
}
