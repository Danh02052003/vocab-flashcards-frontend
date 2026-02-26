import React from "react";

export default function ErrorState({ title, message, actionLabel, onAction, children }) {
  return (
    <div className="error-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {children}
      {onAction ? (
        <button type="button" className="btn primary" onClick={onAction}>
          {actionLabel || "Retry"}
        </button>
      ) : null}
    </div>
  );
}
