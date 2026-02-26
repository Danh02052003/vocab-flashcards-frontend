import React, { useEffect, useMemo, useState } from "react";
import Spinner from "../components/Spinner";

function CircleProgress({ value }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const style = {
    background: `conic-gradient(var(--progress-a) ${safe * 3.6}deg, var(--surface-3) 0deg)`,
  };
  return (
    <div className="radial-wrap" style={style}>
      <div className="radial-inner">
        <strong>{safe}%</strong>
        <small>Accuracy</small>
      </div>
    </div>
  );
}

export default function Home({ api, stats, onNavigate }) {
  const [loading, setLoading] = useState(false);
  const [todayInfo, setTodayInfo] = useState({ todayNew: 0, review: 0 });

  const streakActive = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return stats.lastReviewDate === today;
  }, [stats.lastReviewDate]);

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

  return (
    <div className="page-grid one">
      <section className="card hero-card">
        <div className="hero-left">
          <h2>Daily Vocabulary Sprint</h2>
          <p>Short sessions, instant feedback, and consistent streaks for IELTS growth.</p>
          <div className="quick-grid">
            <button type="button" className="quick-btn" onClick={() => onNavigate("review")}>
              Start review
              <small>{todayInfo.review} cards due</small>
            </button>
            <button type="button" className="quick-btn" onClick={() => onNavigate("add")}>
              Add vocab
              <small>Fast import + AI assist</small>
            </button>
            <button type="button" className="quick-btn" onClick={() => onNavigate("list")}>
              Browse cards
              <small>Edit tags and examples</small>
            </button>
            <button type="button" className="quick-btn" onClick={() => onNavigate("sync")}>
              Backup sync
              <small>Export or import JSON</small>
            </button>
          </div>
        </div>

        <div className="hero-right">
          <div className={`streak-flame ${streakActive ? "active" : ""}`}>
            <span>{stats.streak || 0}</span>
            <small>day streak</small>
          </div>
          <CircleProgress value={stats.accuracy || 0} />
        </div>
      </section>

      <section className="card">
        <div className="row-between">
          <h3>Today plan</h3>
          {loading ? <Spinner small label="Syncing..." /> : null}
        </div>
        <div className="stat-list">
          <div className="stat-item">
            <span>New today</span>
            <strong>{todayInfo.todayNew}</strong>
          </div>
          <div className="stat-item">
            <span>Need review</span>
            <strong>{todayInfo.review}</strong>
          </div>
          <div className="stat-item">
            <span>Total reviewed</span>
            <strong>{stats.totalReviewed || 0}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
