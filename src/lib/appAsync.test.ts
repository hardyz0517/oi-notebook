import { describe, expect, it, vi } from "vitest";
import {
  getErrorMessage,
  runLimitedConcurrencyQueue,
  sleepMs,
  withTimeout,
  yieldToUi,
} from "./appAsync";

describe("appAsync", () => {
  it("extracts useful messages from unknown errors", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("plain")).toBe("plain");
    expect(getErrorMessage(null)).toBe("null");
  });

  it("resolves values before timeout and rejects timeout failures", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "too slow")).resolves.toBe("ok");
    await expect(withTimeout(new Promise(() => undefined), 1, "too slow")).rejects.toThrow("too slow");
  });

  it("sleeps for the requested delay", async () => {
    vi.useFakeTimers();
    const promise = sleepMs(20);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(19);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBeUndefined();
    expect(settled).toBe(true);
    vi.useRealTimers();
  });

  it("yields to requestAnimationFrame when available", async () => {
    const originalWindow = globalThis.window;
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(1);
      return 1;
    });
    vi.stubGlobal("window", {
      requestAnimationFrame,
      setTimeout,
    });

    await yieldToUi();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    vi.stubGlobal("window", originalWindow);
  });

  it("runs queue workers with a concurrency limit and preserves item indexes", async () => {
    let active = 0;
    let maxActive = 0;
    const seen: Array<[string, number]> = [];
    const releases: Array<() => void> = [];

    const queue = runLimitedConcurrencyQueue(
      ["a", "b", "c", "d"],
      2,
      () => true,
      async (item, index) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        seen.push([item, index]);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
      },
      async () => undefined,
    );

    await vi.waitFor(() => {
      expect(seen).toHaveLength(2);
    });
    releases.splice(0).forEach((release) => release());

    await vi.waitFor(() => {
      expect(seen).toHaveLength(4);
    });
    releases.splice(0).forEach((release) => release());

    await queue;

    expect(maxActive).toBe(2);
    expect(seen).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 3],
    ]);
  });

  it("stops queue workers when shouldContinue returns false", async () => {
    const seen: number[] = [];

    await runLimitedConcurrencyQueue(
      [1, 2, 3],
      1,
      () => seen.length < 1,
      async (item) => {
        seen.push(item);
      },
      async () => undefined,
    );

    expect(seen).toEqual([1]);
  });
});
