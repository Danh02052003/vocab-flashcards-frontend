import React, { useEffect, useMemo, useState } from "react";
import Spinner from "../components/Spinner";
import GradeBar from "../components/GradeBar";
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

export default function Review({ api, onToast, onSessionComplete }) {
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
  const [selectedGrade, setSelectedGrade] = useState(null);
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
      setSelectedGrade(null);
    } catch (e) {
      setError(e.message || "Cannot load session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = async (event) => {
      const tag = String(event.target?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || event.target?.isContentEditable;
      if (editing || !current || submitting) return;

      if (/^[0-5]$/.test(event.key)) {
        event.preventDefault();
        await submitGrade(Number(event.key));
      }
      if (event.key === " ") {
        event.preventDefault();
        if (mode === "flip") setShowBack((v) => !v);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, submitting, mode, questionType, typingAnswer, mcqAnswer, judgeResult]);

  useEffect(() => {
    setShowBack(false);
    setTypingAnswer("");
    setMcqAnswer("");
    setJudgeResult(null);
    setSelectedGrade(null);
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
      setJudgeResult({
        isEquivalent: true,
        reasonShort: `Near match (${fuzzy.score})`,
        provider: "local",
      });
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
      } catch (e) {
        setJudgeResult({
          isEquivalent: false,
          reasonShort: e.message || "AI judge failed",
          provider: "error",
        });
        vibrate(55);
      }
      return;
    }

    setJudgeResult({
      isEquivalent: false,
      reasonShort: `Not close enough (${fuzzy.score})`,
      provider: "local",
    });
    vibrate(55);
  };

  const submitGrade = async (grade) => {
    if (!current || submitting) return;
    if (!api?.has("submitReview")) {
      onToast("Submit review endpoint is missing.", "error");
      return;
    }

    setSubmitting(true);
    setSelectedGrade(grade);

    const userAnswer = mode === "typing" ? typingAnswer.trim() : mode === "mcq" ? mcqAnswer : undefined;

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

      vibrate(grade >= 3 ? 20 : 60);

      if (index >= cards.length - 1) {
        setIndex(cards.length);
      } else {
        setIndex((v) => v + 1);
      }
    } catch (e) {
      onToast(e.message || "Submit failed.", "error");
    } finally {
      setSubmitting(false);
    }
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
    <div className="review-screen page-grid one">
      <section className="card review-surface">
        <div className="row-between review-toolbar">
          <div>
            <h2>Review session</h2>
            <p className="muted">Fullscreen focus mode for quick 5-15 minute learning bursts.</p>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={readCurrent} disabled={!current}>
              Voice
            </button>
            <button type="button" className="btn" onClick={loadSession} disabled={loading}>
              Reload
            </button>
          </div>
        </div>

        <div className="review-config">
          <div className="field">
            <label>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="flip">Flip</option>
              <option value="mcq">MCQ</option>
              <option value="typing">Typing</option>
            </select>
          </div>
          <div className="field">
            <label>Direction</label>
            <select value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
              <option value="term_to_meaning">Term to meaning</option>
              <option value="meaning_to_term">Meaning to term</option>
            </select>
          </div>
          <CircleProgress value={cards.length ? Math.round((Math.min(index, cards.length) / cards.length) * 100) : 0} label="Progress" />
        </div>

        {loading ? <div className="skeleton-card" /> : null}
        {error ? <p className="error-line">{error}</p> : null}

        {!loading && !error && cards.length === 0 ? <p>No cards available for today.</p> : null}

        {!loading && !error && current && index < cards.length ? (
          <div className="review-main">
            <div className="review-meta">
              <span className="pill">{current.bucket === "todayNew" ? "Today new" : "Review"}</span>
              <span className="pill">{index + 1}/{cards.length}</span>
            </div>

            <div
              className={`flip-scene ${showBack ? "flipped" : ""}`}
              onClick={() => mode === "flip" && setShowBack((v) => !v)}
              onTouchStart={(e) => setTouchStartX(e.touches?.[0]?.clientX ?? null)}
              onTouchEnd={handleSwipeEnd}
              role="presentation"
            >
              <div className="flip-face front">
                <h3>{getPrompt(current, questionType)}</h3>
                <small>Tap card to flip. Swipe to move.</small>
              </div>
              <div className="flip-face back">
                <h3>{current.term}</h3>
                <p>{(current.meanings || []).join("; ") || "No meanings"}</p>
                {current.exampleEn ? <p><strong>EN:</strong> {current.exampleEn}</p> : null}
                {current.exampleVi ? <p><strong>VI:</strong> {current.exampleVi}</p> : null}
              </div>
            </div>

            {mode === "mcq" ? (
              <div className="mcq-grid">
                {mcqOptions.map((opt, idx) => (
                  <button
                    key={`${opt}-${idx}`}
                    type="button"
                    className={`mcq-btn ${mcqAnswer === opt ? "active" : ""}`}
                    onClick={() => setMcqAnswer(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : null}

            {mode === "typing" ? (
              <div className="typing-wrap">
                <div className="field-row two">
                  <input
                    value={typingAnswer}
                    onChange={(e) => setTypingAnswer(e.target.value)}
                    placeholder="Type your answer"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        checkTyping();
                      }
                    }}
                  />
                  <button type="button" className="btn" onClick={checkTyping}>
                    Check
                  </button>
                </div>

                {judgeResult ? (
                  <div className={`judge-box ${judgeResult.isEquivalent ? "ok" : "warn"}`}>
                    <strong>{judgeResult.isEquivalent ? "Great - accepted" : "Near miss / wrong"}</strong>
                    <span>{judgeResult.reasonShort}</span>
                    {judgeResult.provider ? <span>provider: {judgeResult.provider}</span> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <GradeBar disabled={submitting} selected={selectedGrade} onPick={submitGrade} />
            {submitting ? <Spinner small label="Submitting review..." /> : null}
          </div>
        ) : null}

        {!loading && !error && cards.length > 0 && index >= cards.length ? (
          <div className={`summary-box ${summary.accuracy >= 80 ? "session-win" : ""}`}>
            <h3>Session complete</h3>
            <div className="summary-stats">
              <CircleProgress value={summary.accuracy} label="Accuracy" />
              <div>
                <p>Total reviewed: {summary.total}</p>
                <p>Grade >= 3: {summary.passed}</p>
                <p>Need attention: {summary.struggled.length}</p>
              </div>
            </div>

            {summary.struggled.length > 0 ? (
              <ul>
                {summary.struggled.map((item) => (
                  <li key={item.id}>
                    {item.term} | grade {item.grade} | lapses {item.lapses} | readd {item.readdCount}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
