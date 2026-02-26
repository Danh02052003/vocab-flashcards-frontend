import React from "react";

const ICONS = {
  info: "i",
  success: "ok",
  warning: "!",
  error: "x",
};

export default function Toast({ items, onDismiss }) {
  return (
    <div className="toast-host" aria-live="polite" aria-atomic="true">
      {(items || []).map((item) => (
        <div key={item.id} className={`toast-item ${item.type || "info"}`}>
          <div className="toast-main">
            <span className="toast-icon">{ICONS[item.type || "info"] || "i"}</span>
            <div className="toast-text">{item.message}</div>
          </div>
          <button type="button" className="toast-close" onClick={() => onDismiss(item.id)}>
            x
          </button>
        </div>
      ))}
    </div>
  );
}
