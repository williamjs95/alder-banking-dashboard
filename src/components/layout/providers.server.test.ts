// @vitest-environment node
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { getQueryClient } from "./providers";

describe("getQueryClient on the server", () => {
  it("runs without a browser", () => {
    expect(typeof window).toBe("undefined");
  });

  it("makes a new client for every render, so one request never sees another's data", () => {
    const first = getQueryClient();
    const second = getQueryClient();

    expect(first).toBeInstanceOf(QueryClient);
    expect(second).toBeInstanceOf(QueryClient);
    expect(second).not.toBe(first);

    first.setQueryData(["overview"], { totalBalanceCents: 1 });
    expect(second.getQueryData(["overview"])).toBeUndefined();
  });

  it("uses the same defaults as the browser client", () => {
    expect(getQueryClient().getDefaultOptions().queries).toMatchObject({
      refetchOnWindowFocus: false,
      retry: 1,
    });
  });
});
