import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import Home from "./pages/Home";
import Add from "./pages/Add";
import Review from "./pages/Review";
import List from "./pages/List";
import SyncPage from "./pages/Sync";
import Advanced from "./pages/Advanced";

import "./App.css";

const VALID_PAGES = ["home", "review", "add", "list", "sync", "advanced", "study-lock"];
const PREFS_KEY = "ui_prefs";
const ONBOARD_KEY = "onboarding_done";
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

function StudyRouteLoading({ label, detail }) {
  return (
    <div className="study-route-loading" role="status" aria-live="polite">
      <div className="study-route-loading-card">
        <Spinner label={label} />
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}

export default function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const extGoal = Number(queryParams.get("extGoal") || 0);
  const extInterval = Number(queryParams.get("extInterval") || 0);
  const extRepeat = queryParams.get("extRepeat") === "1";
  const studyVocabId = queryParams.get("studyVocabId") || "";
  return (
    <MainApp
      forceStudyLock={queryParams.get("forceStudyLock") === "1"}
      initialStudyVocabId={studyVocabId}
      extensionPlan={{
        hasPlan: extGoal > 0 || extInterval > 0 || extRepeat,
        studyLockTargetPerDay: extGoal > 0 ? extGoal : null,
        studyLockIntervalMinutes: extInterval > 0 ? extInterval : null,
        studyLockRepeatEnabled: extRepeat,
      }}
    />
  );
}

function MainApp({ forceStudyLock, initialStudyVocabId, extensionPlan }) {
  const baseUrl = useMemo(() => normalizeBaseUrl(DEFAULT_BASE_URL), []);
  const [page, setPage] = useState(pageFromHash());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState(null);
  const [client, setClient] = useState(null);
  const [schemaRefreshedForAuth, setSchemaRefreshedForAuth] = useState(false);

  const [prefs] = useState(() =>
    getJson(PREFS_KEY, {
      darkMode: false,
      highContrast: false,
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
    dailyStudyLockVocabIds: [],
    studyLockTargetPerDay: 5,
    studyLockIntervalMinutes: 45,
    studyLockRepeatEnabled: false,
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
  const [studyLock, setStudyLock] = useState({ open: false, card: null, pool: [], allowExit: false });
  const forceStudyLockHandledRef = useRef(false);

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

    const repeatEnabled = Boolean(extensionPlan?.studyLockRepeatEnabled ?? stats?.studyLockRepeatEnabled);
    const repeatIds = Array.isArray(stats?.dailyStudyLockVocabIds) ? stats.dailyStudyLockVocabIds.filter(Boolean) : [];
    const reachedGoal = Number(stats?.dailyStudyLockCompletedCount || 0) >= Number(stats?.studyLockTargetPerDay || 5);

    if (repeatEnabled && reachedGoal && repeatIds.length && client.has("listVocab")) {
      try {
        const data = await client.listVocab({ page: 1, limit: Math.max(100, repeatIds.length * 4) });
        const items = collect(data);
        pool = items.filter((item) => repeatIds.includes(String(item.id)));
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
  }, [client, extensionPlan?.studyLockRepeatEnabled, stats?.dailyStudyLockCompletedCount, stats?.dailyStudyLockVocabIds, stats?.studyLockRepeatEnabled, stats?.studyLockTargetPerDay]);

  const triggerStudyLock = useCallback(async ({ manual = false, lockedVocabId = "" } = {}) => {
    if (!client || studyLock.open) return { opened: false, selectedId: "" };
    const pool = await fetchStudyPool();
    if (!pool.length) {
      if (manual) push("No vocabulary found to start study lock.", "warning");
      return { opened: false, selectedId: "" };
    }

    let card = null;
    if (lockedVocabId) {
      card = pool.find((item) => String(item.id) === String(lockedVocabId)) || null;
      if (!card && client.has("getVocab")) {
        try {
          card = await client.getVocab(lockedVocabId);
        } catch (_) {
          card = null;
        }
      }
    }
    if (!card) {
      card = pool[Math.floor(Math.random() * pool.length)];
    }
    setStudyLock({ open: true, card, pool, allowExit: false });

    if (typeof window !== "undefined") {
      try {
        window.focus();
      } catch (_) {
        // ignore
      }
    }
    return { opened: true, selectedId: String(card?.id || "") };
  }, [client, studyLock.open, fetchStudyPool, push]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!studyLock.open || studyLock.allowExit) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [studyLock.open, studyLock.allowExit]);

  useEffect(() => {
    if (!forceStudyLock || !client || authChecking || !authSession?.token || forceStudyLockHandledRef.current) return;
    let active = true;
    const run = async () => {
      const result = await triggerStudyLock({ manual: true, lockedVocabId: initialStudyVocabId });
      if (!active || !result?.opened) return;
      forceStudyLockHandledRef.current = true;
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set("forceStudyLock", "1");
      nextParams.set("studyVocabId", result.selectedId);
      const nextSearch = nextParams.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}#study-lock`);
    };
    void run();
    return () => {
      active = false;
    };
  }, [forceStudyLock, client, authChecking, authSession?.token, triggerStudyLock, initialStudyVocabId]);

  useEffect(() => {
    if (!extensionPlan?.hasPlan || !client?.has("statsUpdateSettings") || !authSession?.token) return;
    const payload = {};
    if (extensionPlan.studyLockTargetPerDay) {
      payload.studyLockTargetPerDay = extensionPlan.studyLockTargetPerDay;
    }
    if (extensionPlan.studyLockIntervalMinutes) {
      payload.studyLockIntervalMinutes = extensionPlan.studyLockIntervalMinutes;
    }
    payload.studyLockRepeatEnabled = Boolean(extensionPlan.studyLockRepeatEnabled);
    if (!Object.keys(payload).length) return;
    void client
      .statsUpdateSettings(payload)
      .then((remoteStats) => {
        setStats(remoteStats);
      })
      .catch(() => {});
  }, [extensionPlan, client, authSession?.token]);

  const changePage = (next) => {
    setPage(next);
    window.location.hash = next;
  };

  const showStudyRouteLoading =
    page === "study-lock" &&
    !studyLock.open &&
    (
      loading ||
      authChecking ||
      (forceStudyLock && Boolean(authSession?.token) && Boolean(client))
    );

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
      setStudyLock({ open: false, card: null, pool: [], allowExit: false });
      setStats({
        streak: 0,
        lastActivityDate: "",
        totalReviewed: 0,
        totalCorrect: 0,
        accuracy: 0,
        dailyNewCreatedCount: 0,
        dailyStudyLockCompletedCount: 0,
        dailyStudyLockVocabIds: [],
        studyLockTargetPerDay: 5,
        studyLockIntervalMinutes: 45,
        studyLockRepeatEnabled: false,
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
    if (page === "study-lock") return null;
    if (page === "review") return <Review api={client} onToast={push} onSessionComplete={onReviewSessionComplete} onStats={setStats} />;
    if (page === "list") return <List api={client} onToast={push} />;
    if (page === "sync") return <SyncPage api={client} onToast={push} />;
    if (page === "advanced") return <Advanced api={client} schema={schema} onToast={push} />;
    return <Add api={client} onToast={push} onStats={setStats} />;
  };

  return (
    <div className="app-shell">
      {authSession?.token && page !== "study-lock" ? <Nav page={page} onChange={changePage} onLogout={logout} /> : null}

      <main className="content">
        {showStudyRouteLoading ? (
          <StudyRouteLoading
            label={loading ? "Loading study page..." : authChecking ? "Checking login..." : "Preparing your vocabulary card..."}
            detail={loading ? "Loading app data first." : authChecking ? "Verifying your saved session." : "Locking the study tab to one word."}
          />
        ) : null}

        {(loading || authChecking) && page !== "study-lock" ? <Spinner label={loading ? "Reading OpenAPI..." : "Checking session..."} /> : null}

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

      <button 
        type="button" 
        className="fab-add glass-panel" 
        onClick={() => changePage("add")} 
        disabled={!authSession?.token} 
        style={{ 
          display: authSession?.token && page !== "study-lock" ? "flex" : "none",
          alignItems: "center",
          justifyContent: "center",
          width: "60px",
          height: "60px",
          borderRadius: "30px",
          fontSize: "1.5rem",
          background: "var(--accent-gradient)",
          color: "white",
          border: "none",
          boxShadow: "0 4px 20px rgba(139, 92, 246, 0.4)",
          position: "fixed",
          bottom: "32px",
          right: "32px",
          zIndex: 100,
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          cursor: "pointer"
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(139, 92, 246, 0.6)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(139, 92, 246, 0.4)"; }}
      >
        ➕
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
        closeOnSuccess={Boolean(forceStudyLock)}
        onToast={push}
        onCompleted={async () => {
          if (!client?.has("statsStudyLockCompleted")) return;
          try {
            const payload = { count: 1, vocabId: studyLock?.card?.id || null };
            const remoteStats = await client.statsStudyLockCompleted(payload);
            setStats(remoteStats);
          } catch (_) {
            // ignore
          }
        }}
        onSuccessfulExitStart={() => {
          setStudyLock((prev) => ({ ...prev, allowExit: true }));
        }}
        onUnlock={() => {
          forceStudyLockHandledRef.current = false;
          setStudyLock({ open: false, card: null, pool: [], allowExit: false });
        }}
      />
      <Toast items={items} onDismiss={dismiss} />
    </div>
  );
}
