import { requestJson, DEFAULT_BASE_URL } from "./base";
import { getJson, setJson } from "../utils/storage";

const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(baseUrl) {
  return `openapi:${baseUrl}`;
}

export async function fetchOpenApi(baseUrl = DEFAULT_BASE_URL, { force = false } = {}) {
  const key = cacheKey(baseUrl);
  const cached = getJson(key, null);
  const now = Date.now();

  if (!force && cached && cached.schema && now - cached.savedAt < CACHE_TTL_MS) {
    return cached.schema;
  }

  const res = await requestJson({
    baseUrl,
    path: "/openapi.json",
    method: "GET",
    retries: 1,
  });

  if (!res.data || typeof res.data !== "object" || !res.data.paths) {
    throw new Error("OpenAPI t峄?backend kh么ng h峄 l峄?");
  }

  setJson(key, {
    schema: res.data,
    savedAt: now,
  });

  return res.data;
}
