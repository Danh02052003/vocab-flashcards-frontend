import React, { useMemo, useState } from "react";

function normalizeValues(values) {
  const seen = new Set();
  const out = [];
  (values || []).forEach((raw) => {
    const text = String(raw || "").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

export default function ChipInput({
  label,
  values,
  onChange,
  placeholder = "Nh岷璸 r峄搃 Enter",
  hint,
}) {
  const [draft, setDraft] = useState("");

  const chips = useMemo(() => normalizeValues(values), [values]);

  const pushValue = (value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    onChange(normalizeValues([...(chips || []), clean]));
    setDraft("");
  };

  const removeValue = (value) => {
    const next = chips.filter((item) => item !== value);
    onChange(next);
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      pushValue(draft);
    }
    if (event.key === "Backspace" && !draft && chips.length) {
      removeValue(chips[chips.length - 1]);
    }
  };

  return (
    <div className="field">
      <label>{label}</label>
      <div className="chip-box">
        {chips.map((chip) => (
          <span key={chip} className="chip">
            {chip}
            <button type="button" onClick={() => removeValue(chip)}>
              x
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => pushValue(draft)}
          placeholder={placeholder}
        />
      </div>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
