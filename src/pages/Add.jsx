import React, { useMemo, useState } from "react";
import ChipInput from "../components/ChipInput";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";

const INITIAL = {
  term: "",
  meanings: [],
  ipa: "",
  exampleEn: "",
  exampleVi: "",
  mnemonic: "",
  tags: [],
  collocations: [],
  phrases: [],
  topics: [],
  cefrLevel: "",
  ieltsBand: "",
  inputMethod: "typed",
};

const BULK_ROW_COUNT = 10;
const BULK_COLUMNS = ["term", "definition", "example1", "example2", "ipa", "note"];

function createBulkRow() {
  return {
    term: "",
    definition: "",
    example1: "",
    example2: "",
    ipa: "",
    note: "",
  };
}

function normalizeList(values) {
  const seen = new Set();
  const out = [];
  (values || []).forEach((item) => {
    const text = String(item || "").trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out;
}

function parseMeanings(text) {
  return normalizeList(String(text || "").split(/[,;|\n]/g));
}

function looksLikeOrderToken(value) {
  return /^\s*\d+\s*[.)-]?\s*$/.test(String(value || ""));
}

function cleanInlineText(value) {
  return String(value || "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTermText(value) {
  let text = cleanInlineText(value);
  text = text.replace(/^\s*(?:[-*\u2022]+|\d+[.)-]?)\s*/, "");
  if (text === "-" || text === "\u2013") return "";
  return text;
}

function normalizeForLabel(value) {
  return cleanInlineText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase();
}
function mapSectionLabel(rawLabel) {
  const label = normalizeForLabel(rawLabel).replace(/:$/, "");
  if (label.includes("dinh nghia") || label.includes("definition") || label === "nghia") return "definition";
  if (label.includes("vi du") || label.includes("example")) return "example";
  if (label.includes("ghi chu") || label.includes("chu thich") || label.includes("note")) return "note";
  return null;
}

function lineLooksLikeHead(line) {
  const text = cleanInlineText(line);
  return /\/[^/\n]{2,}\/\s*$/.test(text) && /[a-zA-Z]/.test(text);
}

function parseSmartBlock(blockText) {
  const lines = String(blockText || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
  if (!lines.length) return null;

  const head = lines[0];
  const ipaMatch = head.match(/\/[^/\n]{2,}\//);
  const ipa = ipaMatch ? cleanInlineText(ipaMatch[0]) : "";
  const term = cleanTermText(ipaMatch ? head.replace(ipaMatch[0], "") : head);

  const sections = { definition: [], example: [], note: [] };
  let currentSection = null;

  lines.slice(1).forEach((rawLine) => {
    const line = cleanInlineText(rawLine);
    if (!line) return;

    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const section = mapSectionLabel(line.slice(0, colonIndex));
      if (section) {
        currentSection = section;
        const rest = cleanInlineText(line.slice(colonIndex + 1));
        if (rest) sections[currentSection].push(rest);
        return;
      }
    }

    const content = cleanInlineText(line.replace(/^[-*\u2022]\s*/, ""));
    if (!content) return;

    if (currentSection) {
      sections[currentSection].push(content);
      return;
    }

    if (!sections.definition.length) {
      sections.definition.push(content);
    }
  });

  return {
    term,
    definition: cleanInlineText(sections.definition.join(" ")),
    example1: sections.example[0] || "",
    example2: sections.example[1] || "",
    ipa,
    note: cleanInlineText(sections.note.join(" ")),
  };
}

function splitSmartBlocks(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let current = [];

  const flush = () => {
    const merged = current.join("\n").trim();
    if (merged) blocks.push(merged);
    current = [];
  };

  lines.forEach((line) => {
    const cleaned = cleanInlineText(line);
    if (lineLooksLikeHead(cleaned) && current.some((item) => cleanInlineText(item))) {
      flush();
    }
    current.push(line);
  });
  flush();

  if (!blocks.length && cleanInlineText(text)) return [String(text)];
  return blocks;
}

function buildSinglePayload(form) {
  return {
    term: cleanTermText(form.term),
    meanings: normalizeList(form.meanings),
    ipa: cleanInlineText(form.ipa) || null,
    exampleEn: cleanInlineText(form.exampleEn) || null,
    exampleVi: cleanInlineText(form.exampleVi) || null,
    mnemonic: cleanInlineText(form.mnemonic) || null,
    tags: normalizeList(form.tags),
    collocations: normalizeList(form.collocations),
    phrases: normalizeList(form.phrases),
    topics: normalizeList(form.topics),
    cefrLevel: form.cefrLevel || null,
    ieltsBand: form.ieltsBand ? Number(form.ieltsBand) : null,
    inputMethod: form.inputMethod,
  };
}

export default function Add({ api, onToast }) {
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState(Array.from({ length: BULK_ROW_COUNT }, () => createBulkRow()));
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkInputMethod, setBulkInputMethod] = useState("pasted");
  const [bulkUseAi, setBulkUseAi] = useState(false);
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [bulkReport, setBulkReport] = useState(null);
  const [smartImportText, setSmartImportText] = useState("");

  const canEnrich = useMemo(() => api?.has("aiEnrich"), [api]);
  const canUpsert = useMemo(() => api?.has("upsertVocab"), [api]);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateBulkRow = (index, key, value) => {
    setBulkRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const handleBulkPaste = (startRow, startCol, event) => {
    const text = event.clipboardData?.getData("text") || "";
    if (!text.includes("\n") && !text.includes("\t")) return;

    event.preventDefault();
    const lines = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim() !== "");

    if (!lines.length) return;

    setBulkRows((prev) => {
      const next = prev.map((row) => ({ ...row }));
      const neededLength = startRow + lines.length;

      if (neededLength > next.length) {
        for (let i = next.length; i < neededLength; i += 1) {
          next.push(createBulkRow());
        }
      }

      lines.forEach((line, rowOffset) => {
        let cells = line.split("\t");
        if (
          cells.length >= BULK_COLUMNS.length &&
          looksLikeOrderToken(cells[0]) &&
          /[a-zA-Z]/.test(String(cells[1] || ""))
        ) {
          cells = cells.slice(1);
        }

        cells.forEach((cell, colOffset) => {
          const colIndex = startCol + colOffset;
          if (colIndex < 0 || colIndex >= BULK_COLUMNS.length) return;
          const key = BULK_COLUMNS[colIndex];
          const normalizedCell = cleanInlineText(cell);
          next[startRow + rowOffset][key] = key === "term" ? cleanTermText(normalizedCell) : normalizedCell;
        });
      });

      return next;
    });

    setBulkInputMethod("pasted");
    onToast(`Pasted ${lines.length} row(s) into bulk table.`, "success");
  };

  const addBulkRows = (count = 5) => {
    setBulkRows((prev) => [...prev, ...Array.from({ length: count }, () => createBulkRow())]);
  };

  const resetBulk = () => {
    setBulkRows(Array.from({ length: BULK_ROW_COUNT }, () => createBulkRow()));
    setBulkInputMethod("pasted");
    setBulkUseAi(false);
    setBulkOverwrite(false);
    setBulkReport(null);
    setSmartImportText("");
  };

  const applySmartImport = () => {
    const raw = String(smartImportText || "").trim();
    if (!raw) {
      onToast("Please paste text before parsing.", "warning");
      return;
    }

    const parsedRows = splitSmartBlocks(raw)
      .map(parseSmartBlock)
      .filter((row) => row && cleanTermText(row.term));

    if (!parsedRows.length) {
      onToast("Cannot detect term/IPA/definition from this text.", "error");
      return;
    }

    setBulkRows((prev) => {
      const next = prev.map((row) => ({ ...row }));
      let startIndex = next.findIndex((row) => !cleanTermText(row.term));
      if (startIndex < 0) startIndex = next.length;

      const needed = startIndex + parsedRows.length;
      if (needed > next.length) {
        for (let i = next.length; i < needed; i += 1) {
          next.push(createBulkRow());
        }
      }

      parsedRows.forEach((row, i) => {
        next[startIndex + i] = {
          term: cleanTermText(row.term),
          definition: cleanInlineText(row.definition),
          example1: cleanInlineText(row.example1),
          example2: cleanInlineText(row.example2),
          ipa: cleanInlineText(row.ipa),
          note: cleanInlineText(row.note),
        };
      });

      return next;
    });

    setBulkInputMethod("pasted");
    onToast(`Parsed ${parsedRows.length} item(s) into bulk table.`, "success");
  };

  const handleAiEnrich = async () => {
    if (!canEnrich) {
      onToast("AI enrich endpoint is not available in OpenAPI.", "warning");
      return;
    }
    if (!form.term.trim()) {
      onToast("Please input term before using AI assist.", "warning");
      return;
    }

    setAiLoading(true);
    try {
      const data = await api.aiEnrich({
        term: form.term.trim(),
        meaningsExisting: normalizeList(form.meanings),
      });
      setAiData(data);
      onToast(data.aiCalled ? "AI generated new suggestions." : "Loaded suggestions from cache.", "success");
    } catch (error) {
      onToast(error.message || "AI enrich failed.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestions = () => {
    if (!aiData?.data) return;

    const suggestions = aiData.data;
    const next = { ...form };
    const example = Array.isArray(suggestions.examples) && suggestions.examples.length ? suggestions.examples[0] : null;
    const mnemonic = Array.isArray(suggestions.mnemonics) && suggestions.mnemonics.length ? suggestions.mnemonics[0] : "";

    if (example?.en && (!next.exampleEn || window.confirm("AI has a new EN example. Overwrite current value?"))) {
      next.exampleEn = example.en;
    }
    if (example?.vi && (!next.exampleVi || window.confirm("AI has a new VI example. Overwrite current value?"))) {
      next.exampleVi = example.vi;
    }
    if (mnemonic && (!next.mnemonic || window.confirm("AI has a new mnemonic. Overwrite current value?"))) {
      next.mnemonic = mnemonic;
    }
    if (suggestions.ipa && (!next.ipa || window.confirm("AI has a new IPA. Overwrite current value?"))) {
      next.ipa = suggestions.ipa;
    }

    next.meanings = normalizeList([...(next.meanings || []), ...(suggestions.meaningVariants || [])]);
    setForm(next);
    onToast("Merged AI suggestions into form.", "success");
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!api?.has("addVocab")) {
      onToast("Create vocab endpoint is not available.", "error");
      return;
    }

    const payload = buildSinglePayload(form);
    if (!payload.term) {
      onToast("Term is required.", "warning");
      return;
    }

    setSaving(true);
    try {
      const saved = await api.addVocab(payload);
      if (saved?.readdCount > 0) {
        onToast("Term already exists. It was pushed back to review queue.", "warning");
      } else {
        onToast("Saved new vocab.", "success");
      }
      setForm({ ...INITIAL, inputMethod: form.inputMethod });
      setAiData(null);
    } catch (error) {
      const detail = typeof error?.data?.detail === "object" ? JSON.stringify(error.data.detail) : "";
      onToast(`${error.message || "Save failed."}${detail ? ` | ${detail}` : ""}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const saveBulk = async () => {
    if (!api?.has("addVocab")) {
      onToast("Create vocab endpoint is not available.", "error");
      return;
    }

    const entries = bulkRows
      .map((row, idx) => ({ ...row, rowNo: idx + 1 }))
      .filter((row) => String(row.term || "").trim());

    if (!entries.length) {
      onToast("Please fill at least one row with term.", "warning");
      return;
    }

    setBulkSaving(true);
    const report = {
      total: entries.length,
      success: 0,
      failed: 0,
      created: 0,
      updated: 0,
      readded: 0,
      failures: [],
    };

    for (const row of entries) {
      const payload = {
        term: cleanTermText(row.term),
        meanings: parseMeanings(row.definition),
        ipa: cleanInlineText(row.ipa) || null,
        exampleEn: cleanInlineText(row.example1) || null,
        exampleVi: cleanInlineText(row.example2) || null,
        mnemonic: cleanInlineText(row.note) || null,
        inputMethod: bulkInputMethod,
      };

      try {
        if (canUpsert) {
          const upsertRes = await api.upsertVocab({
            ...payload,
            autoFixOnValidationFail: true,
            overwriteExisting: bulkOverwrite,
            useAi: bulkUseAi,
            forceAi: false,
            tags: [],
            collocations: [],
            phrases: [],
            topics: [],
            wordFamily: {},
            cefrLevel: null,
            ieltsBand: null,
          });
          report.success += 1;
          if (upsertRes?.action === "created") report.created += 1;
          if (upsertRes?.action === "updated") report.updated += 1;
        } else {
          const addRes = await api.addVocab(payload);
          report.success += 1;
          if ((addRes?.readdCount || 0) > 0) {
            report.readded += 1;
          } else {
            report.created += 1;
          }
        }
      } catch (error) {
        report.failed += 1;
        report.failures.push({
          rowNo: row.rowNo,
          term: payload.term,
          message: error.message || "Unknown error",
        });
      }
    }

    setBulkSaving(false);
    setBulkRows(Array.from({ length: BULK_ROW_COUNT }, () => createBulkRow()));
    setSmartImportText("");
    setBulkReport(report);
    onToast(`Bulk save finished. Success ${report.success}/${report.total}.`, report.failed ? "warning" : "success");
  };

  return (
    <div className="page-grid">
      <section className="card">
        <h2>Add vocab</h2>
        <p className="muted">Add one item quickly, or use Bulk Add table for many rows at once.</p>

        <form onSubmit={onSubmit} className="form-grid">
          <div className="field">
            <label>Term *</label>
            <input value={form.term} onChange={(e) => update("term", e.target.value)} placeholder="resilient" required />
          </div>

          <ChipInput label="Meanings" values={form.meanings} onChange={(v) => update("meanings", v)} placeholder="ben bi" />

          <div className="field-row two">
            <div className="field">
              <label>IPA</label>
              <input value={form.ipa} onChange={(e) => update("ipa", e.target.value)} placeholder="/uh-bound/" />
            </div>
            <div className="field">
              <label>Input method</label>
              <select value={form.inputMethod} onChange={(e) => update("inputMethod", e.target.value)}>
                <option value="typed">typed</option>
                <option value="pasted">pasted</option>
              </select>
            </div>
          </div>

          <div className="field-row two">
            <div className="field">
              <label>Example EN</label>
              <textarea value={form.exampleEn} onChange={(e) => update("exampleEn", e.target.value)} rows={3} />
            </div>
            <div className="field">
              <label>Example VI</label>
              <textarea value={form.exampleVi} onChange={(e) => update("exampleVi", e.target.value)} rows={3} />
            </div>
          </div>

          <div className="field">
            <label>Mnemonic</label>
            <textarea value={form.mnemonic} onChange={(e) => update("mnemonic", e.target.value)} rows={2} />
          </div>

          <ChipInput label="Tags" values={form.tags} onChange={(v) => update("tags", v)} placeholder="personality" />
          <ChipInput label="Collocations" values={form.collocations} onChange={(v) => update("collocations", v)} placeholder="highly resilient" />
          <ChipInput label="Phrases" values={form.phrases} onChange={(v) => update("phrases", v)} placeholder="build resilience" />
          <ChipInput label="Topics" values={form.topics} onChange={(v) => update("topics", v)} placeholder="Environment" />

          <div className="field-row two">
            <div className="field">
              <label>CEFR</label>
              <select value={form.cefrLevel} onChange={(e) => update("cefrLevel", e.target.value)}>
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
              <label>IELTS target band</label>
              <input type="number" min="1" max="9" step="0.5" value={form.ieltsBand} onChange={(e) => update("ieltsBand", e.target.value)} />
            </div>
          </div>

          <div className="actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Saving..." : "Save vocab"}
            </button>
            <button type="button" className="btn" onClick={handleAiEnrich} disabled={aiLoading || !canEnrich}>
              {aiLoading ? "AI loading..." : "AI Assist"}
            </button>
            <button type="button" className="btn" onClick={applyAiSuggestions} disabled={!aiData}>
              Merge AI
            </button>
            <button type="button" className="btn" onClick={() => setBulkOpen(true)}>
              Bulk add
            </button>
          </div>

          {saving ? <Spinner small label="Submitting..." /> : null}
        </form>
      </section>

      <section className="card">
        <h2>AI suggestions</h2>
        {!aiData ? <p className="muted">No AI data yet.</p> : null}
        {aiData ? (
          <div className="json-preview">
            <div>
              <strong>Provider:</strong> {aiData.provider || "unknown"}
            </div>
            <div>
              <strong>AI called:</strong> {String(Boolean(aiData.aiCalled))}
            </div>
            <div>
              <strong>From cache:</strong> {String(Boolean(aiData.fromCache))}
            </div>
            <pre>{JSON.stringify(aiData.data || {}, null, 2)}</pre>
          </div>
        ) : null}
      </section>

      <Modal
        open={bulkOpen}
        onClose={() => {
          setBulkOpen(false);
        }}
        className="bulk-modal-card"
        title="Create flashcards (Bulk)"
        footer={
          <>
            <button type="button" className="btn" onClick={resetBulk} disabled={bulkSaving}>
              Reset
            </button>
            <button type="button" className="btn" onClick={() => addBulkRows(5)} disabled={bulkSaving}>
              +5 rows
            </button>
            <button type="button" className="btn" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
              Close
            </button>
            <button type="button" className="btn primary" onClick={saveBulk} disabled={bulkSaving}>
              {bulkSaving ? "Saving..." : "Save all"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field-row three">
            <div className="field">
              <label>Input method</label>
              <select value={bulkInputMethod} onChange={(e) => setBulkInputMethod(e.target.value)} disabled={bulkSaving}>
                <option value="typed">typed</option>
                <option value="pasted">pasted</option>
              </select>
            </div>
            <div className="field check-line">
              <input type="checkbox" checked={bulkUseAi} onChange={(e) => setBulkUseAi(e.target.checked)} disabled={bulkSaving || !canUpsert} />
              <label>Use AI (upsert only)</label>
            </div>
            <div className="field check-line">
              <input type="checkbox" checked={bulkOverwrite} onChange={(e) => setBulkOverwrite(e.target.checked)} disabled={bulkSaving || !canUpsert} />
              <label>Overwrite existing</label>
            </div>
          </div>

          {!canUpsert ? <p className="muted">Backend has no upsert endpoint. Bulk will call POST /vocab per row.</p> : null}

          <div className="field">
            <label>Smart import text</label>
            <textarea
              rows={7}
              value={smartImportText}
              onChange={(e) => setSmartImportText(e.target.value)}
              disabled={bulkSaving}
              placeholder={"abound /uh-bound/\nDefinition:\nplentiful, existing in large numbers\nExamples:\nRumors abound about the accident\nOpportunities abound in this industry\nNote:\nFormal usage, common in IELTS Reading"}
            />
            <div className="actions">
              <button type="button" className="btn" onClick={applySmartImport} disabled={bulkSaving || !smartImportText.trim()}>
                Parse to table
              </button>
            </div>
          </div>

          <div className="bulk-grid-wrap">
            <table className="bulk-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Term</th>
                  <th>Definition (split by ; or ,)</th>
                  <th>Example 1 (EN)</th>
                  <th>Example 2 (VI)</th>
                  <th>IPA</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, idx) => (
                  <tr key={`bulk-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>
                      <input
                        value={row.term}
                        onChange={(e) => updateBulkRow(idx, "term", e.target.value)}
                        onPaste={(e) => handleBulkPaste(idx, 0, e)}
                        disabled={bulkSaving}
                      />
                    </td>
                    <td>
                      <input
                        value={row.definition}
                        onChange={(e) => updateBulkRow(idx, "definition", e.target.value)}
                        onPaste={(e) => handleBulkPaste(idx, 1, e)}
                        disabled={bulkSaving}
                      />
                    </td>
                    <td>
                      <input
                        value={row.example1}
                        onChange={(e) => updateBulkRow(idx, "example1", e.target.value)}
                        onPaste={(e) => handleBulkPaste(idx, 2, e)}
                        disabled={bulkSaving}
                      />
                    </td>
                    <td>
                      <input
                        value={row.example2}
                        onChange={(e) => updateBulkRow(idx, "example2", e.target.value)}
                        onPaste={(e) => handleBulkPaste(idx, 3, e)}
                        disabled={bulkSaving}
                      />
                    </td>
                    <td>
                      <input
                        value={row.ipa}
                        onChange={(e) => updateBulkRow(idx, "ipa", e.target.value)}
                        onPaste={(e) => handleBulkPaste(idx, 4, e)}
                        disabled={bulkSaving}
                      />
                    </td>
                    <td>
                      <input
                        value={row.note}
                        onChange={(e) => updateBulkRow(idx, "note", e.target.value)}
                        onPaste={(e) => handleBulkPaste(idx, 5, e)}
                        disabled={bulkSaving}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Tip: paste tab-separated rows into first cell and table will auto-fill all columns.</p>

          {bulkSaving ? <Spinner small label="Bulk saving..." /> : null}

          {bulkReport ? (
            <div className="summary-box">
              <h3>Bulk result</h3>
              <p>Total: {bulkReport.total}</p>
              <p>Success: {bulkReport.success}</p>
              <p>Failed: {bulkReport.failed}</p>
              <p>Created: {bulkReport.created}</p>
              <p>Updated: {bulkReport.updated}</p>
              <p>Re-added: {bulkReport.readded}</p>
              {bulkReport.failures.length ? (
                <ul>
                  {bulkReport.failures.map((f) => (
                    <li key={`${f.rowNo}-${f.term}`}>
                      Row {f.rowNo} ({f.term}): {f.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}


