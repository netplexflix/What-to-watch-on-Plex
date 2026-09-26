// file: src/test/deepEqual.test.ts
import { describe, it, expect } from "vitest";
import { deepEqual } from "@/lib/deepEqual";

describe("deepEqual", () => {
  it("compares primitives by value", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(undefined, null)).toBe(false);
    expect(deepEqual(0, "0")).toBe(false);
  });

  // The admin Settings tab decides "unsaved changes" by comparing live state against a
  // snapshot. The two come from different object literals (loadSettings vs DEFAULT_SETTINGS)
  // and question_stages is nested, so key order must never make an untouched tab look dirty.
  it("ignores key order, including inside nested objects", () => {
    const a = { max_choices: 3, question_stages: { genre: true, era: true, runtime: false, language: true } };
    const b = { question_stages: { language: true, runtime: false, era: true, genre: true }, max_choices: 3 };
    expect(deepEqual(a, b)).toBe(true);
  });

  it("detects a changed nested value", () => {
    const a = { question_stages: { genre: true, era: true } };
    const b = { question_stages: { genre: true, era: false } };
    expect(deepEqual(a, b)).toBe(false);
  });

  it("detects missing and extra keys", () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(false);
  });

  it("compares arrays by position", () => {
    expect(deepEqual(["a", "b"], ["a", "b"])).toBe(true);
    expect(deepEqual(["a", "b"], ["b", "a"])).toBe(false);
    expect(deepEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("does not confuse arrays, objects and null", () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({}, [])).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
  });
});
