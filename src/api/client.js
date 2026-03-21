import { ApiError } from "./errors";

const API_BASE = "/api/hearthstudio/v1";

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const {
    method = "GET",
    headers,
    body,
    timeout = 15000
  } = options;

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(headers || {})
      },
      body,
      signal: controller.signal,
      credentials: "include"
    });

    const data = await parseJsonSafe(res);

    if (!res.ok) {
      throw new ApiError("Request failed", {
        status: res.status,
        data,
        url
      });
    }

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError("Request timeout", { url });
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError("Network error", { url });
  } finally {
    clearTimeout(timer);
  }
}
