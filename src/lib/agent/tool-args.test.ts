import { describe, expect, it } from "vitest";
import { parseToolArguments } from "./tool-args";

const SCHEMA = {
  type: "object",
  properties: {
    entity_kind: { type: "string" },
    interest_entity_ids: { type: "array", items: { type: "string" } },
    take: { type: "integer" },
    local_only: { type: "boolean" },
    artists: {
      type: "array",
      items: { type: "object", properties: { entity_id: { type: "string" }, why: { type: "string" } } },
    },
  },
};

describe("parseToolArguments", () => {
  it("parses plain JSON and treats empty text as an empty object", () => {
    expect(parseToolArguments('{"entity_kind":"artist"}', SCHEMA)).toEqual({ ok: true, value: { entity_kind: "artist" } });
    expect(parseToolArguments("", SCHEMA)).toEqual({ ok: true, value: {} });
  });

  it("returns a readable error for invalid JSON", () => {
    const result = parseToolArguments('{"entity_kind": "artist"', SCHEMA);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not valid JSON/);
  });

  it("recovers JSON inside code fences and surrounding prose", () => {
    expect(parseToolArguments('```json\n{"take": 5}\n```', SCHEMA)).toEqual({ ok: true, value: { take: 5 } });
    expect(parseToolArguments('Sure! {"take": 5} Done.', SCHEMA)).toEqual({ ok: true, value: { take: 5 } });
  });

  it("unwraps arguments that were sent as a JSON string, or wrapped in an arguments key", () => {
    const doubled = JSON.stringify(JSON.stringify({ entity_kind: "brand" }));
    expect(parseToolArguments(doubled, SCHEMA)).toEqual({ ok: true, value: { entity_kind: "brand" } });
    const wrapped = JSON.stringify({ arguments: JSON.stringify({ entity_kind: "brand" }) });
    expect(parseToolArguments(wrapped, SCHEMA)).toEqual({ ok: true, value: { entity_kind: "brand" } });
  });

  it("repairs arrays, numbers and booleans that arrive as strings", () => {
    const text = JSON.stringify({
      interest_entity_ids: '["a","b"]',
      take: "7",
      local_only: "true",
      artists: JSON.stringify([{ entity_id: "x", why: "y" }]),
    });
    expect(parseToolArguments(text, SCHEMA)).toEqual({
      ok: true,
      value: { interest_entity_ids: ["a", "b"], take: 7, local_only: true, artists: [{ entity_id: "x", why: "y" }] },
    });
  });

  it("rejects arguments that are not an object", () => {
    expect(parseToolArguments("[1,2]", SCHEMA).ok).toBe(false);
    expect(parseToolArguments("42", SCHEMA).ok).toBe(false);
  });
});
