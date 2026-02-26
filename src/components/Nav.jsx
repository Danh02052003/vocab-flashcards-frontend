import React from "react";

const MAIN_ITEMS = [
  { id: "home", label: "Home", icon: "HM" },
  { id: "review", label: "Review", icon: "RV" },
  { id: "add", label: "Add", icon: "AD" },
  { id: "list", label: "Cards", icon: "LS" },
  { id: "sync", label: "Sync", icon: "SY" },
];

export default function Nav({ page, onChange }) {
  return (
    <>
      <header className="top-nav" aria-label="Top navigation">
        <div className="brand-block">
          <div className="brand-dot" />
          <div>
            <div className="brand-title">Vocab Flow</div>
            <small className="brand-sub">Microlearning mode</small>
          </div>
        </div>

        <nav className="desktop-nav">
          {MAIN_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-pill ${page === item.id ? "active" : ""}`}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`nav-pill ${page === "advanced" ? "active" : ""}`}
            onClick={() => onChange("advanced")}
          >
            Advanced
          </button>
        </nav>
      </header>

      <nav className="bottom-nav" aria-label="Bottom navigation">
        {MAIN_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bottom-nav-item ${page === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <span className="bottom-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
