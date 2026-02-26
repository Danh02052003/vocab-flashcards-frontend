import { requestJson, DEFAULT_BASE_URL } from "./base";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

function toLower(value) {
  return String(value || "").toLowerCase();
}

function includesAny(text, keywords) {
  const t = toLower(text);
  return (keywords || []).some((k) => t.includes(toLower(k)));
}

function opText(op) {
  return `${op.operationId} ${op.summary} ${op.description} ${op.path} ${(op.tags || []).join(" ")}`.toLowerCase();
}

export function flattenOperations(schema) {
  const operations = [];
  if (!schema || !schema.paths) return operations;

  Object.entries(schema.paths).forEach(([path, methods]) => {
    HTTP_METHODS.forEach((method) => {
      const raw = methods?.[method];
      if (!raw) return;
      operations.push({
        id: raw.operationId || `${method}_${path}`,
        operationId: raw.operationId || `${method}_${path}`,
        summary: raw.summary || "",
        description: raw.description || "",
        tags: Array.isArray(raw.tags) && raw.tags.length ? raw.tags : ["default"],
        method: method.toUpperCase(),
        methodLower: method,
        path,
        raw,
      });
    });
  });

  return operations;
}

export function groupOperationsByTag(operations) {
  const map = {};
  (operations || []).forEach((op) => {
    (op.tags || ["default"]).forEach((tag) => {
      if (!map[tag]) map[tag] = [];
      map[tag].push(op);
    });
  });

  Object.keys(map).forEach((tag) => {
    map[tag].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
  });

  return map;
}

function scoreOperation(op, rule) {
  if (rule.method && toLower(op.method) !== toLower(rule.method)) return -1;
  if (rule.pathIncludes && !includesAny(op.path, rule.pathIncludes)) return -1;
  if (rule.pathExcludes && includesAny(op.path, rule.pathExcludes)) return -1;
  if (rule.tagIncludes && !includesAny((op.tags || []).join(" "), rule.tagIncludes)) return -1;
  if (rule.textIncludes && !includesAny(opText(op), rule.textIncludes)) return -1;

  let score = 0;
  if (rule.method) score += 3;
  if (rule.pathIncludes) score += 5;
  if (rule.tagIncludes) score += 3;
  if (rule.textIncludes) score += 2;
  if (rule.preferPathExact && toLower(op.path) === toLower(rule.preferPathExact)) score += 8;
  if (rule.preferOperationId && includesAny(op.operationId, [rule.preferOperationId])) score += 3;
  return score;
}

function findBest(operations, rules) {
  let best = null;
  let bestScore = -1;

  (operations || []).forEach((op) => {
    (rules || []).forEach((rule) => {
      const score = scoreOperation(op, rule);
      if (score > bestScore) {
        best = op;
        bestScore = score;
      }
    });
  });

  return best;
}

export function discoverCoreOperations(schema) {
  const operations = flattenOperations(schema);

  const core = {
    health: findBest(operations, [
      { method: "GET", preferPathExact: "/health", pathIncludes: ["health"] },
    ]),
    addVocab: findBest(operations, [
      { method: "POST", tagIncludes: ["vocab"], pathIncludes: ["/vocab"], pathExcludes: ["upsert"] },
      { method: "POST", pathIncludes: ["/vocab"], pathExcludes: ["upsert"] },
    ]),
    upsertVocab: findBest(operations, [
      { method: "POST", tagIncludes: ["vocab"], pathIncludes: ["upsert"] },
      { method: "POST", textIncludes: ["upsert", "ai"], pathIncludes: ["vocab"] },
    ]),
    listVocab: findBest(operations, [
      { method: "GET", tagIncludes: ["vocab"], pathIncludes: ["/vocab"], pathExcludes: ["{"], preferPathExact: "/vocab" },
      { method: "GET", pathIncludes: ["/vocab"], pathExcludes: ["{"] },
    ]),
    getVocab: findBest(operations, [
      { method: "GET", tagIncludes: ["vocab"], pathIncludes: ["/vocab", "{"] },
    ]),
    updateVocab: findBest(operations, [
      { method: "PUT", tagIncludes: ["vocab"], pathIncludes: ["/vocab", "{"] },
      { method: "PATCH", tagIncludes: ["vocab"], pathIncludes: ["/vocab", "{"] },
    ]),
    deleteVocab: findBest(operations, [
      { method: "DELETE", tagIncludes: ["vocab"], pathIncludes: ["/vocab", "{"] },
    ]),
    sessionToday: findBest(operations, [
      { method: "GET", pathIncludes: ["session", "today"] },
      { method: "GET", tagIncludes: ["session"], textIncludes: ["today"] },
    ]),
    submitReview: findBest(operations, [
      { method: "POST", pathIncludes: ["review"], pathExcludes: ["logs"] },
    ]),
    aiEnrich: findBest(operations, [
      { method: "POST", pathIncludes: ["ai", "enrich"] },
      { method: "POST", tagIncludes: ["ai"], textIncludes: ["enrich"] },
    ]),
    aiJudge: findBest(operations, [
      { method: "POST", pathIncludes: ["judge"] },
      { method: "POST", tagIncludes: ["ai"], textIncludes: ["equivalence", "judge"] },
    ]),
    syncExport: findBest(operations, [
      { method: "GET", pathIncludes: ["sync", "export"] },
    ]),
    syncImport: findBest(operations, [
      { method: "POST", pathIncludes: ["sync", "import"] },
    ]),
  };

  return { operations, core };
}

export function getPathParams(path) {
  const matches = String(path || "").match(/\{([^}]+)\}/g) || [];
  return matches.map((m) => m.replace(/[{}]/g, ""));
}

export function buildPath(pathTemplate, pathParams = {}) {
  let result = pathTemplate;
  getPathParams(pathTemplate).forEach((param) => {
    const raw = pathParams[param];
    result = result.replace(`{${param}}`, encodeURIComponent(String(raw ?? "")));
  });
  return result;
}

function dereference(schema, ref) {
  if (!schema || !ref) return null;
  const parts = String(ref).replace(/^#\//, "").split("/");
  let current = schema;
  for (const part of parts) {
    current = current?.[part];
    if (!current) return null;
  }
  return current;
}

export function resolveSchema(schema, node) {
  if (!node) return null;
  if (node.$ref) {
    const resolved = dereference(schema, node.$ref);
    return resolved ? resolveSchema(schema, resolved) : null;
  }

  if (Array.isArray(node.allOf)) {
    const out = { type: "object", properties: {}, required: [] };
    node.allOf.forEach((part) => {
      const rs = resolveSchema(schema, part);
      if (!rs) return;
      if (rs.properties) out.properties = { ...out.properties, ...rs.properties };
      if (Array.isArray(rs.required)) {
        out.required = [...new Set([...(out.required || []), ...rs.required])];
      }
    });
    return out;
  }

  return node;
}

export function getOperationParameters(op, location) {
  const list = Array.isArray(op?.raw?.parameters) ? op.raw.parameters : [];
  return list.filter((p) => p.in === location);
}

export function getRequestBodySchema(schema, op) {
  const content = op?.raw?.requestBody?.content;
  if (!content) return null;
  const rawSchema = content["application/json"]?.schema || content["application/*+json"]?.schema;
  return resolveSchema(schema, rawSchema);
}

export function buildExampleFromSchema(schema, depth = 0) {
  if (!schema || depth > 6) return null;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  const type = schema.type;
  if (type === "object" || schema.properties) {
    const out = {};
    Object.entries(schema.properties || {}).forEach(([key, value]) => {
      out[key] = buildExampleFromSchema(value, depth + 1);
    });
    return out;
  }

  if (type === "array") {
    return [buildExampleFromSchema(schema.items || {}, depth + 1)];
  }

  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  return "";
}

export async function callOperation({ baseUrl = DEFAULT_BASE_URL, op, pathParams, query, body, signal }) {
  if (!op) throw new Error("Operation kh么ng t峄搉 t岷 trong OpenAPI.");

  const path = buildPath(op.path, pathParams);
  const res = await requestJson({
    baseUrl,
    path,
    method: op.method,
    query,
    body,
    signal,
  });

  return res.data;
}

export function createApiClient({ schema, baseUrl = DEFAULT_BASE_URL }) {
  const discovered = discoverCoreOperations(schema);
  const { core } = discovered;

  const requireOp = (name) => {
    const op = core[name];
    if (!op) {
      throw new Error(`Backend ch瓢a expose operation '${name}'.`);
    }
    return op;
  };

  return {
    schema,
    baseUrl,
    operations: discovered.operations,
    core,
    has(name) {
      return Boolean(core[name]);
    },
    async health() {
      return callOperation({ baseUrl, op: requireOp("health") });
    },
    async addVocab(payload) {
      return callOperation({ baseUrl, op: requireOp("addVocab"), body: payload });
    },
    async upsertVocab(payload) {
      return callOperation({ baseUrl, op: requireOp("upsertVocab"), body: payload });
    },
    async listVocab(query = {}) {
      return callOperation({ baseUrl, op: requireOp("listVocab"), query });
    },
    async getVocab(vocabId) {
      const op = requireOp("getVocab");
      const key = getPathParams(op.path)[0];
      return callOperation({ baseUrl, op, pathParams: { [key]: vocabId } });
    },
    async updateVocab(vocabId, payload) {
      const op = requireOp("updateVocab");
      const key = getPathParams(op.path)[0];
      return callOperation({ baseUrl, op, pathParams: { [key]: vocabId }, body: payload });
    },
    async deleteVocab(vocabId) {
      const op = requireOp("deleteVocab");
      const key = getPathParams(op.path)[0];
      return callOperation({ baseUrl, op, pathParams: { [key]: vocabId } });
    },
    async sessionToday(limit = 30) {
      return callOperation({ baseUrl, op: requireOp("sessionToday"), query: { limit } });
    },
    async submitReview(payload) {
      return callOperation({ baseUrl, op: requireOp("submitReview"), body: payload });
    },
    async aiEnrich(payload) {
      return callOperation({ baseUrl, op: requireOp("aiEnrich"), body: payload });
    },
    async aiJudge(payload) {
      return callOperation({ baseUrl, op: requireOp("aiJudge"), body: payload });
    },
    async syncExport() {
      return callOperation({ baseUrl, op: requireOp("syncExport") });
    },
    async syncImport(payload) {
      return callOperation({ baseUrl, op: requireOp("syncImport"), body: payload });
    },
  };
}
