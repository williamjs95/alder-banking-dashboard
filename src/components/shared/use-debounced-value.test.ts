import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./use-debounced-value";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("useDebouncedValue", () => {
  it("returns the initial value straight away", () => {
    const { result } = renderHook(() => useDebouncedValue("stripe", 200));

    expect(result.current).toBe("stripe");
  });

  it("holds the old value until the new one has been stable for the delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    expect(result.current).toBe("a");

    advance(199);
    expect(result.current).toBe("a");

    advance(1);
    expect(result.current).toBe("ab");
  });

  it("restarts the wait on every change, skipping intermediate values", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "" } },
    );
    const seen = new Set<string>();
    const record = () => seen.add(result.current);

    for (const value of ["s", "st", "str"]) {
      rerender({ value });
      advance(150);
      record();
    }
    // 150ms after the last keystroke: still waiting.
    expect(result.current).toBe("");

    advance(50);
    record();
    expect(result.current).toBe("str");
    expect([...seen]).toEqual(["", "str"]);
  });

  it("respects a change to the delay", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 1, delay: 200 } },
    );

    rerender({ value: 2, delay: 1000 });
    advance(999);
    expect(result.current).toBe(1);

    advance(1);
    expect(result.current).toBe(2);
  });

  it("cancels the pending update when unmounted", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 200),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(result.current).toBe("a");
  });
});
