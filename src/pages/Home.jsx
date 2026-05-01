import React, { useEffect, useMemo, useState } from "react";
import Spinner from "../components/Spinner";

export default function Home({ api, stats, onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [todayInfo, setTodayInfo] = useState({ todayNew: 0, review: 0 });
  const [fireAnimation, setFireAnimation] = useState(null);
  const [LottieComponent, setLottieComponent] = useState(null);

  const streakActive = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return stats.lastActivityDate === today;
  }, [stats.lastActivityDate]);

  const streakPaletteClass = useMemo(() => {
    const streak = Number(stats.streak || 0);
    if (streak > 50) return "streak-palette-50";
    if (streak > 20) return "streak-palette-20";
    if (streak > 10) return "streak-palette-10";
    return "streak-palette-base";
  }, [stats.streak]);

  useEffect(() => {
    const load = async () => {
      if (!api?.has("sessionToday")) return;
      setLoading(true);
      try {
        const data = await api.sessionToday(30);
        setTodayInfo({
          todayNew: Array.isArray(data?.todayNew) ? data.todayNew.length : 0,
          review: Array.isArray(data?.review) ? data.review.length : 0,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [api]);

  useEffect(() => {
    let active = true;
    const loadAnimation = async () => {
      try {
        const [response, lottieModule] = await Promise.all([
          fetch("/animation/Fire.json"),
          import("lottie-react"),
        ]);
        const data = await response.json();
        if (active) {
          setFireAnimation(data);
          setLottieComponent(() => lottieModule.default);
        }
      } catch (_) {
        if (active) {
          setFireAnimation(null);
          setLottieComponent(null);
        }
      }
    };
    loadAnimation();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="page-grid one" style={{ animation: "fadeIn 0.5s ease" }}>
      <section className="card hero-card" style={{ background: "var(--surface)", border: "none" }}>
        <div className="hero-left">
          <h2 style={{ fontSize: "2.5rem", marginBottom: "8px" }} className="text-gradient">Ready to level up?</h2>
          <p style={{ color: "var(--ink-muted)", fontSize: "1.1rem", marginBottom: "24px" }}>
            Consistency is key. Complete your daily sprint to maintain your streak.
          </p>
          
          <div className="quick-grid" style={{ gridTemplateColumns: "1fr" }}>
            <button 
              type="button" 
              className="quick-btn" 
              onClick={() => onNavigate("review")}
              style={{ background: "var(--accent-gradient)", color: "white", padding: "20px" }}
            >
              <span className="quick-btn-title" style={{ fontSize: "1.4rem" }}>🔥 Start Review Session</span>
              <small className="quick-btn-meta" style={{ color: "rgba(255,255,255,0.8)" }}>{todayInfo.review} cards waiting for you</small>
            </button>
          </div>

          <div className="quick-grid" style={{ marginTop: "16px" }}>
            <button type="button" className="quick-btn glass-panel" onClick={() => onNavigate("add")}>
              <span className="quick-btn-title">✨ Add Vocab</span>
              <small className="quick-btn-meta">AI-assisted import</small>
            </button>
            <button type="button" className="quick-btn glass-panel" onClick={() => onNavigate("list")}>
              <span className="quick-btn-title">📚 Browse Library</span>
              <small className="quick-btn-meta">Manage your cards</small>
            </button>
          </div>
        </div>

        <div className="hero-right" style={{ position: "relative" }}>
          <div className="glass-panel" style={{ padding: "30px", borderRadius: "50%", width: "220px", height: "220px", display: "grid", placeItems: "center", boxShadow: "var(--shadow-hover)" }}>
            <div className={`streak-flame ${streakActive ? "active" : ""} ${streakPaletteClass}`} style={{ width: "100%", height: "100%", position: "absolute" }}>
              {fireAnimation && LottieComponent ? (
                <LottieComponent
                  className="streak-flame-lottie"
                  animationData={fireAnimation}
                  loop
                  autoplay
                  aria-hidden="true"
                />
              ) : (
                <div className="streak-flame-fallback" aria-hidden="true" />
              )}
            </div>
            <div className="streak-flame-count" style={{ zIndex: 10 }}>
              <span style={{ fontSize: "3rem", background: "var(--surface)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>
                {stats.streak || 0}
              </span>
              <small style={{ color: "var(--ink)", fontWeight: "bold", background: "rgba(255,255,255,0.5)", padding: "2px 8px", borderRadius: "12px", backdropFilter: "blur(4px)" }}>Day Streak</small>
            </div>
          </div>
        </div>
      </section>

      <section className="card glass-panel" style={{ border: "none" }}>
        <div className="row-between" style={{ marginBottom: "16px" }}>
          <h3 style={{ fontSize: "1.2rem", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            📊 Today's Overview
            {loading ? <Spinner small /> : null}
          </h3>
        </div>
        
        <div className="stat-list" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px" }}>
          <div className="stat-item glass-panel" style={{ background: "transparent", border: "1px solid var(--line)" }}>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>New Today</span>
            <strong style={{ fontSize: "1.5rem" }}>{todayInfo.todayNew}</strong>
          </div>
          <div className="stat-item glass-panel" style={{ background: "transparent", border: "1px solid var(--line)" }}>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>To Review</span>
            <strong style={{ fontSize: "1.5rem" }}>{todayInfo.review}</strong>
          </div>
          <div className="stat-item glass-panel" style={{ background: "transparent", border: "1px solid var(--line)" }}>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>Accuracy</span>
            <strong style={{ fontSize: "1.5rem", color: "var(--accent-emerald)" }}>{stats.accuracy || 0}%</strong>
          </div>
          <div className="stat-item glass-panel" style={{ background: "transparent", border: "1px solid var(--line)" }}>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.9rem" }}>Total Cards</span>
            <strong style={{ fontSize: "1.5rem" }}>{stats.totalReviewed || 0}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
