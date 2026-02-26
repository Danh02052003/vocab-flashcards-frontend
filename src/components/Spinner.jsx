import React from "react";

export default function Spinner({ label = "Loading...", small = false }) {
  return (
    <div className={`spinner-wrap ${small ? "small" : ""}`} role="status" aria-live="polite">
      <span className="spinner" />
      <span>{label}</span>
    </div>
  );
}
