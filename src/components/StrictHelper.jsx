import React, { useCallback, useEffect, useMemo, useState } from "react";

const STRICT_META_KEY = "strict_helper_meta";
const STRICT_INTERVAL_KEY = "strict_helper_interval_ms";
const DEFAULT_INTERVAL_MS = 45 * 60 * 1000;

function nowTs() {
  return Date.now();
}

function readMeta() {
  try {
    const raw = window.localStorage.getItem(`vocab_ui:${STRICT_META_KEY}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveMeta(meta) {
  try {
    window.localStorage.setItem(`vocab_ui:${STRICT_META_KEY}`, JSON.stringify(meta));
  } catch (_) {
    // ignore
  }
}

function clearMeta() {
  try {
    window.localStorage.removeItem(`vocab_ui:${STRICT_META_KEY}`);
  } catch (_) {
    // ignore
  }
}

function readIntervalMs() {
  try {
    const raw = window.localStorage.getItem(`vocab_ui:${STRICT_INTERVAL_KEY}`);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_INTERVAL_MS;
    return parsed;
  } catch (_) {
    return DEFAULT_INTERVAL_MS;
  }
}

function saveIntervalMs(value) {
  try {
    window.localStorage.setItem(`vocab_ui:${STRICT_INTERVAL_KEY}`, String(value));
  } catch (_) {
    // ignore
  }
}

function formatRemaining(ms) {
  const safe = Math.max(0, Number(ms || 0));
  const totalSec = Math.floor(safe / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StrictHelper() {
  const [running, setRunning] = useState(false);
  const [nextAt, setNextAt] = useState(0);
  const [intervalMs, setIntervalMs] = useState(() => readIntervalMs());

  const appUrl = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?forceStudyLock=1#home`;
  }, []);

  const startStrict = () => {
    const next = nowTs() + intervalMs;
    setRunning(true);
    setNextAt(next);
    saveIntervalMs(intervalMs);
    saveMeta({
      running: true,
      intervalMs,
      nextAt: next,
    });
  };

  const stopStrict = () => {
    setRunning(false);
    setNextAt(0);
    clearMeta();
  };

  const triggerStudy = useCallback(() => {
    const newNext = nowTs() + intervalMs;
    setNextAt(newNext);
    saveIntervalMs(intervalMs);
    saveMeta({
      running: true,
      intervalMs,
      nextAt: newNext,
    });

    const opened = window.open(appUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      // Popup may be blocked when no direct user gesture.
      // Fallback: use current helper tab itself to force study mode.
      window.location.href = appUrl;
    }
  }, [appUrl, intervalMs]);

  useEffect(() => {
    const meta = readMeta();
    const storedInterval = Number(meta?.intervalMs || readIntervalMs() || DEFAULT_INTERVAL_MS);
    const storedNextAt = Number(meta.nextAt || 0);
    setIntervalMs(storedInterval);
    if (!meta?.running) return;
    setRunning(true);
    setNextAt(storedNextAt || nowTs() + storedInterval);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      if (!nextAt) return;
      if (nowTs() >= nextAt) {
        triggerStudy();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, nextAt, triggerStudy]);

  const intervalMinutes = Math.max(5, Math.min(240, Math.round(intervalMs / 60000)));

  const applyIntervalMinutes = (minutesValue) => {
    const mRaw = Number(minutesValue);
    const m = Number.isFinite(mRaw) ? Math.max(5, Math.min(240, mRaw)) : 45;
    const nextInterval = m * 60 * 1000;
    setIntervalMs(nextInterval);
    saveIntervalMs(nextInterval);

    if (running) {
      const next = nowTs() + nextInterval;
      setNextAt(next);
      saveMeta({
        running: true,
        intervalMs: nextInterval,
        nextAt: next,
      });
    }
  };

  return (
    <main className="strict-helper-shell">
      <section className="strict-helper-card">
        <h1>Strict Study Mode</h1>
        <p>This tab will force a vocabulary check every 45 minutes.</p>

        <div className="strict-helper-status">
          <span className={`status-chip ${running ? "warn" : "ok"}`}>
            {running ? "Running" : "Stopped"}
          </span>
          <strong>{running ? formatRemaining(nextAt - nowTs()) : "--:--"}</strong>
        </div>

        <div className="strict-helper-actions">
          <label className="muted" htmlFor="strict-minutes">Interval (minutes)</label>
          <input
            id="strict-minutes"
            type="number"
            min="5"
            max="240"
            step="5"
            value={intervalMinutes}
            onChange={(e) => applyIntervalMinutes(e.target.value)}
            style={{ width: 100 }}
          />
        </div>

        <div className="strict-helper-actions">
          <button type="button" className="btn primary" onClick={startStrict} disabled={running}>
            Start strict mode
          </button>
          <button type="button" className="btn danger" onClick={stopStrict} disabled={!running}>
            Stop
          </button>
          <button type="button" className="btn" onClick={triggerStudy}>
            Test now
          </button>
        </div>

        <p className="muted">
          Keep this helper tab open. If popup is blocked, this tab will switch to the study screen directly.
        </p>
      </section>
    </main>
  );
}
