import React, { useEffect, useMemo, useState } from "react";
import Spinner from "../components/Spinner";
import { nearMatch } from "../utils/fuzzy";

function vibrate(ms) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(ms);
  }
}

function uniqueCards(todayNew, review) {
  const seen = new Set();
  const output = [];

  (todayNew || []).forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    output.push({ ...item, bucket: "todayNew" });
  });

  (review || []).forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    output.push({ ...item, bucket: "review" });
  });

  return output;
}

function pickFirstMeaning(card) {
  return Array.isArray(card?.meanings) && card.meanings.length ? card.meanings[0] : "";
}

function shuffle(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildMcqOptions(card, cards, questionType) {
  if (!card) return [];

  if (questionType === "meaning_to_term") {
    const correct = card.term;
    const pool = cards.filter((x) => x.id !== card.id).map((x) => x.term).filter(Boolean);
    return shuffle([correct, ...shuffle([...new Set(pool)]).slice(0, 3)]);
  }

  const correct = pickFirstMeaning(card);
  const pool = cards
    .filter((x) => x.id !== card.id)
    .map((x) => pickFirstMeaning(x))
    .filter(Boolean);

  return shuffle([correct, ...shuffle([...new Set(pool)]).slice(0, 3)].filter(Boolean));
}

function getPrompt(card, questionType) {
  if (!card) return "";
  if (questionType === "meaning_to_term") return pickFirstMeaning(card) || "No meaning yet";
  return card.term;
}

function getCorrectAnswer(card, questionType) {
  if (!card) return "";
  if (questionType === "meaning_to_term") return card.term || "";
  return (card.meanings || []).join("; ");
}

function gradeForOutcome(mode, isCorrect) {
  if (mode === "typing") return isCorrect ? 5 : 1;
  if (mode === "mcq") return isCorrect ? 4 : 1;
  return isCorrect ? 4 : 1;
}

function CircleProgress({ value, label }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const style = { background: `conic-gradient(var(--progress-a) ${safe * 3.6}deg, var(--surface-3) 0deg)` };
  return (
    <div className="radial-wrap small" style={style}>
      <div className="radial-inner">
        <strong>{safe}%</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

export default function Review({ api, onToast, onSessionComplete, onStats }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState({ todayNew: [], review: [] });
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState("flip");
  const [questionType, setQuestionType] = useState("term_to_meaning");
  const [showBack, setShowBack] = useState(false);

  const [typingAnswer, setTypingAnswer] = useState("");
  const [mcqAnswer, setMcqAnswer] = useState("");
  const [judgeResult, setJudgeResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mcqResolved, setMcqResolved] = useState(false);
  const [mcqCorrect, setMcqCorrect] = useState(false);
  const [done, setDone] = useState([]);
  const [reported, setReported] = useState(false);

  const [touchStartX, setTouchStartX] = useState(null);

  const cards = useMemo(() => uniqueCards(session.todayNew, session.review), [session]);
  const current = cards[index] || null;
  const mcqOptions = useMemo(() => buildMcqOptions(current, cards, questionType), [current, cards, questionType]);

  const loadSession = async () => {
    if (!api?.has("sessionToday")) {
      setError("Session endpoint is not available.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await api.sessionToday(30);
      setSession({
        todayNew: Array.isArray(data?.todayNew) ? data.todayNew : [],
        review: Array.isArray(data?.review) ? data.review : [],
      });
      setIndex(0);
      setDone([]);
      setReported(false);
      setShowBack(false);
      setTypingAnswer("");
      setMcqAnswer("");
      setJudgeResult(null);
      setMcqResolved(false);
      setMcqCorrect(false);
    } catch (e) {
      setError(e.message || "Cannot load session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    if (api?.has("statsReviewStarted")) {
      void api.statsReviewStarted().then((remoteStats) => onStats?.(remoteStats)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = async (event) => {
      const tag = String(event.target?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || event.target?.isContentEditable;
      if (editing || !current || submitting) return;

      if (event.key === " ") {
        event.preventDefault();
        if (mode === "flip") setShowBack((v) => !v);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, submitting, mode]);

  useEffect(() => {
    setShowBack(false);
    setTypingAnswer("");
    setMcqAnswer("");
    setJudgeResult(null);
    setMcqResolved(false);
    setMcqCorrect(false);
  }, [index, mode, questionType]);

  useEffect(() => {
    if (reported) return;
    if (cards.length > 0 && index >= cards.length && done.length > 0) {
      setReported(true);
      const passed = done.filter((x) => x.grade >= 3).length;
      onSessionComplete?.({ total: done.length, passed, done });
    }
  }, [cards.length, index, done, onSessionComplete, reported]);

  const readCurrent = () => {
    if (!current || typeof window === "undefined" || !window.speechSynthesis) return;
    const chunks = [current.term, current.ipa, ...(current.meanings || []).slice(0, 2), current.exampleEn || ""].filter(Boolean);
    const utterance = new SpeechSynthesisUtterance(chunks.join(". "));
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const submitOutcome = async ({ isCorrect, userAnswer }) => {
    if (!current || submitting) return;
    if (!api?.has("submitReview")) {
      onToast("Submit review endpoint is missing.", "error");
      return;
    }

    const grade = gradeForOutcome(mode, isCorrect);
    setSubmitting(true);

    try {
      const response = await api.submitReview({
        vocabId: current.id,
        mode,
        questionType,
        grade,
        userAnswer: userAnswer || undefined,
      });

      setDone((prev) => [
        ...prev,
        {
          id: current.id,
          term: current.term,
          grade,
          lapses: Number(response?.lapses || 0),
          readdCount: Number(response?.vocab?.readdCount || current.readdCount || 0),
        },
      ]);

      vibrate(isCorrect ? 20 : 60);

      window.setTimeout(() => {
        if (index >= cards.length - 1) {
          setIndex(cards.length);
        } else {
          setIndex((v) => v + 1);
        }
      }, isCorrect ? 550 : 900);
    } catch (e) {
      onToast(e.message || "Submit failed.", "error");
    } finally {
      window.setTimeout(() => {
        setSubmitting(false);
      }, 120);
    }
  };

  const checkTyping = async () => {
    if (!current || mode !== "typing") return;
    const answer = typingAnswer.trim();
    if (!answer) {
      onToast("Type your answer first.", "warning");
      return;
    }

    const candidates = questionType === "term_to_meaning" ? current.meanings || [] : [current.term || ""];
    const fuzzy = nearMatch(answer, candidates, 0.84);

    if (fuzzy.matched) {
      vibrate(15);
      const result = {
        isEquivalent: true,
        reasonShort: `Near match (${fuzzy.score})`,
        provider: "local",
      };
      setJudgeResult(result);
      void submitOutcome({ isCorrect: true, userAnswer: answer });
      return;
    }

    if (api?.has("aiJudge")) {
      try {
        const judged = await api.aiJudge({
          term: current.term,
          userAnswer: answer,
          meanings: questionType === "term_to_meaning" ? current.meanings || [] : [current.term],
        });
        setJudgeResult(judged);
        vibrate(judged.isEquivalent ? 20 : 55);
        void submitOutcome({ isCorrect: Boolean(judged.isEquivalent), userAnswer: answer });
      } catch (e) {
        const result = {
          isEquivalent: false,
          reasonShort: e.message || "AI judge failed",
          provider: "error",
        };
        setJudgeResult(result);
        vibrate(55);
        void submitOutcome({ isCorrect: false, userAnswer: answer });
      }
      return;
    }

    const result = {
      isEquivalent: false,
      reasonShort: `Not close enough (${fuzzy.score})`,
      provider: "local",
    };
    setJudgeResult(result);
    vibrate(55);
    void submitOutcome({ isCorrect: false, userAnswer: answer });
  };

  const summary = useMemo(() => {
    const total = done.length;
    const passed = done.filter((x) => x.grade >= 3).length;
    const struggled = done.filter((x) => x.grade < 3 || x.readdCount > 0 || x.lapses > 0);
    const accuracy = total ? Math.round((passed / total) * 100) : 0;
    return { total, passed, struggled, accuracy };
  }, [done]);

  const handleSwipeEnd = (event) => {
    if (touchStartX === null) return;
    const endX = event.changedTouches?.[0]?.clientX;
    if (typeof endX !== "number") return;

    const delta = endX - touchStartX;
    if (delta < -80) {
      if (index < cards.length - 1) {
        setIndex((v) => v + 1);
      }
    }
    if (delta > 80 && index > 0) {
      setIndex((v) => Math.max(0, v - 1));
    }
    setTouchStartX(null);
  };

  return (
    <div className="review-screen page-grid one" style={{ animation: "fadeIn 0.5s ease" }}>
      <section className="card review-surface glass-panel" style={{ border: "none", minHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="row-between review-toolbar" style={{ marginBottom: "20px" }}>
          <div>
            <h2 className="text-gradient" style={{ margin: "0 0 4px 0" }}>Focus Mode</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.95rem" }}>Tap card to flip. Swipe to move.</p>
          </div>
          <div className="actions" style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn glass-panel" onClick={readCurrent} disabled={!current} style={{ padding: "8px 16px", borderRadius: "20px", border: "1px solid var(--line)" }}>
              🔊 Voice
            </button>
            <button type="button" className="btn glass-panel" onClick={loadSession} disabled={loading} style={{ padding: "8px 16px", borderRadius: "20px", border: "1px solid var(--line)" }}>
              🔄 Reload
            </button>
          </div>
        </div>

        <div className="review-config glass-panel" style={{ padding: "16px", borderRadius: "16px", background: "var(--surface)", border: "1px solid var(--line)", marginBottom: "24px" }}>
          <div className="field">
            <label style={{ fontSize: "0.85rem", color: "var(--ink-muted)", marginBottom: "4px", display: "block" }}>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", outline: "none" }}>
              <option value="flip">Flip Card</option>
              <option value="mcq">Multiple Choice</option>
              <option value="typing">Typing</option>
            </select>
          </div>
          <div className="field">
            <label style={{ fontSize: "0.85rem", color: "var(--ink-muted)", marginBottom: "4px", display: "block" }}>Direction</label>
            <select value={questionType} onChange={(e) => setQuestionType(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", outline: "none" }}>
              <option value="term_to_meaning">Term → Meaning</option>
              <option value="meaning_to_term">Meaning → Term</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircleProgress value={cards.length ? Math.round((Math.min(index, cards.length) / cards.length) * 100) : 0} label="Progress" />
          </div>
        </div>

        {loading ? <div className="skeleton-card" style={{ flex: 1, borderRadius: "24px" }} /> : null}
        {error ? <p className="error-line" style={{ color: "var(--danger)" }}>{error}</p> : null}

        {!loading && !error && cards.length === 0 ? (
          <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center" }}>
            <h3 style={{ color: "var(--ink-muted)", fontSize: "1.5rem" }}>All caught up for today! 🎉</h3>
          </div>
        ) : null}

        {!loading && !error && current && index < cards.length ? (
          <div className="review-main" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div className="review-meta" style={{ justifyContent: "center", marginBottom: "16px" }}>
              <span className="pill" style={{ background: "var(--accent-gradient)", color: "white", border: "none" }}>{current.bucket === "todayNew" ? "Today New" : "Review"}</span>
              <span className="pill glass-panel">{index + 1} / {cards.length}</span>
            </div>

            <div
              className={`flip-scene ${showBack ? "flipped" : ""}`}
              onClick={() => mode === "flip" && setShowBack((v) => !v)}
              onTouchStart={(e) => setTouchStartX(e.touches?.[0]?.clientX ?? null)}
              onTouchEnd={handleSwipeEnd}
              role="presentation"
              style={{ flex: 1, minHeight: "350px" }}
            >
              <div className="flip-face front glass-panel" style={{ display: "grid", placeItems: "center", textAlign: "center", border: "none", boxShadow: "var(--shadow-hover)" }}>
                <h3 style={{ fontSize: "clamp(2rem, 5vw, 4rem)", margin: 0, fontWeight: 700 }}>{getPrompt(current, questionType)}</h3>
              </div>
              <div className="flip-face back glass-panel" style={{ alignContent: "center", border: "none", boxShadow: "var(--shadow-hover)", textAlign: "center" }}>
                <h3 className="text-gradient" style={{ fontSize: "2.5rem", marginBottom: "16px" }}>{current.term}</h3>
                <p style={{ fontSize: "1.2rem", color: "var(--ink)" }}>{(current.meanings || []).join("; ") || "No meanings"}</p>
                {current.exampleEn ? <p style={{ fontSize: "1.1rem", marginTop: "16px", fontStyle: "italic" }}>"{current.exampleEn}"</p> : null}
                {current.exampleVi ? <p style={{ fontSize: "1.1rem", color: "var(--ink-muted)" }}>{current.exampleVi}</p> : null}
                
                {mode === "flip" ? (
                  <div className="review-memory-actions" style={{ justifyContent: "center", marginTop: "32px", gap: "16px" }}>
                    <button 
                      type="button" 
                      className="btn danger glass-panel" 
                      disabled={submitting} 
                      onClick={(e) => { e.stopPropagation(); void submitOutcome({ isCorrect: false }); }}
                      style={{ padding: "16px 32px", borderRadius: "100px", fontSize: "1.1rem", border: "1px solid var(--danger)", color: "var(--danger)", background: "transparent" }}
                    >
                      Forgot (1)
                    </button>
                    <button 
                      type="button" 
                      className="btn primary" 
                      disabled={submitting} 
                      onClick={(e) => { e.stopPropagation(); void submitOutcome({ isCorrect: true }); }}
                      style={{ padding: "16px 32px", borderRadius: "100px", fontSize: "1.1rem", background: "var(--accent-emerald)", color: "white", border: "none" }}
                    >
                      Remembered (2)
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {mode === "mcq" ? (
              <div className="mcq-grid" style={{ marginTop: "24px" }}>
                {mcqOptions.map((opt, idx) => (
                  <button
                    key={`${opt}-${idx}`}
                    type="button"
                    className={[
                      "mcq-btn glass-panel",
                      mcqAnswer === opt ? "active" : "",
                      mcqResolved && mcqAnswer === opt && mcqCorrect ? "mcq-ok" : "",
                      mcqResolved && mcqAnswer === opt && !mcqCorrect ? "mcq-wrong" : "",
                      mcqResolved && opt === getCorrectAnswer(current, questionType) ? "mcq-answer" : "",
                    ].filter(Boolean).join(" ")}
                    disabled={mcqResolved || submitting}
                    onClick={() => {
                      const isCorrect = opt === getCorrectAnswer(current, questionType);
                      setMcqAnswer(opt);
                      setMcqResolved(true);
                      setMcqCorrect(isCorrect);
                      void submitOutcome({ isCorrect, userAnswer: opt });
                    }}
                    style={{ padding: "16px", fontSize: "1.1rem", textAlign: "center", borderRadius: "16px", border: "1px solid var(--line)" }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : null}

            {mode === "typing" ? (
              <div className="typing-wrap" style={{ marginTop: "24px" }}>
                <div className="review-answer-row" style={{ background: "var(--surface)", borderRadius: "20px", padding: "8px", border: "1px solid var(--line)" }}>
                  <input
                    className={`review-answer-input ${judgeResult ? (judgeResult.isEquivalent ? "study-input-ok" : "study-input-wrong") : ""}`}
                    value={typingAnswer}
                    onChange={(e) => setTypingAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    disabled={submitting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!submitting) checkTyping();
                      }
                    }}
                    style={{ border: "none", background: "transparent", outline: "none", width: "100%" }}
                  />
                  <button type="button" className="btn review-check-btn" disabled={submitting} onClick={checkTyping} style={{ background: "var(--accent-gradient)", color: "white", borderRadius: "14px", border: "none" }}>
                    Check
                  </button>
                </div>

                {judgeResult ? (
                  <div className={`judge-box ${judgeResult.isEquivalent ? "ok" : "warn"}`} style={{ borderRadius: "16px", padding: "16px", marginTop: "16px" }}>
                    <strong style={{ fontSize: "1.1rem", color: judgeResult.isEquivalent ? "var(--accent-emerald)" : "var(--accent-orange)" }}>
                      {judgeResult.isEquivalent ? "✨ Great - accepted" : "⚠️ Near miss / wrong"}
                    </strong>
                    <span style={{ color: "var(--ink)" }}>{judgeResult.reasonShort}</span>
                    {!judgeResult.isEquivalent ? (
                      <span style={{ fontWeight: "bold" }}>Correct answer: {getCorrectAnswer(current, questionType)}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {submitting ? <div style={{ textAlign: "center", marginTop: "16px" }}><Spinner small /></div> : null}
          </div>
        ) : null}

        {!loading && !error && cards.length > 0 && index >= cards.length ? (
          <div className={`summary-box glass-panel ${summary.accuracy >= 80 ? "session-win" : ""}`} style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", border: "none" }}>
            <div>
              <h3 className="text-gradient" style={{ fontSize: "2.5rem", marginBottom: "8px" }}>Session Complete!</h3>
              <p style={{ color: "var(--ink-muted)", marginBottom: "32px", fontSize: "1.2rem" }}>Great job maintaining your streak.</p>
              
              <div className="summary-stats" style={{ justifyContent: "center", marginBottom: "32px" }}>
                <CircleProgress value={summary.accuracy} label="Accuracy" />
                <div style={{ textAlign: "left", display: "grid", gap: "8px" }}>
                  <div className="glass-panel" style={{ padding: "8px 16px", borderRadius: "12px", border: "none" }}><strong>{summary.total}</strong> Cards Reviewed</div>
                  <div className="glass-panel" style={{ padding: "8px 16px", borderRadius: "12px", border: "none" }}><strong>{summary.passed}</strong> Mastered</div>
                  <div className="glass-panel" style={{ padding: "8px 16px", borderRadius: "12px", border: "none" }}><strong>{summary.struggled.length}</strong> Need Attention</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
