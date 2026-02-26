import React, { useEffect, useMemo, useState } from "react";
import { groupOperationsByTag, getOperationParameters, getRequestBodySchema, buildExampleFromSchema, callOperation } from "../api/client";

function pretty(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

function parseMaybeJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return undefined;
  return JSON.parse(raw);
}

export default function Advanced({ api, schema, onToast }) {
  const operations = useMemo(() => api?.operations ?? [], [api]);
  const grouped = useMemo(() => groupOperationsByTag(operations), [operations]);
  const tags = useMemo(() => Object.keys(grouped).sort((a, b) => a.localeCompare(b)), [grouped]);

  const [selectedTag, setSelectedTag] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pathParams, setPathParams] = useState({});
  const [queryParams, setQueryParams] = useState({});
  const [bodyText, setBodyText] = useState("");
  const [executing, setExecuting] = useState(false);
  const [responseText, setResponseText] = useState("");

  useEffect(() => {
    if (!tags.length) return;
    if (!selectedTag || !grouped[selectedTag]) setSelectedTag(tags[0]);
  }, [tags, selectedTag, grouped]);

  useEffect(() => {
    const ops = grouped[selectedTag] || [];
    if (!ops.length) {
      setSelectedId("");
      return;
    }
    if (!selectedId || !ops.find((x) => x.id === selectedId)) setSelectedId(ops[0].id);
  }, [grouped, selectedTag, selectedId]);

  const selectedOp = useMemo(() => operations.find((x) => x.id === selectedId) || null, [operations, selectedId]);

  useEffect(() => {
    if (!selectedOp) return;
    const p = {};
    const q = {};

    getOperationParameters(selectedOp, "path").forEach((item) => {
      p[item.name] = String(item.example ?? "");
    });
    getOperationParameters(selectedOp, "query").forEach((item) => {
      q[item.name] = String(item.example ?? "");
    });

    setPathParams(p);
    setQueryParams(q);

    const bodySchema = getRequestBodySchema(schema, selectedOp);
    setBodyText(bodySchema ? pretty(buildExampleFromSchema(bodySchema)) : "");
  }, [selectedOp, schema]);

  const execute = async () => {
    if (!selectedOp) return;
    setExecuting(true);
    try {
      const body = bodyText.trim() ? parseMaybeJson(bodyText) : undefined;
      const data = await callOperation({
        baseUrl: api.baseUrl,
        op: selectedOp,
        pathParams,
        query: queryParams,
        body,
      });
      setResponseText(pretty(data));
      onToast("Request succeeded.", "success");
    } catch (e) {
      setResponseText(pretty(e?.data || { message: e.message || "Request failed" }));
      onToast(e.message || "Request failed.", "error");
    } finally {
      setExecuting(false);
    }
  };

  const renderParamFields = (fields, valueMap, setValueMap) => {
    if (!fields.length) return <p className="muted">None.</p>;
    return fields.map((item) => (
      <div className="field" key={`${item.in}-${item.name}`}>
        <label>
          {item.name}
          {item.required ? " *" : ""}
        </label>
        <input value={valueMap[item.name] || ""} onChange={(e) => setValueMap((prev) => ({ ...prev, [item.name]: e.target.value }))} />
      </div>
    ));
  };

  return (
    <div className="page-grid advanced-layout">
      <section className="card">
        <h2>Advanced API explorer</h2>
        <p className="muted">Any backend endpoint discovered in OpenAPI is runnable here.</p>

        <div className="field">
          <label>Tag</label>
          <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
            {tags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Operation</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {(grouped[selectedTag] || []).map((op) => (
              <option key={op.id} value={op.id}>
                {op.method} {op.path} {op.summary ? `- ${op.summary}` : ""}
              </option>
            ))}
          </select>
        </div>

        {selectedOp ? (
          <div className="op-meta">
            <span className="pill">{selectedOp.method}</span>
            <span className="pill mono">{selectedOp.path}</span>
            {selectedOp.operationId ? <span className="pill">{selectedOp.operationId}</span> : null}
          </div>
        ) : null}

        {selectedOp ? (
          <>
            <h3>Path params</h3>
            <div className="form-grid">{renderParamFields(getOperationParameters(selectedOp, "path"), pathParams, setPathParams)}</div>

            <h3>Query params</h3>
            <div className="form-grid">{renderParamFields(getOperationParameters(selectedOp, "query"), queryParams, setQueryParams)}</div>

            <h3>JSON body</h3>
            <textarea className="json-area" rows={12} value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="{}" />

            <div className="actions">
              <button type="button" className="btn primary" onClick={execute} disabled={executing}>
                {executing ? "Running..." : "Execute"}
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className="card">
        <h2>Response</h2>
        <pre className="json-area readonly">{responseText || "(no response yet)"}</pre>
      </section>
    </div>
  );
}
