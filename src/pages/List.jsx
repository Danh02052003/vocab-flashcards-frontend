import React, { useEffect, useMemo, useState } from "react";
import Modal from "../components/Modal";
import ChipInput from "../components/ChipInput";
import { formatDateTime, isDue } from "../utils/date";

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
  text = text.replace(/^\s*(?:[-*•]+|\d+[.)-]?)\s*/, "");
  if (text === "-" || text === "–") return "";
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

export default function List({ api, onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

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

  const filteredItems = useMemo(() => {
    if (!onlyDue) return items;
    return items.filter((item) => isDue(item.dueAt));
  }, [items, onlyDue]);

  const openEdit = (item) => setEditing(createEditModel(item));
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
      onToast("Card deleted.", "success");
    } catch (e) {
      onToast(e.message || "Delete failed.", "error");
    }
  };

  return (
    <div className="page-grid one">
      <section className="card">
        <div className="row-between">
          <div>
            <h2>Vocabulary cards</h2>
            <p className="muted">Responsive card layout with quick edit/delete actions.</p>
          </div>
          <button type="button" className="btn" onClick={loadList} disabled={loading}>
            Reload
          </button>
        </div>

        <form
          className="field-row four"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            loadList();
          }}
        >
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search term, meaning, or tag" />
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag filter" />
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <button type="submit" className="btn primary">Search</button>
        </form>

        <label className="check-line">
          <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
          Show due cards only
        </label>

        <div className="pager">
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>
            Prev
          </button>
          <span>Page {page}</span>
          <button type="button" className="btn" onClick={() => setPage((v) => v + 1)}>
            Next
          </button>
        </div>

        {loading ? (
          <div className="skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        ) : null}

        {!loading && filteredItems.length === 0 ? <p>No cards found.</p> : null}

        {!loading && filteredItems.length > 0 ? (
          <div className="vocab-masonry">
            {filteredItems.map((item) => (
              <article key={item.id} className="vocab-card">
                <div className="row-between">
                  <h3>{cleanTermText(item.term) || "(empty term)"}</h3>
                  <span className={`status-chip ${isDue(item.dueAt) ? "warn" : "ok"}`}>{isDue(item.dueAt) ? "Due" : "Scheduled"}</span>
                </div>

                {item.ipa ? <p className="mono">{item.ipa}</p> : null}
                <p>{(item.meanings || []).slice(0, 3).join("; ") || "No meanings"}</p>

                {(item.tags || []).length ? (
                  <div className="chip-line">
                    {item.tags.slice(0, 4).map((tagValue) => (
                      <span key={`${item.id}-${tagValue}`} className="chip">
                        {tagValue}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="vocab-meta">
                  <small>Due: {formatDateTime(item.dueAt)}</small>
                  <small>Rep {item.repetitions} | EF {item.easeFactor} | Lapses {item.lapses}</small>
                </div>

                <div className="inline-actions">
                  <button type="button" className="btn" onClick={() => openEdit(item)}>Edit</button>
                  <button type="button" className="btn danger" onClick={() => removeItem(item.id, item.term)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <Modal
        open={Boolean(editing)}
        title={editing ? `Edit: ${editing.term}` : "Edit card"}
        onClose={closeEdit}
        footer={
          <>
            <button type="button" className="btn" onClick={closeEdit} disabled={saving}>Cancel</button>
            <button type="button" className="btn primary" onClick={submitEdit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        {editing ? (
          <div className="form-grid">
            <div className="field">
              <label>Term</label>
              <input value={editing.term} onChange={(e) => updateEditing("term", e.target.value)} />
            </div>
            <ChipInput label="Meanings" values={editing.meanings} onChange={(v) => updateEditing("meanings", v)} />
            <div className="field">
              <label>IPA</label>
              <input value={editing.ipa} onChange={(e) => updateEditing("ipa", e.target.value)} />
            </div>

            <div className="field-row two">
              <div className="field">
                <label>Example EN</label>
                <textarea value={editing.exampleEn} rows={3} onChange={(e) => updateEditing("exampleEn", e.target.value)} />
              </div>
              <div className="field">
                <label>Example VI</label>
                <textarea value={editing.exampleVi} rows={3} onChange={(e) => updateEditing("exampleVi", e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label>Mnemonic</label>
              <textarea value={editing.mnemonic} rows={2} onChange={(e) => updateEditing("mnemonic", e.target.value)} />
            </div>

            <ChipInput label="Tags" values={editing.tags} onChange={(v) => updateEditing("tags", v)} />
            <ChipInput label="Collocations" values={editing.collocations} onChange={(v) => updateEditing("collocations", v)} />
            <ChipInput label="Phrases" values={editing.phrases} onChange={(v) => updateEditing("phrases", v)} />
            <ChipInput label="Topics" values={editing.topics} onChange={(v) => updateEditing("topics", v)} />

            <div className="field-row two">
              <div className="field">
                <label>CEFR</label>
                <select value={editing.cefrLevel} onChange={(e) => updateEditing("cefrLevel", e.target.value)}>
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
                <label>IELTS band</label>
                <input type="number" min="1" max="9" step="0.5" value={editing.ieltsBand} onChange={(e) => updateEditing("ieltsBand", e.target.value)} />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
