import { requestJson, DEFAULT_BASE_URL } from "./base";
import { getJson, setJson } from "../utils/storage";

const CACHE_SOFT_TTL_MS = 24 * 60 * 60 * 1000;
const BACKGROUND_REFRESH_AGE_MS = 60 * 60 * 1000;
const inflight = new Map();

function cacheKey(baseUrl) {
  return `openapi:${baseUrl}`;
}

function validateSchema(schema) {
  if (!schema || typeof schema !== "object" || !schema.paths) {
    throw new Error("Backend OpenAPI response is invalid.");
  }
}

async function fetchAndCache(baseUrl) {
  const now = Date.now();
  const res = await requestJson({
    baseUrl,
    path: "/openapi.json",
    method: "GET",
    retries: 1,
  });

  validateSchema(res.data);
  setJson(cacheKey(baseUrl), {
    schema: res.data,
    savedAt: now,
  });
  return res.data;
}

function revalidate(baseUrl) {
  const key = String(baseUrl || DEFAULT_BASE_URL);
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const task = fetchAndCache(key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}

export async function fetchOpenApi(baseUrl = DEFAULT_BASE_URL, { force = false } = {}) {
  const key = cacheKey(baseUrl);
  const cached = getJson(key, null);
  const now = Date.now();
  const hasCachedSchema = Boolean(cached?.schema);

  if (!force && hasCachedSchema) {
    const age = now - Number(cached.savedAt || 0);

    if (age > BACKGROUND_REFRESH_AGE_MS) {
      void revalidate(baseUrl).catch(() => {
        // Keep stale schema usable even if background refresh fails.
      });
    }

    if (age < CACHE_SOFT_TTL_MS) {
      return cached.schema;
    }

    return cached.schema;
  }

  return revalidate(baseUrl);
}

