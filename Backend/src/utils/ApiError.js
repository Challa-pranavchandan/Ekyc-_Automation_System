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
        this.success = false;
        this.errors = error;

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

export { ApiError };