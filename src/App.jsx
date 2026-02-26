import React, { useEffect, useMemo, useState } from "react";
import { normalizeBaseUrl, DEFAULT_BASE_URL } from "./api/base";
import { fetchOpenApi } from "./api/openapi";
import { createApiClient } from "./api/client";
import { getJson, setJson } from "./utils/storage";

import Nav from "./components/Nav";
import Toast from "./components/Toast";
import Spinner from "./components/Spinner";
import ErrorState from "./components/ErrorState";
import Onboarding from "./components/Onboarding";

import Home from "./pages/Home";
import Add from "./pages/Add";
import Review from "./pages/Review";
import List from "./pages/List";
import SyncPage from "./pages/Sync";
import Advanced from "./pages/Advanced";

import "./App.css";

const VALID_PAGES = ["home", "review", "add", "list", "sync", "advanced"];
const PREFS_KEY = "ui_prefs";
const STATS_KEY = "learning_stats";
const ONBOARD_KEY = "onboarding_done";

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

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
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
  const baseUrl = useMemo(() => normalizeBaseUrl(DEFAULT_BASE_URL), []);
  const [page, setPage] = useState(pageFromHash());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState(null);
  const [client, setClient] = useState(null);

  const [prefs, setPrefs] = useState(() =>
    getJson(PREFS_KEY, {
      darkMode: false,
      highContrast: false,
    })
  );

  const [stats, setStats] = useState(() =>
    getJson(STATS_KEY, {
      streak: 0,
      lastReviewDate: "",
      totalReviewed: 0,
      totalCorrect: 0,
      accuracy: 0,
    })
  );

  const [showOnboarding, setShowOnboarding] = useState(() => !getJson(ONBOARD_KEY, false));
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const { items, push, dismiss } = useToasts();

  const loadOpenApi = async (force = false) => {
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
  };

  useEffect(() => {
    loadOpenApi(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setJson(STATS_KEY, stats);
  }, [stats]);

  const changePage = (next) => {
    setPage(next);
    window.location.hash = next;
  };

  const closeOnboarding = () => {
    setShowOnboarding(false);
    setJson(ONBOARD_KEY, true);
  };

  const onReviewSessionComplete = (summary) => {
    const total = Number(summary?.total || 0);
    const correct = Number(summary?.passed || 0);
    const today = getTodayKey();
    const yesterday = getYesterdayKey();

    setStats((prev) => {
      const current = prev || {};
      const prevLast = current.lastReviewDate || "";
      const prevStreak = Number(current.streak || 0);

      let nextStreak = prevStreak;
      if (prevLast !== today) {
        nextStreak = prevLast === yesterday ? prevStreak + 1 : 1;
      }

      const totalReviewed = Number(current.totalReviewed || 0) + total;
      const totalCorrect = Number(current.totalCorrect || 0) + correct;
      const accuracy = totalReviewed > 0 ? Math.round((totalCorrect / totalReviewed) * 100) : 0;

      if (nextStreak > 0 && nextStreak % 7 === 0 && prevLast !== today) {
        setShowConfetti(true);
        window.setTimeout(() => setShowConfetti(false), 5000);
        push(`Streak ${nextStreak} days!`, "success");
      }

      return {
        streak: nextStreak,
        lastReviewDate: today,
        totalReviewed,
        totalCorrect,
        accuracy,
      };
    });
  };

  const renderPage = () => {
    if (!client) return null;
    if (page === "home") return <Home api={client} stats={stats} onNavigate={changePage} />;
    if (page === "review") return <Review api={client} onToast={push} onSessionComplete={onReviewSessionComplete} />;
    if (page === "list") return <List api={client} onToast={push} />;
    if (page === "sync") return <SyncPage api={client} onToast={push} />;
    if (page === "advanced") return <Advanced api={client} schema={schema} onToast={push} />;
    return <Add api={client} onToast={push} />;
  };

  return (
    <div className="app-shell">
      <Nav page={page} onChange={changePage} />

      <main className="content">
        <div className="utility-bar">
          <div className="meta-line">
            <span className="mono">{baseUrl}</span>
            {client ? <span>{Object.values(client.core || {}).filter(Boolean).length} core endpoints found</span> : null}
          </div>
          <div className="utility-actions">
            <button type="button" className="btn" onClick={() => setPrefs((p) => ({ ...p, darkMode: !p.darkMode }))}>
              {prefs.darkMode ? "Light" : "Dark"}
            </button>
            <button type="button" className="btn" onClick={() => setPrefs((p) => ({ ...p, highContrast: !p.highContrast }))}>
              {prefs.highContrast ? "Normal" : "High Contrast"}
            </button>
          </div>
        </div>

        {loading ? <Spinner label="Reading OpenAPI..." /> : null}

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

        {!loading && !error ? renderPage() : null}
      </main>

      <button type="button" className="fab-add" onClick={() => changePage("add")}>
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
      <Toast items={items} onDismiss={dismiss} />
    </div>
  );
}
