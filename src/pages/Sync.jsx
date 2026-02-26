import React, { useState } from "react";
import Spinner from "../components/Spinner";

function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Sync({ api, onToast }) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [rawPreview, setRawPreview] = useState("");

  const doExport = async () => {
    if (!api?.has("syncExport")) {
      onToast("Sync export endpoint is missing.", "error");
      return;
    }

    setExporting(true);
    try {
      const data = await api.syncExport();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(`vocab-sync-${stamp}.json`, data);
      setRawPreview(JSON.stringify(data, null, 2));
      onToast("Export complete.", "success");
    } catch (e) {
      onToast(e.message || "Export failed.", "error");
    } finally {
      setExporting(false);
    }
  };

  const doImport = async (file) => {
    if (!file) return;
    if (!api?.has("syncImport")) {
      onToast("Sync import endpoint is missing.", "error");
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const report = await api.syncImport(json);
      setImportReport(report);
      onToast("Import complete.", "success");
    } catch (e) {
      onToast(e.message || "Import failed.", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page-grid one">
      <section className="card">
        <h2>Backup and sync</h2>
        <p className="muted">Export JSON for backup or import to merge from another device.</p>

        <div className="actions">
          <button type="button" className="btn primary" onClick={doExport} disabled={exporting}>
            {exporting ? "Exporting..." : "Export JSON"}
          </button>

          <label className="btn" htmlFor="sync-import-file">
            {importing ? "Importing..." : "Import JSON"}
          </label>
          <input id="sync-import-file" type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => doImport(e.target.files?.[0])} />
        </div>

        {exporting || importing ? <Spinner small label="Processing..." /> : null}

        {importReport ? (
          <div className="summary-box">
            <h3>Import report</h3>
            <p>addedVocabs: {importReport.addedVocabs}</p>
            <p>updatedVocabs: {importReport.updatedVocabs}</p>
            <p>addedLogs: {importReport.addedLogs}</p>
            <p>conflicts: {importReport.conflicts}</p>
          </div>
        ) : null}

        {rawPreview ? (
          <div className="json-preview">
            <h3>Export preview</h3>
            <pre>{rawPreview}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
