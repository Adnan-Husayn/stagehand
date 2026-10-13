// Test helpers. Everything here is offline: a scripted transport stands in for Qloo.
import { RunContext } from "@/lib/agent/context";
import type { ToolOutcome, AgentTool } from "@/lib/agent/types";
import { createQlooClient, type QlooTransport } from "@/lib/qloo/client";
import type { VenueProfile } from "@/lib/types/stagehand";

export interface Reply {
  status: number;
  body: unknown;
}

export interface RecordedCall {
  path: string;
  params: Record<string, string>;
}

export type Handler = (path: string, params: Record<string, string>) => Reply;

/** A transport that answers from a handler and records every request it receives. */
export function scriptedTransport(handler: Handler): QlooTransport & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async request(path, params) {
      const flat = Object.fromEntries(params.entries());
      calls.push({ path, params: flat });
      return handler(path, flat);
    },
  };
}

/** Raw entity as Qloo search returns it (entity_id, name, type). */
export function rawEntity(id: string, name: string, type = "urn:entity:artist", extra: Record<string, unknown> = {}) {
  return { entity_id: id, name, type, ...extra };
}

/** /search success: results is a bare array, with no success flag or duration. */
export function searchOk(results: unknown[]): Reply {
  return { status: 200, body: { results } };
}

/** /v2/insights success: results.entities. */
export function insightsOk(entities: unknown[]): Reply {
  return { status: 200, body: { success: true, results: { entities } } };
}

export function venue(overrides: Partial<VenueProfile> = {}): VenueProfile {
  return {
    venueName: "The Test Room",
    city: "Asheville, NC",
    capacity: 300,
    genres: [],
    seedArtists: [],
    ...overrides,
  };
}

export function makeContext(transport: QlooTransport, overrides: Partial<VenueProfile> = {}, demo = false): RunContext {
  return new RunContext(createQlooClient(transport, "live"), venue(overrides), demo);
}

export function toolByName(tools: AgentTool[], name: string): AgentTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool;
}

/** Runs one tool through the same path the agent loop uses. */
export function callTool(ctx: RunContext, tools: AgentTool[], name: string, input: unknown): Promise<ToolOutcome> {
  return toolByName(tools, name).run(input, ctx);
}
