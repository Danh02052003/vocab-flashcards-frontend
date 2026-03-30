import React, { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeBaseUrl, DEFAULT_BASE_URL } from "./api/base";
import { fetchOpenApi } from "./api/openapi";
import { createApiClient } from "./api/client";
import { getJson, getText, removeKey, setJson, setText } from "./utils/storage";

import Nav from "./components/Nav";
import AuthPanel from "./components/AuthPanel";
import Toast from "./components/Toast";
import Spinner from "./components/Spinner";
import ErrorState from "./components/ErrorState";
import Onboarding from "./components/Onboarding";
import StudyLock from "./components/StudyLock";
import StrictHelper from "./components/StrictHelper";

import Home from "./pages/Home";
import Add from "./pages/Add";
import Review from "./pages/Review";
import List from "./pages/List";
import SyncPage from "./pages/Sync";
import Advanced from "./pages/Advanced";

import "./App.css";

const VALID_PAGES = ["home", "review", "add", "list", "sync", "advanced"];
const PREFS_KEY = "ui_prefs";
const ONBOARD_KEY = "onboarding_done";
const STUDY_LOCK_KEY = "study_lock_meta";
const AUTH_TOKEN_KEY = "auth_token";
const AUTH_USER_KEY = "auth_user";

const ONBOARD_SLIDES = [
  {
    title: "Add quickly",
    text: "Import vocab in bulk, then let AI enrich missing examples and mnemonics.",
    preview: "Paste -> Parse -> Save",
  },
  {
    title: "Review in short sessions",
    text: "Use fullscreen cards, grade 0-5, and keep momentum with 5-15 minute sessions.",
    preview: "Flip / MCQ / Typing",
  },
  {
    title: "Build your streak",
    text: "Daily review updates streak, progress ring, and confidence over time.",
    preview: "Streak + progress + badges",
  },
];

function pageFromHash() {
  const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  return VALID_PAGES.includes(hash) ? hash : "home";
}

function useToasts() {
  const [items, setItems] = useState([]);

  const push = (message, type = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  };

  const dismiss = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return { items, push, dismiss };
}

function ConfettiLayer({ show }) {
  if (!show) return null;
  return (
    <div className="confetti-layer" aria-hidden="true">
      {Array.from({ length: 28 }).map((_, idx) => (
        <span key={idx} className="confetti-piece" style={{ left: `${(idx * 3.5) % 100}%`, animationDelay: `${(idx % 7) * 0.08}s` }} />
      ))}
    </div>
  );
}

export default function App() {
  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.get("mode") === "helper") {
    return <StrictHelper />;
  }
  return <MainApp forceStudyLock={queryParams.get("forceStudyLock") === "1"} />;
}

function MainApp({ forceStudyLock }) {
  const baseUrl = useMemo(() => normalizeBaseUrl(DEFAULT_BASE_URL), []);
  const [page, setPage] = useState(pageFromHash());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState(null);
  const [client, setClient] = useState(null);
  const [schemaRefreshedForAuth, setSchemaRefreshedForAuth] = useState(false);

  const [prefs, setPrefs] = useState(() =>
    getJson(PREFS_KEY, {
      darkMode: false,
      highContrast: false,
      studyLockEnabled: true,
      studyIntervalMinutes: 45,
    })
  );

  const [stats, setStats] = useState({
    streak: 0,
    lastActivityDate: "",
    totalReviewed: 0,
    totalCorrect: 0,
    accuracy: 0,
    dailyNewCreatedCount: 0,
    dailyStudyLockCompletedCount: 0,
    studyLockTargetPerDay: 5,
    studyLockIntervalMinutes: 45,
  });

  const [showOnboarding, setShowOnboarding] = useState(() => !getJson(ONBOARD_KEY, false));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [authSession, setAuthSession] = useState(() => ({
    token: getText(AUTH_TOKEN_KEY, ""),
    user: getJson(AUTH_USER_KEY, null),
  }));
  const [authChecking, setAuthChecking] = useState(() => {
    const token = getText(AUTH_TOKEN_KEY, "");
    const user = getJson(AUTH_USER_KEY, null);
    return Boolean(token) && !user;
  });
  const [studyLock, setStudyLock] = useState({ open: false, card: null, pool: [] });
  const [studyMeta, setStudyMeta] = useState(() =>
    getJson(STUDY_LOCK_KEY, {
      lastPromptAt: Date.now(),
    })
  );
  const studyIntervalMs = useMemo(() => {
    const minutesRaw = Number(stats?.studyLockIntervalMinutes || 45);
    const minutes = Number.isFinite(minutesRaw) ? Math.max(5, Math.min(240, minutesRaw)) : 45;
    return minutes * 60 * 1000;
  }, [stats?.studyLockIntervalMinutes]);

  const { items, push, dismiss } = useToasts();

  const loadOpenApi = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const doc = await fetchOpenApi(baseUrl, { force });
      setSchema(doc);
      setClient(createApiClient({ schema: doc, baseUrl }));
    } catch (e) {
      setError(e.message || "Cannot fetch OpenAPI schema from backend.");
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    loadOpenApi(false);
  }, [loadOpenApi]);

  useEffect(() => {
    if (!client || schemaRefreshedForAuth) return;
    const hasAuth = client.has("authLogin") && client.has("authRegister");
    if (hasAuth) return;
    setSchemaRefreshedForAuth(true);
    void loadOpenApi(true);
  }, [client, schemaRefreshedForAuth, loadOpenApi]);

  useEffect(() => {
    if (!client || !authSession?.token) return;
    if (client.has("statsGet")) return;
    void loadOpenApi(true);
  }, [client, authSession?.token, loadOpenApi]);

  useEffect(() => {
    let active = true;
    const syncAuth = async () => {
      if (!client) return;
      if (!authSession?.token || !client.has("authMe")) {
        if (active) setAuthChecking(false);
        return;
      }
      try {
        const user = await client.authMe();
        if (!active) return;
        setJson(AUTH_USER_KEY, user);
        setAuthSession((prev) => ({ ...(prev || {}), user }));
        if (active) setAuthChecking(false);
        if (client.has("statsGet")) {
          void client.getStats().then((remoteStats) => {
            if (active && remoteStats) setStats(remoteStats);
          }).catch(() => {});
        }
      } catch (_) {
        if (!active) return;
        removeKey(AUTH_TOKEN_KEY);
        removeKey(AUTH_USER_KEY);
        setAuthSession({ token: "", user: null });
        setAuthChecking(false);
      }
    };
    void syncAuth();
    return () => {
      active = false;
    };
  }, [client, authSession?.token]);

  useEffect(() => {
    if (authSession?.token && authSession?.user) {
      setAuthChecking(false);
    }
  }, [authSession?.token, authSession?.user]);

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    setJson(PREFS_KEY, prefs);
    document.body.classList.toggle("dark", Boolean(prefs.darkMode));
    document.body.classList.toggle("high-contrast", Boolean(prefs.highContrast));
  }, [prefs]);

  useEffect(() => {
    setJson(STUDY_LOCK_KEY, studyMeta);
  }, [studyMeta]);

  const fetchStudyPool = useCallback(async () => {
    if (!client) return [];

    const collect = (arr) => (Array.isArray(arr) ? arr.filter((x) => x?.id && x?.term) : []);
    let pool = [];

    if (client.has("sessionToday")) {
      try {
        const s = await client.sessionToday(50);
        pool = [...collect(s?.todayNew), ...collect(s?.review)];
      } catch (_) {
        // fallback below
      }
    }

    if (!pool.length && client.has("listVocab")) {
      try {
        const data = await client.listVocab({ page: 1, limit: 100 });
        pool = collect(data);
      } catch (_) {
        // keep empty
      }
    }

    const seen = new Set();
    return pool.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [client]);

  const triggerStudyLock = useCallback(async ({ manual = false } = {}) => {
    if (!client || studyLock.open) return;
    const pool = await fetchStudyPool();
    if (!pool.length) {
      if (manual) push("No vocabulary found to start study lock.", "warning");
      return;
    }

    const card = pool[Math.floor(Math.random() * pool.length)];
    setStudyLock({ open: true, card, pool });
    setStudyMeta({ lastPromptAt: Date.now() });

    if (typeof window !== "undefined") {
      try {
        window.focus();
      } catch (_) {
        // ignore
      }
    }
  }, [client, studyLock.open, fetchStudyPool, push]);

  useEffect(() => {
    if (!prefs.studyLockEnabled || !client) return undefined;

    const ensureStartAt = Number(studyMeta?.lastPromptAt || 0);
    if (!ensureStartAt) {
      setStudyMeta({ lastPromptAt: Date.now() });
    }

    const timer = window.setInterval(() => {
      if (studyLock.open) return;
      const last = Number(studyMeta?.lastPromptAt || 0);
      if (!last) return;
      if (Date.now() - last >= studyIntervalMs) {
        void triggerStudyLock();
      }
    }, 30 * 1000);

    return () => window.clearInterval(timer);
  }, [prefs.studyLockEnabled, client, studyLock.open, studyMeta?.lastPromptAt, triggerStudyLock, studyIntervalMs]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!studyLock.open) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [studyLock.open]);

  useEffect(() => {
    if (!forceStudyLock || !client) return;
    void triggerStudyLock({ manual: true });
    const cleanUrl = `${window.location.pathname}${window.location.hash || "#home"}`;
    window.history.replaceState({}, "", cleanUrl);
  }, [forceStudyLock, client, triggerStudyLock]);

  const changePage = (next) => {
    setPage(next);
    window.location.hash = next;
  };

  const logout = useCallback(async () => {
    try {
      if (client?.has("authLogout")) {
        await client.authLogout();
      }
    } catch (_) {
      // ignore logout errors and clear local session
    } finally {
      removeKey(AUTH_TOKEN_KEY);
      removeKey(AUTH_USER_KEY);
      setAuthSession({ token: "", user: null });
      setStudyLock({ open: false, card: null, pool: [] });
      setStats({
        streak: 0,
        lastActivityDate: "",
        totalReviewed: 0,
        totalCorrect: 0,
        accuracy: 0,
        dailyNewCreatedCount: 0,
        dailyStudyLockCompletedCount: 0,
        studyLockTargetPerDay: 5,
        studyLockIntervalMinutes: 45,
      });
    }
  }, [client]);

  const closeOnboarding = () => {
    setShowOnboarding(false);
    setJson(ONBOARD_KEY, true);
  };

  const onReviewSessionComplete = (summary) => {
    const total = Number(summary?.total || 0);
    const correct = Number(summary?.passed || 0);
    const previousStreak = Number(stats?.streak || 0);
    if (!client?.has("statsReviewCompleted")) return;
    void client
      .statsReviewCompleted({ total, passed: correct })
      .then((remoteStats) => {
        const nextStreak = Number(remoteStats?.streak || 0);
        setStats(remoteStats);
        if (nextStreak > 0 && nextStreak % 7 === 0 && nextStreak > previousStreak) {
          setShowConfetti(true);
          window.setTimeout(() => setShowConfetti(false), 5000);
          push(`Streak ${nextStreak} days!`, "success");
        }
      })
      .catch(() => {});
  };

  const renderPage = () => {
    if (!client) return null;
    if (page === "home") return <Home api={client} stats={stats} onNavigate={changePage} />;
    if (page === "review") return <Review api={client} onToast={push} onSessionComplete={onReviewSessionComplete} onStats={setStats} />;
    if (page === "list") return <List api={client} onToast={push} />;
    if (page === "sync") return <SyncPage api={client} onToast={push} />;
    if (page === "advanced") return <Advanced api={client} schema={schema} onToast={push} />;
    return <Add api={client} onToast={push} onStats={setStats} />;
  };

  return (
    <div className="app-shell">
      {authSession?.token ? <Nav page={page} onChange={changePage} onLogout={logout} /> : null}

      <main className="content">
        {authSession?.token ? (
          <div className="utility-bar">
            <div className="meta-line">
              <span className="mono">{baseUrl}</span>
              {client ? <span>{Object.values(client.core || {}).filter(Boolean).length} core endpoints found</span> : null}
              {authSession?.user?.email ? <span>{authSession.user.email}</span> : null}
            </div>
            <div className="utility-actions">
              <button type="button" className="btn" onClick={() => setPrefs((p) => ({ ...p, darkMode: !p.darkMode }))}>
                {prefs.darkMode ? "Light" : "Dark"}
              </button>
              <button type="button" className="btn" onClick={() => setPrefs((p) => ({ ...p, highContrast: !p.highContrast }))}>
                {prefs.highContrast ? "Normal" : "High Contrast"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const helperUrl = `${window.location.origin}${window.location.pathname}?mode=helper`;
                  const helperWindow = window.open(helperUrl, "_blank", "noopener,noreferrer");
                  if (!helperWindow) {
                    push("Popup blocked. Please allow popups and try again.", "warning");
                  } else {
                    helperWindow.focus();
                    push("Strict helper tab opened.", "success");
                  }
                }}
              >
                Open Strict Helper
              </button>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={stats.studyLockTargetPerDay || 5}
                onChange={(e) => setStats((prev) => ({ ...prev, studyLockTargetPerDay: Number(e.target.value || 5) }))}
                title="Words per day"
                style={{ width: 90 }}
              />
              <input
                type="number"
                min="5"
                max="240"
                step="5"
                value={stats.studyLockIntervalMinutes || 45}
                onChange={(e) => setStats((prev) => ({ ...prev, studyLockIntervalMinutes: Number(e.target.value || 45) }))}
                title="Study interval (minutes)"
                style={{ width: 90 }}
              />
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  if (!client?.has("statsUpdateSettings")) return;
                  try {
                    const remoteStats = await client.statsUpdateSettings({
                      studyLockTargetPerDay: Number(stats.studyLockTargetPerDay || 5),
                      studyLockIntervalMinutes: Number(stats.studyLockIntervalMinutes || 45),
                    });
                    setStats(remoteStats);
                    push("Study plan saved.", "success");
                  } catch (error) {
                    push(error.message || "Cannot save study plan.", "error");
                  }
                }}
              >
                Save plan
              </button>
              <button type="button" className="btn" onClick={() => setPrefs((p) => ({ ...p, studyLockEnabled: !p.studyLockEnabled }))}>
                {prefs.studyLockEnabled ? "Study Lock: ON" : "Study Lock: OFF"}
              </button>
              <button type="button" className="btn" onClick={() => triggerStudyLock({ manual: true })}>
                Test Study Lock
              </button>
              <button
                type="button"
                className="btn"
                onClick={logout}
              >
                Logout
              </button>
            </div>
          </div>
        ) : null}

        {loading || authChecking ? <Spinner label={loading ? "Reading OpenAPI..." : "Checking session..."} /> : null}

        {!loading && error ? (
          <ErrorState title="Backend connection failed" message={error} actionLabel="Retry" onAction={() => loadOpenApi(true)}>
            <p>
              Check backend at <code>{baseUrl}</code>
            </p>
            <p>
              Required: <code>{baseUrl}/openapi.json</code>
            </p>
          </ErrorState>
        ) : null}

        {!loading && !error && !authChecking && !authSession?.token ? (
          client?.has("authLogin") && client?.has("authRegister") ? (
            <AuthPanel
              api={client}
              onToast={push}
              onAuth={(data) => {
                setText(AUTH_TOKEN_KEY, data.token);
                setJson(AUTH_USER_KEY, data.user);
                setAuthSession({ token: data.token, user: data.user });
              }}
            />
          ) : (
            <ErrorState title="Auth endpoints missing" message="Backend does not expose /auth/login and /auth/register." />
          )
        ) : null}

        {!loading && !error && !authChecking && authSession?.token ? renderPage() : null}
      </main>

      <button type="button" className="fab-add" onClick={() => changePage("add")} disabled={!authSession?.token} style={{ display: authSession?.token ? "block" : "none" }}>
        Add
      </button>

      <Onboarding
        open={showOnboarding}
        step={onboardingStep}
        total={ONBOARD_SLIDES.length}
        slide={ONBOARD_SLIDES[onboardingStep]}
        onPrev={() => setOnboardingStep((s) => Math.max(0, s - 1))}
        onNext={() => setOnboardingStep((s) => Math.min(ONBOARD_SLIDES.length - 1, s + 1))}
        onClose={closeOnboarding}
      />

      <ConfettiLayer show={showConfetti} />
      <StudyLock
        open={studyLock.open}
        card={studyLock.card}
        pool={studyLock.pool}
        api={client}
        onToast={push}
        onCompleted={async () => {
          if (!client?.has("statsStudyLockCompleted")) return;
          try {
            const remoteStats = await client.statsStudyLockCompleted({ count: 1 });
            setStats(remoteStats);
          } catch (_) {
            // ignore
          }
        }}
        onUnlock={() => {
          setStudyLock({ open: false, card: null, pool: [] });
          setStudyMeta({ lastPromptAt: Date.now() });
        }}
      />
      <Toast items={items} onDismiss={dismiss} />
    </div>
  );
}
