// Small input validators for tool calls. They throw InputError with a message the model can act on.

export class InputError extends Error {}

type Obj = Record<string, unknown>;

function asObject(input: unknown): Obj {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InputError("Tool input must be a JSON object.");
  }
  return input as Obj;
}

export function str(input: unknown, key: string, max = 200): string {
  const value = asObject(input)[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new InputError(`"${key}" must be a non-empty string.`);
  }
  if (value.length > max) throw new InputError(`"${key}" is longer than ${max} characters.`);
  return value.trim();
}

export function optStr(input: unknown, key: string, max = 200): string | undefined {
  const value = asObject(input)[key];
  if (value === undefined || value === null || value === "") return undefined;
  return str(input, key, max);
}

export function strArr(input: unknown, key: string, min: number, max: number): string[] {
  const value = asObject(input)[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.trim() === "")) {
    throw new InputError(`"${key}" must be an array of non-empty strings.`);
  }
  const items = [...new Set(value.map((v) => (v as string).trim()))];
  if (items.length < min || items.length > max) {
    throw new InputError(`"${key}" must contain between ${min} and ${max} unique items.`);
  }
  return items;
}

export function optInt(input: unknown, key: string, min: number, max: number, fallback: number): number {
  const value = asObject(input)[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new InputError(`"${key}" must be an integer from ${min} to ${max}.`);
  }
  return value;
}

export function oneOf<T extends string>(input: unknown, key: string, allowed: readonly T[]): T {
  const value = asObject(input)[key];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new InputError(`"${key}" must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function objArr(input: unknown, key: string, min: number, max: number): Obj[] {
  const value = asObject(input)[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "object" || v === null || Array.isArray(v))) {
    throw new InputError(`"${key}" must be an array of objects.`);
  }
  if (value.length < min || value.length > max) {
    throw new InputError(`"${key}" must contain between ${min} and ${max} items.`);
  }
  return value as Obj[];
}

export function field(obj: Obj, key: string, max: number): string {
  return str(obj, key, max);
}

export function optStrArr(input: unknown, key: string, max: number): string[] {
  const value = asObject(input)[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.trim() === "")) {
    throw new InputError(`"${key}" must be an array of non-empty strings.`);
  }
  const items = [...new Set(value.map((v) => (v as string).trim()))];
  if (items.length > max) throw new InputError(`"${key}" can hold at most ${max} items.`);
  return items;
}

export function objField(input: unknown, key: string): Obj {
  const value = asObject(input)[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InputError(`"${key}" must be an object.`);
  }
  return value as Obj;
}
