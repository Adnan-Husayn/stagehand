// Defensive parsing of tool arguments written by a language model.
// Smaller models sometimes send invalid JSON, wrap the arguments in a string, or send an
// array as a JSON string. Whatever is recovered here still goes through each tool's own validators.

export type ParsedArgs = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

const WRAPPER_KEYS = ["arguments", "args", "input", "parameters"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripFences(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : text.trim();
}

/** Finds the first balanced {...} block in text, ignoring braces inside strings. */
function firstObjectBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Parses text into a JSON value, unwrapping up to two layers of string encoding. */
function parseLoose(text: string): { ok: true; value: unknown } | { ok: false } {
  let current: unknown = stripFences(text);
  for (let layer = 0; layer < 3; layer++) {
    if (typeof current !== "string") return { ok: true, value: current };
    const direct = tryParse(stripFences(current));
    if (direct.ok) {
      current = direct.value;
      continue;
    }
    const block = firstObjectBlock(current);
    if (block) {
      const inner = tryParse(block);
      if (inner.ok) return inner;
    }
    return { ok: false };
  }
  return { ok: true, value: current };
}

function unwrap(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 2; depth++) {
    if (!isObject(current)) return current;
    const keys = Object.keys(current);
    if (keys.length !== 1 || !WRAPPER_KEYS.includes(keys[0])) return current;
    const inner = current[keys[0]];
    if (typeof inner === "string") {
      const parsed = parseLoose(inner);
      current = parsed.ok ? parsed.value : inner;
    } else {
      current = inner;
    }
  }
  return current;
}

interface SchemaNode {
  type?: unknown;
  properties?: Record<string, unknown>;
  items?: unknown;
}

/** Fixes values whose type is wrong in a way that is safe to repair: JSON text for arrays/objects, numeric text for numbers. */
function coerce(value: unknown, node: unknown): unknown {
  if (!isObject(node)) return value;
  const schema = node as SchemaNode;
  const type = schema.type;
  if (typeof value === "string") {
    if (type === "array" || type === "object") {
      const parsed = parseLoose(value);
      if (parsed.ok && (type === "array" ? Array.isArray(parsed.value) : isObject(parsed.value))) {
        return coerce(parsed.value, schema);
      }
      return value;
    }
    if (type === "integer" || type === "number") {
      const trimmed = value.trim();
      if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
      return value;
    }
    if (type === "boolean") {
      if (value.trim().toLowerCase() === "true") return true;
      if (value.trim().toLowerCase() === "false") return false;
    }
    return value;
  }
  if (type === "array" && Array.isArray(value)) {
    return value.map((item) => coerce(item, schema.items));
  }
  if (type === "object" && isObject(value) && schema.properties) {
    const out: Record<string, unknown> = { ...value };
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in out) out[key] = coerce(out[key], sub);
    }
    return out;
  }
  return value;
}

export function parseToolArguments(text: string, schema?: SchemaNode): ParsedArgs {
  if (text.trim() === "") return { ok: true, value: {} };
  const parsed = parseLoose(text);
  if (!parsed.ok) {
    return {
      ok: false,
      error: "Your tool arguments were not valid JSON. Call the tool again with a single JSON object that matches its schema.",
    };
  }
  const unwrapped = unwrap(parsed.value);
  if (unwrapped === null || unwrapped === undefined) return { ok: true, value: {} };
  if (!isObject(unwrapped)) {
    return {
      ok: false,
      error: "Tool arguments must be a JSON object, for example {\"query\": \"live music bar\"}. Call the tool again.",
    };
  }
  const coerced = schema ? coerce(unwrapped, { ...schema, type: "object" }) : unwrapped;
  return { ok: true, value: coerced as Record<string, unknown> };
}
