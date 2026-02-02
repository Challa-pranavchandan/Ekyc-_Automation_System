class ApiError extends Error {
  constructor(statusCode,
     message,
     error = [],
     stack = ""
    ) {
    super(message)
    this.statusCode = statusCode;
    this.date = null;
    this.message = message;
    this.succsess = false;
    this.errors = errors;

    if(stack) {
        this.stack = stack;
    } else {
        Error.captureStackTrace(this, this.constructor);
    } }
}

export {ApiError};