// file: src/test/questionStages.test.ts
import { describe, it, expect } from "vitest";
import {
  QUESTION_STAGES,
  DEFAULT_QUESTION_STAGE_SETTINGS,
  isStageEnabled,
  getEnabledStages,
} from "@/lib/questionStages";
import { DEFAULT_SESSION_SETTINGS } from "@/types/settings";

const LEGACY_IDS = ["genre", "era", "runtime", "language"] as const;

describe("isStageEnabled", () => {
  it("keeps the original four stages on when the setting is missing entirely", () => {
    for (const id of LEGACY_IDS) expect(isStageEnabled(undefined, id)).toBe(true);
  });

  it("keeps the rating stage off when the setting is missing entirely", () => {
    expect(isStageEnabled(undefined, "rating")).toBe(false);
  });

  // The migration case: an install that saved its settings before the stage existed.
  it("keeps the rating stage off for a stored config that predates it", () => {
    const legacy = { genre: true, era: true, runtime: true, language: true };
    expect(isStageEnabled(legacy, "rating")).toBe(false);
  });

  it("honours an explicit value over the default", () => {
    expect(isStageEnabled({ rating: true }, "rating")).toBe(true);
    expect(isStageEnabled({ genre: false }, "genre")).toBe(false);
  });
});

describe("getEnabledStages", () => {
  it("omits the rating stage by default and preserves registry order", () => {
    expect(getEnabledStages(undefined).map((s) => s.id)).toEqual([...LEGACY_IDS]);
  });

  it("asks the rating stage last once it is switched on", () => {
    expect(getEnabledStages({ rating: true }).map((s) => s.id)).toEqual([...LEGACY_IDS, "rating"]);
  });
});

describe("stage defaults", () => {
  it("derive the settings default from each stage's defaultEnabled", () => {
    for (const stage of QUESTION_STAGES) {
      expect(DEFAULT_QUESTION_STAGE_SETTINGS[stage.id]).toBe(stage.defaultEnabled);
      expect(DEFAULT_SESSION_SETTINGS.question_stages[stage.id]).toBe(stage.defaultEnabled);
    }
  });
});
