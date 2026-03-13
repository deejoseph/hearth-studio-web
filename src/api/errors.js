export class ApiError extends Error {
  constructor(message, { status, data, url } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status ?? 0;
    this.data = data ?? null;
    this.url = url ?? "";
  }
}
