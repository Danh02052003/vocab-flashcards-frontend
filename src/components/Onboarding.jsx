import React from "react";

export default function Onboarding({ open, step, total, slide, onNext, onPrev, onClose }) {
  if (!open) return null;

  return (
    <div className="onboard-backdrop" role="presentation">
      <div className="onboard-card" role="dialog" aria-modal="true" aria-label="Onboarding">
        <div className="onboard-progress">
          <span>Step {step + 1}/{total}</span>
          <button type="button" className="icon-btn" onClick={onClose}>
            Skip
          </button>
        </div>

        <h2>{slide.title}</h2>
        <p>{slide.text}</p>

        <div className="onboard-preview">{slide.preview}</div>

        <div className="onboard-actions">
          <button type="button" className="btn" onClick={onPrev} disabled={step === 0}>
            Back
          </button>
          {step < total - 1 ? (
            <button type="button" className="btn primary" onClick={onNext}>
              Next
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={onClose}>
              Start learning
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
