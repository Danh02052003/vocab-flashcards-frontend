const PREFIX = "vocab_ui";

function keyOf(key) {
  return `${PREFIX}:${key}`;
}

export function getJson(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(keyOf(key));
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function setJson(key, value) {
  try {
    window.localStorage.setItem(keyOf(key), JSON.stringify(value));
  } catch (_) {
    // ignore storage failures
  }
}

export function removeKey(key) {
  try {
    window.localStorage.removeItem(keyOf(key));
  } catch (_) {
    // ignore storage failures
  }
}
