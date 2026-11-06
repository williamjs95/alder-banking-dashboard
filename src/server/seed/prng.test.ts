// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRng, hashSeed } from "./prng";

const take = <T>(count: number, draw: () => T): T[] =>
  Array.from({ length: count }, draw);

describe("hashSeed", () => {
  it("matches the published FNV-1a 32-bit test vectors", () => {
    expect(hashSeed("")).toBe(0x811c9dc5);
    expect(hashSeed("a")).toBe(0xe40c292c);
    expect(hashSeed("foobar")).toBe(0xbf9cf968);
  });

  it("gives the same unsigned 32-bit number for the same input", () => {
    const hash = hashSeed("0b3f6a52-7c1d-4e8a-9f20-5d6c7b8a9e01");

    expect(hash).toBe(hashSeed("0b3f6a52-7c1d-4e8a-9f20-5d6c7b8a9e01"));
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it("separates inputs that differ by one character", () => {
    expect(hashSeed("workspace-1")).not.toBe(hashSeed("workspace-2"));
  });
});

describe("createRng", () => {
  it("replays the same sequence for the same seed", () => {
    const first = createRng(42);
    const second = createRng(42);

    expect(take(50, first.next)).toEqual(take(50, second.next));
  });

  it("produces a different sequence for a different seed", () => {
    expect(take(10, createRng(1).next)).not.toEqual(
      take(10, createRng(2).next),
    );
  });

  it("treats the seed as an unsigned 32-bit integer", () => {
    expect(take(5, createRng(-1).next)).toEqual(
      take(5, createRng(0xffffffff).next),
    );
  });

  it("draws floats in [0, 1) that are spread evenly", () => {
    const draws = take(10_000, createRng(7).next);

    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
    const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it("draws integers across the whole inclusive range and never outside it", () => {
    const rng = createRng(7);
    const seen = new Set(take(500, () => rng.int(1, 6)));

    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns the only possible integer when the range is a single value", () => {
    const rng = createRng(7);

    expect(take(20, () => rng.int(9, 9))).toEqual(Array(20).fill(9));
  });

  it("never fires at probability 0 and always fires at probability 1", () => {
    const rng = createRng(7);

    expect(take(200, () => rng.chance(0))).not.toContain(true);
    expect(take(200, () => rng.chance(1))).not.toContain(false);
  });

  it("fires roughly as often as the probability asks", () => {
    const rng = createRng(7);
    const hits = take(10_000, () => rng.chance(0.25)).filter(Boolean).length;

    expect(hits).toBeGreaterThan(2_300);
    expect(hits).toBeLessThan(2_700);
  });

  it("picks every item of a list eventually and nothing else", () => {
    const rng = createRng(7);
    const items = ["ach", "wire", "card"] as const;
    const seen = new Set(take(200, () => rng.pick(items)));

    expect([...seen].sort()).toEqual(["ach", "card", "wire"]);
  });

  it("generates RFC 4122 version 4 identifiers", () => {
    const rng = createRng(7);

    for (const id of take(100, rng.uuid)) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it("generates identifiers that do not repeat and are reproducible", () => {
    const ids = take(1_000, createRng(7).uuid);

    expect(new Set(ids).size).toBe(1_000);
    expect(take(1_000, createRng(7).uuid)).toEqual(ids);
  });
});
