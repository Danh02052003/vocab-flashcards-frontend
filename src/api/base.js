export const DEFAULT_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8000").trim();

export class ApiError extends Error {
  constructor(message, { status, data, url, method } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.url = url;
    this.method = method;
  }
}

export function normalizeBaseUrl(baseUrl) {
  const url = String(baseUrl || DEFAULT_BASE_URL || "http://localhost:8000").trim();
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function buildUrl(baseUrl, path, query) {
  const root = normalizeBaseUrl(baseUrl);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${root}${cleanPath}`);

  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

function extractErrorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return JSON.stringify(data.detail);
  if (typeof data.message === "string") return data.message;
  return fallback;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function requestJson({
  baseUrl = DEFAULT_BASE_URL,
  path,
  method = "GET",
  query,
  body,
  headers,
  signal,
  retries = 0,
  retryDelayMs = 300,
}) {
  const url = buildUrl(baseUrl, path, query);
  const hasBody = body !== undefined;

  const attempt = async () => {
    const response = await fetch(url, {
      method,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(headers || {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }

    if (!response.ok) {
      throw new ApiError(extractErrorMessage(data, `HTTP ${response.status}`), {
        status: response.status,
        data,
        url,
        method,
      });
    }

    return {
      status: response.status,
      data,
      headers: response.headers,
      url,
    };
  };

  let lastError = null;
  const maxAttempts = Math.max(1, Number(retries) + 1);

  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
      const canRetry = i < maxAttempts - 1 && (!(error instanceof ApiError) || error.status >= 500);
      if (!canRetry) break;
      await sleep(retryDelayMs * (i + 1));
    }
  }

  throw lastError;
}
