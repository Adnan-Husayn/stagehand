import { afterEach, describe, expect, it } from "vitest";
import { getConfig, parseTemperature, parseThinking } from "./config";

describe("LLM_TEMPERATURE and LLM_THINKING", () => {
  const saved = { t: process.env.LLM_TEMPERATURE, k: process.env.LLM_THINKING };
  afterEach(() => {
    if (saved.t === undefined) delete process.env.LLM_TEMPERATURE;
    else process.env.LLM_TEMPERATURE = saved.t;
    if (saved.k === undefined) delete process.env.LLM_THINKING;
    else process.env.LLM_THINKING = saved.k;
  });

  it("treats a missing value as 'do not send the field'", () => {
    delete process.env.LLM_TEMPERATURE;
    delete process.env.LLM_THINKING;
    const config = getConfig();
    expect(config.llmTemperature).toBeNull();
    expect(config.llmThinking).toBeNull();
  });

  it("parses valid values and ignores bad ones", () => {
    expect(parseTemperature("0")).toBe(0);
    expect(parseTemperature("1.3")).toBe(1.3);
    expect(parseTemperature("hot")).toBeNull();
    expect(parseTemperature("5")).toBeNull();
    expect(parseTemperature("-1")).toBeNull();
    expect(parseTemperature(null)).toBeNull();
    expect(parseThinking("Disabled")).toBe("disabled");
    expect(parseThinking("enabled")).toBe("enabled");
    expect(parseThinking("high")).toBeNull();
  });

  it("reads both from the environment", () => {
    process.env.LLM_TEMPERATURE = "0.5";
    process.env.LLM_THINKING = "disabled";
    const config = getConfig();
    expect(config.llmTemperature).toBe(0.5);
    expect(config.llmThinking).toBe("disabled");
  });
});
