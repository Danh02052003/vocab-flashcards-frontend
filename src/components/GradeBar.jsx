import React from "react";

const HINTS = {
  0: "Blackout",
  1: "Very hard",
  2: "Hard",
  3: "Good with effort",
  4: "Good",
  5: "Easy",
};

export default function GradeBar({ disabled, onPick, selected }) {
  return (
    <div className="grade-wrap">
      <div className="grade-head">
        <strong>Rate recall (0-5)</strong>
        <small>{selected !== null && selected !== undefined ? HINTS[selected] : "Use keys 0..5"}</small>
      </div>
      <div className="grade-grid">
        {[0, 1, 2, 3, 4, 5].map((grade) => (
          <button
            key={grade}
            type="button"
            className={`grade-btn g-${grade} ${selected === grade ? "active" : ""}`}
            disabled={disabled}
            onClick={() => onPick(grade)}
            title={HINTS[grade]}
          >
            <span>{grade}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
