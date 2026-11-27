const DEFAULT_TIMEOUT_MS = 20000;

export class ApiError extends Error {
  constructor(message, { status = 0, payload = null, cause } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    // Keep response metadata available to callers instead of discarding it.
    this.meta = payload && payload.meta != null ? payload.meta : null;
    if (cause) this.cause = cause;
  }
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("服务器响应格式错误", {
      status: response.status,
      cause: new SyntaxError("Invalid JSON response"),
    });
  }
}

/** The single fetch boundary for frontend API calls. */
export async function apiRequest(path, { method = "GET", body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    let response;
    try {
      response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        const error = new Error("Request aborted");
        error.name = "AbortError";
        throw error;
      }
      throw new ApiError("网络错误，请稍后重试", { cause });
    }

    const payload = await readResponse(response);
    if (!response.ok || payload?.ok === false) {
      throw new ApiError(payload?.error || payload?.message || `请求失败（HTTP ${response.status}）`, {
        status: response.status,
        payload,
      });
    }
    return payload;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortFromCaller);
  }
}

export function apiGet(path, options) {
  return apiRequest(path, { ...options, method: "GET" });
}

export function apiPost(path, body, options) {
  return apiRequest(path, { ...options, method: "POST", body });
}
