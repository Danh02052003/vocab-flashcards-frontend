import React, { useEffect, useMemo, useState } from "react";
import Spinner from "./Spinner";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sampleWrongTerms(pool, correctTerm, count = 3) {
  const filtered = (pool || [])
    .map((item) => String(item?.term || "").trim())
    .filter((term) => term && normalizeText(term) !== normalizeText(correctTerm));

  const unique = [...new Set(filtered)];
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, count);
}

function buildMcqOptions(pool, correctTerm) {
  const options = [correctTerm, ...sampleWrongTerms(pool, correctTerm, 3)].filter(Boolean);
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

function buildSentenceSuggestion(term, card) {
  if (card?.exampleEn) return card.exampleEn;
  return `I used "${term}" correctly in this sentence.`;
}

function localSentenceIssues(text, term) {
  const issues = [];
  const t = String(text || "").trim();

  if (!t) {
    issues.push("Sentence is empty.");
    return issues;
  }
  if (!/[A-Z]/.test(t.charAt(0))) {
    issues.push("Start the sentence with a capital letter.");
  }
  if (!/[.!?]$/.test(t)) {
    issues.push("End the sentence with punctuation (., !, ?).");
  }
  if (t.split(/\s+/).length < 5) {
    issues.push("Sentence is too short. Try at least 5 words.");
  }
  const termRegex = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
  if (!termRegex.test(t)) {
    issues.push(`Sentence must include the target word "${term}".`);
  }

  return issues;
}

export default function StudyLock({ open, card, pool, api, onUnlock, onToast }) {
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [mcqValue, setMcqValue] = useState("");
  const [mcqChecked, setMcqChecked] = useState(false);
  const [mcqCorrect, setMcqCorrect] = useState(false);

  const [typedTerm, setTypedTerm] = useState("");
  const [typeChecked, setTypeChecked] = useState(false);
  const [typeCorrect, setTypeCorrect] = useState(false);

  const [sentence, setSentence] = useState("");
  const [sentenceFeedback, setSentenceFeedback] = useState({
    checked: false,
    correct: false,
    issues: [],
    aiReason: "",
    suggestion: "",
  });
  const [exitCountdown, setExitCountdown] = useState(0);

  const term = String(card?.term || "").trim();
  const meanings = Array.isArray(card?.meanings) ? card.meanings.filter(Boolean) : [];
  const options = useMemo(() => buildMcqOptions(pool, term), [pool, term]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setChecking(false);
    setErrorText("");
    setMcqValue("");
    setMcqChecked(false);
    setMcqCorrect(false);
    setTypedTerm("");
    setTypeChecked(false);
    setTypeCorrect(false);
    setSentence("");
    setSentenceFeedback({
      checked: false,
      correct: false,
      issues: [],
      aiReason: "",
      suggestion: "",
    });
    setExitCountdown(0);
  }, [open, card?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Enter") return;
      if (checking) return;

      if (step === 1) {
        event.preventDefault();
        if (!mcqChecked) {
          if (mcqValue) {
            const ok = normalizeText(mcqValue) === normalizeText(term);
            setMcqChecked(true);
            setMcqCorrect(ok);
            setErrorText("");
          }
          return;
        }
        if (mcqCorrect) {
          setStep(2);
          return;
        }
        repeatPick();
        return;
      }

      if (step === 2) {
        event.preventDefault();
        if (!typeChecked) {
          const ok = normalizeText(typedTerm) === normalizeText(term);
          setTypeChecked(true);
          setTypeCorrect(ok);
          setErrorText("");
          return;
        }
        if (typeCorrect) {
          setStep(3);
          return;
        }
        repeatType();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, checking, step, mcqChecked, mcqValue, mcqCorrect, typeChecked, typeCorrect, term, typedTerm]);

  useEffect(() => {
    if (!open || !sentenceFeedback.correct || exitCountdown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setExitCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          window.location.hash = "home";
          onUnlock?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, sentenceFeedback.correct, exitCountdown, onUnlock]);

  if (!open || !card) return null;

  function submitPick(pickedValue) {
    const ok = normalizeText(pickedValue) === normalizeText(term);
    setMcqValue(pickedValue);
    setMcqChecked(true);
    setMcqCorrect(ok);
    setErrorText("");
  }

  function repeatPick() {
    setMcqValue("");
    setMcqChecked(false);
    setMcqCorrect(false);
    setErrorText("");
  }

  function submitType() {
    const ok = normalizeText(typedTerm) === normalizeText(term);
    setTypeChecked(true);
    setTypeCorrect(ok);
    setErrorText("");
  }

  function repeatType() {
    setTypedTerm("");
    setTypeChecked(false);
    setTypeCorrect(false);
    setErrorText("");
  }

  async function submitSentence() {
    const text = String(sentence || "").trim();
    const suggestion = buildSentenceSuggestion(term, card);
    const normalizedUserSentence = normalizeText(text);
    const normalizedExampleEn = normalizeText(card?.exampleEn || "");
    const normalizedExampleVi = normalizeText(card?.exampleVi || "");

    if (
      normalizedUserSentence &&
      (normalizedUserSentence === normalizedExampleEn || normalizedUserSentence === normalizedExampleVi)
    ) {
      setSentenceFeedback({
        checked: true,
        correct: true,
        issues: [],
        aiReason: "",
        suggestion,
      });
      setExitCountdown(5);
      onToast("Perfect. Your sentence matches a saved example.", "success");
      return;
    }

    const issues = localSentenceIssues(text, term);

    if (issues.length > 0) {
      setSentenceFeedback({
        checked: true,
        correct: false,
        issues,
        aiReason: "",
        suggestion,
      });
      return;
    }

    if (api?.has("aiJudge")) {
      setChecking(true);
      try {
        const judged = await api.aiJudge({
          term,
          userAnswer: text,
          meanings,
        });

        if (!judged?.isEquivalent) {
          setSentenceFeedback({
            checked: true,
            correct: false,
            issues: [
              "Meaning usage may be off for this word.",
              "Grammar may need fixing (verb tense/article/preposition).",
              "Sentence structure can be improved for natural flow.",
            ],
            aiReason: judged?.reasonShort || "AI says the sentence does not match the target meaning.",
            suggestion,
          });
          return;
        }
      } catch (error) {
        setSentenceFeedback({
          checked: true,
          correct: false,
          issues: ["AI check failed. Please try again."],
          aiReason: error.message || "",
          suggestion,
        });
        return;
      } finally {
        setChecking(false);
      }
    }

    setSentenceFeedback({
      checked: true,
      correct: true,
      issues: [],
      aiReason: "",
      suggestion,
    });
    setExitCountdown(5);
    onToast("Great job. Study lock completed.", "success");
  }

  return (
    <div className="study-lock-backdrop" role="dialog" aria-modal="true">
      <section className="study-lock-card">
        <header className="study-lock-head">
          <h2>It's time to learn a new word</h2>
          <p className="muted">Review this word, then pass the quick check to continue.</p>
        </header>

        <div className="study-lock-progress">
          <span className={`pill ${step >= 0 ? "active" : ""}`}>1. Learn</span>
          <span className={`pill ${step >= 1 ? "active" : ""}`}>2. Pick</span>
          <span className={`pill ${step >= 2 ? "active" : ""}`}>3. Type</span>
          <span className={`pill ${step >= 3 ? "active" : ""}`}>4. Sentence</span>
        </div>

        {step === 0 ? (
          <div className="study-lock-content">
            <h3 className="study-term">{term}</h3>
            {card.ipa ? <p className="mono study-ipa">{card.ipa}</p> : null}
            <p><strong>Meaning:</strong> {meanings.join("; ") || "(no meaning yet)"}</p>
            {card.exampleEn ? <p><strong>Example 1:</strong> {card.exampleEn}</p> : null}
            {card.exampleVi ? <p><strong>Example 2:</strong> {card.exampleVi}</p> : null}
            {card.mnemonic ? <p><strong>Mnemonic:</strong> {card.mnemonic}</p> : null}
            <div className="actions">
              <button type="button" className="btn primary" onClick={() => setStep(1)}>
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="study-lock-content">
            <p><strong>Question:</strong> Which term matches this meaning?</p>
            <p className="study-meaning">{meanings.join("; ") || "(no meaning available)"}</p>
            <div className="mcq-grid">
              {options.map((opt) => {
                const isSelected = mcqValue === opt;
                const isCorrectOption = normalizeText(opt) === normalizeText(term);
                const classNames = ["mcq-btn"];
                if (isSelected) classNames.push("active");
                if (mcqChecked && isSelected && mcqCorrect) classNames.push("mcq-ok");
                if (mcqChecked && isSelected && !mcqCorrect) classNames.push("mcq-wrong");
                if (mcqChecked && isCorrectOption) classNames.push("mcq-answer");
                return (
                  <button
                    type="button"
                    key={opt}
                    className={classNames.join(" ")}
                    onClick={() => submitPick(opt)}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {mcqChecked && !mcqCorrect ? (
              <p className="study-correct-answer">Correct answer: <strong>{term}</strong></p>
            ) : null}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setStep(0)}>Back</button>
              {mcqChecked && mcqCorrect ? (
                <button type="button" className="btn primary" onClick={() => setStep(2)}>Next</button>
              ) : mcqChecked ? (
                <button type="button" className="btn danger" onClick={repeatPick}>Repeat</button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="study-lock-content">
            <p><strong>Type the term:</strong> {meanings.join("; ") || "(no meaning available)"}</p>
            <input
              className={typeChecked ? (typeCorrect ? "study-input-ok" : "study-input-wrong") : ""}
              value={typedTerm}
              onChange={(e) => {
                setTypedTerm(e.target.value);
                if (typeChecked) {
                  setTypeChecked(false);
                  setTypeCorrect(false);
                }
              }}
              placeholder="Type the English term"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!typeChecked) {
                    submitType();
                    return;
                  }
                  if (typeCorrect) {
                    setStep(3);
                    return;
                  }
                  repeatType();
                }
              }}
            />
            {typeChecked && !typeCorrect ? (
              <p className="study-correct-answer">Correct answer: <strong>{term}</strong></p>
            ) : null}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
              {!typeChecked ? (
                <button type="button" className="btn primary" onClick={submitType}>Check</button>
              ) : typeCorrect ? (
                <button type="button" className="btn primary" onClick={() => setStep(3)}>Next</button>
              ) : (
                <button type="button" className="btn danger" onClick={repeatType}>Repeat</button>
              )}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="study-lock-content">
            <p><strong>Write one sentence using:</strong> <code>{term}</code></p>
            <textarea
              rows={4}
              value={sentence}
              onChange={(e) => {
                setSentence(e.target.value);
                if (sentenceFeedback.checked) {
                  setSentenceFeedback({
                    checked: false,
                    correct: false,
                    issues: [],
                    aiReason: "",
                    suggestion: "",
                  });
                }
              }}
              placeholder={`Example: I stayed ${term} even after multiple failures.`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!checking) submitSentence();
                }
              }}
            />
            <div className="actions">
              <button type="button" className="btn" onClick={() => setStep(2)} disabled={checking}>Back</button>
              <button type="button" className="btn primary" onClick={submitSentence} disabled={checking}>
                {checking ? "AI is checking..." : "Finish"}
              </button>
            </div>
            {checking ? <Spinner small label="Evaluating sentence..." /> : null}

            {sentenceFeedback.checked && !sentenceFeedback.correct ? (
              <div className="study-sentence-feedback">
                <strong>Your sentence is not correct yet.</strong>
                {sentenceFeedback.aiReason ? <p>{sentenceFeedback.aiReason}</p> : null}
                <ul>
                  {sentenceFeedback.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
                {sentenceFeedback.suggestion ? (
                  <p className="study-correct-answer">
                    Suggested complete sentence: <strong>{sentenceFeedback.suggestion}</strong>
                  </p>
                ) : null}
              </div>
            ) : null}

            {sentenceFeedback.checked && sentenceFeedback.correct ? (
              <div className="study-sentence-feedback study-sentence-ok">
                <strong>Excellent. Your sentence is correct.</strong>
                <p>Returning to Home in {exitCountdown}s...</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {errorText ? <p className="error-line">{errorText}</p> : null}
      </section>
    </div>
  );
}
