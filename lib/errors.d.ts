/** An error thrown when the API of `bare-wasi` is misused, as opposed to an error of the guest. */
declare class WASIError extends Error {
  /** The error code, such as `'ALREADY_STARTED'`. */
  readonly code: string

  /**
   * Construct a `WASIError` with the given message and `code`.
   * @param msg - Human-readable error message.
   * @param code - The error code, assigned to `err.code`.
   * @param fn - The function to omit from the captured stack trace (default the `WASIError`
   * constructor).
   */
  constructor(msg: string, code: string, fn?: WASIError)

  /**
   * Create a `WASIError` with code `'ALREADY_STARTED'`, for an implementation used with a second
   * instance.
   * @param msg - Human-readable error message.
   */
  static ALREADY_STARTED(msg: string): WASIError
  /**
   * Create a `WASIError` with code `'MISSING_EXPORT'`, for an instance lacking a required export.
   * @param msg - Human-readable error message.
   */
  static MISSING_EXPORT(msg: string): WASIError
  /**
   * Create a `WASIError` with code `'UNEXPECTED_EXPORT'`, for a command instance that is
   * initialized or a reactor instance that is started.
   * @param msg - Human-readable error message.
   */
  static UNEXPECTED_EXPORT(msg: string): WASIError
  /**
   * Create a `WASIError` with code `'INVALID_PREOPEN'`, for a preopen that is not a directory.
   * @param msg - Human-readable error message.
   */
  static INVALID_PREOPEN(msg: string): WASIError
}

export = WASIError
