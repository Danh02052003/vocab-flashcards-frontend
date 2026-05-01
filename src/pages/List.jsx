import React, { useEffect, useState } from "react";
import Modal from "../components/Modal";
import ChipInput from "../components/ChipInput";
import { isDue } from "../utils/date";

function normalizeList(values) {
  const seen = new Set();
  const out = [];
  (values || []).forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function cleanTermText(value) {
  let text = String(value || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/^\s*(?:[-*\u2022]+|\d+[.)-]?)\s*/, "");
  if (text === "-" || text === "\u2013") return "";
  return text;
}

function createEditModel(vocab) {
  return {
    id: vocab.id,
    term: cleanTermText(vocab.term || ""),
    meanings: normalizeList(vocab.meanings || []),
    ipa: vocab.ipa || "",
    exampleEn: vocab.exampleEn || "",
    exampleVi: vocab.exampleVi || "",
    mnemonic: vocab.mnemonic || "",
    tags: normalizeList(vocab.tags || []),
    collocations: normalizeList(vocab.collocations || []),
    phrases: normalizeList(vocab.phrases || []),
    topics: normalizeList(vocab.topics || []),
    cefrLevel: vocab.cefrLevel || "",
    ieltsBand: vocab.ieltsBand === null || vocab.ieltsBand === undefined ? "" : String(vocab.ieltsBand),
  };
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="detail-row">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function DetailSection({ title, children, className = "" }) {
  return (
    <section className={`detail-section ${className}`.trim()}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function List({ api, onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadList = async () => {
    if (!api?.has("listVocab")) {
      onToast("List vocab endpoint is missing.", "error");
      return;
    }

    setLoading(true);
    try {
      const data = await api.listVocab({
        search: search.trim() || undefined,
        tag: tag.trim() || undefined,
        page,
        limit,
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      onToast(e.message || "Cannot load vocab list.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const openDetail = (item) => setSelected(item);
  const closeDetail = () => setSelected(null);

  const openEdit = (item) => {
    setSelected(null);
    setEditing(createEditModel(item));
  };

  const closeEdit = () => setEditing(null);

  const updateEditing = (key, value) => {
    setEditing((prev) => ({ ...prev, [key]: value }));
  };

  const submitEdit = async () => {
    if (!editing || !api?.has("updateVocab")) return;

    setSaving(true);
    try {
      const payload = {
        term: cleanTermText(editing.term),
        meanings: normalizeList(editing.meanings),
        ipa: editing.ipa.trim() || null,
        exampleEn: editing.exampleEn.trim() || null,
        exampleVi: editing.exampleVi.trim() || null,
        mnemonic: editing.mnemonic.trim() || null,
        tags: normalizeList(editing.tags),
        collocations: normalizeList(editing.collocations),
        phrases: normalizeList(editing.phrases),
        topics: normalizeList(editing.topics),
        cefrLevel: editing.cefrLevel || null,
        ieltsBand: editing.ieltsBand ? Number(editing.ieltsBand) : null,
      };

      const updated = await api.updateVocab(editing.id, payload);
      setItems((prev) => prev.map((item) => (item.id === editing.id ? updated : item)));
      setSelected(updated);
      onToast("Card updated.", "success");
      closeEdit();
    } catch (e) {
      onToast(e.message || "Update failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeItem = async (id, term) => {
    if (!api?.has("deleteVocab")) {
      onToast("Delete endpoint is missing.", "error");
      return;
    }
    if (!window.confirm(`Delete '${term}'?`)) return;

    try {
      await api.deleteVocab(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSelected(null);
      onToast("Card deleted.", "success");
    } catch (e) {
      onToast(e.message || "Delete failed.", "error");
    }
  };

  return (
    <div className="page-grid one" style={{ animation: "fadeIn 0.5s ease" }}>
      <section className="card glass-panel" style={{ border: "none", padding: "32px", borderRadius: "24px" }}>
        <div className="row-between" style={{ marginBottom: "24px" }}>
          <div>
            <h2 className="text-gradient" style={{ margin: "0 0 8px 0", fontSize: "2rem" }}>Vocabulary Library</h2>
            <p className="muted" style={{ margin: 0 }}>Browse, search, and manage your flashcards.</p>
          </div>
          <button type="button" className="btn glass-panel" onClick={loadList} disabled={loading} style={{ padding: "10px 20px", borderRadius: "16px" }}>
            🔄 Reload
          </button>
        </div>

        <form
          className="field-row four"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            loadList();
          }}
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto auto", gap: "12px", marginBottom: "24px" }}
        >
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search term, meaning, or tag..." 
            style={{ padding: "14px", borderRadius: "16px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none", fontSize: "1rem" }}
          />
          <input 
            value={tag} 
            onChange={(e) => setTag(e.target.value)} 
            placeholder="Tag filter" 
            style={{ padding: "14px", borderRadius: "16px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none", fontSize: "1rem" }}
          />
          <select 
            value={limit} 
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ padding: "14px", borderRadius: "16px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none", fontSize: "1rem" }}
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
          <button type="submit" className="btn primary" style={{ padding: "14px 24px", borderRadius: "16px", background: "var(--accent-gradient)", color: "white", border: "none", fontWeight: 600 }}>Search</button>
        </form>

        <div className="pager" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", padding: "16px", background: "var(--surface)", borderRadius: "16px", border: "1px solid var(--line)" }}>
          <button type="button" className="btn glass-panel" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))} style={{ borderRadius: "12px", padding: "8px 20px" }}>
            ← Prev
          </button>
          <span style={{ fontWeight: 600, color: "var(--ink-muted)" }}>Page {page}</span>
          <button type="button" className="btn glass-panel" onClick={() => setPage((v) => v + 1)} style={{ borderRadius: "12px", padding: "8px 20px" }}>
            Next →
          </button>
        </div>

        {loading ? (
          <div className="skeleton-grid" style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card" style={{ height: "180px", borderRadius: "20px" }} />
            ))}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--ink-muted)" }}>
            <h3 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>No cards found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="vocab-masonry" style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {items.map((item) => (
              <article 
                key={item.id} 
                className="vocab-card glass-panel" 
                onClick={() => openDetail(item)} 
                role="button" 
                tabIndex={0}
                style={{ padding: "20px", borderRadius: "20px", cursor: "pointer", transition: "all 0.3s ease", border: "none", boxShadow: "var(--shadow-soft)" }}
              >
                <div className="row-between" style={{ marginBottom: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 600 }}>{cleanTermText(item.term) || "(empty term)"}</h3>
                  <span className={`status-chip ${isDue(item.dueAt) ? "warn" : "ok"}`} style={{ fontSize: "0.75rem", padding: "4px 8px", borderRadius: "8px", fontWeight: 600 }}>
                    {isDue(item.dueAt) ? "Due" : "Scheduled"}
                  </span>
                </div>

                {item.ipa ? <p className="mono" style={{ color: "var(--accent-blue)", margin: "0 0 8px 0", fontSize: "0.95rem" }}>{item.ipa}</p> : null}
                <p style={{ margin: "0 0 16px 0", color: "var(--ink)", lineHeight: 1.5 }}>{(item.meanings || []).slice(0, 3).join("; ") || "No meanings"}</p>

                {(item.tags || []).length ? (
                  <div className="chip-line" style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "16px" }}>
                    {item.tags.slice(0, 3).map((tagValue) => (
                      <span key={`${item.id}-${tagValue}`} className="chip" style={{ background: "var(--surface-3)", color: "var(--ink-muted)", padding: "4px 10px", borderRadius: "8px", fontSize: "0.8rem" }}>
                        #{tagValue}
                      </span>
                    ))}
                    {item.tags.length > 3 ? <span className="chip" style={{ background: "transparent", color: "var(--ink-muted)", fontSize: "0.8rem" }}>+{item.tags.length - 3}</span> : null}
                  </div>
                ) : null}

                <div className="inline-actions" style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
                  <button
                    type="button"
                    className="btn glass-panel"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(item);
                    }}
                    style={{ flex: 1, padding: "8px", borderRadius: "10px", fontSize: "0.9rem" }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeItem(item.id, item.term);
                    }}
                    style={{ flex: 1, padding: "8px", borderRadius: "10px", fontSize: "0.9rem", border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)" }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <Modal
        open={Boolean(selected)}
        title={selected ? selected.term : "Card details"}
        onClose={closeDetail}
        className="glass-panel"
        footer={
          selected ? (
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", width: "100%" }}>
              <button type="button" className="btn glass-panel" onClick={closeDetail} style={{ padding: "10px 20px", borderRadius: "12px" }}>Close</button>
              <button type="button" className="btn primary" onClick={() => openEdit(selected)} style={{ padding: "10px 24px", borderRadius: "12px", background: "var(--accent-gradient)", color: "white", border: "none", fontWeight: 600 }}>Edit Card</button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="detail-layout">
            <section className="detail-hero glass-panel" style={{ border: "none", padding: "24px", borderRadius: "20px" }}>
              <div className="detail-hero-main">
                <h2 className="text-gradient" style={{ fontSize: "2.5rem" }}>{selected.term}</h2>
                {selected.ipa ? <p className="detail-ipa mono" style={{ fontSize: "1.2rem", marginTop: "8px" }}>{selected.ipa}</p> : null}
              </div>
              <div className="detail-hero-side">
                <span className={`status-chip ${isDue(selected.dueAt) ? "warn" : "ok"}`} style={{ padding: "6px 12px", borderRadius: "12px", fontWeight: 600 }}>
                  {isDue(selected.dueAt) ? "Need review" : "Scheduled"}
                </span>
              </div>
            </section>

            <DetailSection title="Meaning" className="glass-panel" style={{ border: "none", padding: "20px", borderRadius: "16px" }}>
              <p className="detail-meaning" style={{ fontSize: "1.2rem", color: "var(--ink)" }}>{(selected.meanings || []).join("; ") || "No meanings yet"}</p>
            </DetailSection>

            <div className="detail-split">
              <DetailSection title="Example (EN)" className="detail-example-card glass-panel" style={{ border: "none", padding: "20px", borderRadius: "16px" }}>
                <p style={{ fontStyle: "italic", fontSize: "1.1rem" }}>"{selected.exampleEn || "No example yet"}"</p>
              </DetailSection>
              <DetailSection title="Example (VI)" className="detail-example-card glass-panel" style={{ border: "none", padding: "20px", borderRadius: "16px" }}>
                <p style={{ color: "var(--ink-muted)", fontSize: "1.1rem" }}>{selected.exampleVi || "No example yet"}</p>
              </DetailSection>
            </div>

            {selected.mnemonic ? (
              <DetailSection title="Memory hook" className="glass-panel" style={{ border: "none", padding: "20px", borderRadius: "16px" }}>
                <p style={{ fontSize: "1.1rem" }}>💡 {selected.mnemonic}</p>
              </DetailSection>
            ) : null}

            {(selected.tags || []).length || (selected.collocations || []).length || (selected.phrases || []).length || (selected.topics || []).length ? (
              <DetailSection title="Word network" className="glass-panel" style={{ border: "none", padding: "20px", borderRadius: "16px" }}>
                <div className="detail-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <DetailRow label="Tags" value={(selected.tags || []).join(", ")} />
                  <DetailRow label="Collocations" value={(selected.collocations || []).join(", ")} />
                  <DetailRow label="Phrases" value={(selected.phrases || []).join(", ")} />
                  <DetailRow label="Topics" value={(selected.topics || []).join(", ")} />
                </div>
              </DetailSection>
            ) : null}

            {selected.cefrLevel || selected.ieltsBand || selected.repetitions !== undefined ? (
              <DetailSection title="Learning status" className="glass-panel" style={{ border: "none", padding: "20px", borderRadius: "16px" }}>
                <div className="detail-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "12px" }}>
                  {selected.cefrLevel ? <div className="detail-metric glass-panel" style={{ border: "none" }}><span>CEFR</span><strong style={{ color: "var(--accent-blue)" }}>{selected.cefrLevel}</strong></div> : null}
                  {selected.ieltsBand ? <div className="detail-metric glass-panel" style={{ border: "none" }}><span>IELTS</span><strong style={{ color: "var(--accent-emerald)" }}>{selected.ieltsBand}</strong></div> : null}
                  <div className="detail-metric glass-panel" style={{ border: "none" }}><span>Rep</span><strong>{selected.repetitions}</strong></div>
                  <div className="detail-metric glass-panel" style={{ border: "none" }}><span>EF</span><strong>{selected.easeFactor}</strong></div>
                  <div className="detail-metric glass-panel" style={{ border: "none" }}><span>Lapses</span><strong style={{ color: "var(--danger)" }}>{selected.lapses}</strong></div>
                  <div className="detail-metric glass-panel" style={{ border: "none" }}><span>Re-add</span><strong>{selected.readdCount}</strong></div>
                </div>
              </DetailSection>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editing)}
        title={editing ? `✏️ Edit: ${editing.term}` : "Edit card"}
        onClose={closeEdit}
        className="glass-panel"
        footer={
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", width: "100%" }}>
            <button type="button" className="btn glass-panel" onClick={closeEdit} disabled={saving} style={{ padding: "10px 20px", borderRadius: "12px" }}>Cancel</button>
            <button type="button" className="btn primary" onClick={submitEdit} disabled={saving} style={{ padding: "10px 24px", borderRadius: "12px", background: "var(--accent-emerald)", color: "white", border: "none", fontWeight: 600 }}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        {editing ? (
          <div className="form-grid" style={{ display: "grid", gap: "16px", padding: "16px 0" }}>
            <div className="field">
              <label style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "8px", display: "block" }}>Term</label>
              <input value={editing.term} onChange={(e) => updateEditing("term", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none" }} />
            </div>
            
            <div style={{ background: "var(--surface-2)", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)" }}>
              <ChipInput label="Meanings" values={editing.meanings} onChange={(v) => updateEditing("meanings", v)} />
            </div>
            
            <div className="field">
              <label style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "8px", display: "block" }}>IPA</label>
              <input value={editing.ipa} onChange={(e) => updateEditing("ipa", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none" }} />
            </div>

            <div className="field-row two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="field">
                <label style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "8px", display: "block" }}>Example (EN)</label>
                <textarea value={editing.exampleEn} rows={3} onChange={(e) => updateEditing("exampleEn", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none", resize: "vertical" }} />
              </div>
              <div className="field">
                <label style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "8px", display: "block" }}>Example (VI)</label>
                <textarea value={editing.exampleVi} rows={3} onChange={(e) => updateEditing("exampleVi", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none", resize: "vertical" }} />
              </div>
            </div>

            <div className="field">
              <label style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "8px", display: "block" }}>Mnemonic</label>
              <textarea value={editing.mnemonic} rows={2} onChange={(e) => updateEditing("mnemonic", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none", resize: "vertical" }} />
            </div>

            <div style={{ display: "grid", gap: "12px", background: "var(--surface-2)", padding: "16px", borderRadius: "16px", border: "1px solid var(--line)" }}>
              <ChipInput label="Tags" values={editing.tags} onChange={(v) => updateEditing("tags", v)} />
              <ChipInput label="Collocations" values={editing.collocations} onChange={(v) => updateEditing("collocations", v)} />
              <ChipInput label="Phrases" values={editing.phrases} onChange={(v) => updateEditing("phrases", v)} />
              <ChipInput label="Topics" values={editing.topics} onChange={(v) => updateEditing("topics", v)} />
            </div>

            <div className="field-row two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div className="field">
                <label style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "8px", display: "block" }}>CEFR</label>
                <select value={editing.cefrLevel} onChange={(e) => updateEditing("cefrLevel", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none" }}>
                  <option value="">(none)</option>
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                  <option value="C1">C1</option>
                  <option value="C2">C2</option>
                </select>
              </div>
              <div className="field">
                <label style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "8px", display: "block" }}>IELTS band</label>
                <input type="number" min="1" max="9" step="0.5" value={editing.ieltsBand} onChange={(e) => updateEditing("ieltsBand", e.target.value)} style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "var(--surface-2)", outline: "none" }} />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
