class ApiResponse {
    constructor(success, message, data = null) {
        this.success = success;
        this.message = message;
        this.data = data;
        this.statusCode = this.statusCode || (success ? 200 : 400);
    }
}

export { ApiResponse };