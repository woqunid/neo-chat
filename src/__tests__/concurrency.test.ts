import { describe, expect, it } from "vitest";
import {
  mapSettledWithConcurrency,
  mapWithConcurrency,
} from "../lib/utils/concurrency";

describe("concurrency helpers", () => {
  it("limits peak concurrency and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        active -= 1;
        return value * 2;
      },
    );
    expect(peak).toBe(2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("preserves fulfilled and rejected settled results", async () => {
    const results = await mapSettledWithConcurrency(
      [1, 2, 3],
      2,
      async (value) => {
        if (value === 2) throw new Error("failed");
        return value;
      },
    );
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
  });

  it("rejects invalid concurrency values", async () => {
    await expect(mapWithConcurrency([], 0, async () => 1)).rejects.toThrow(
      RangeError,
    );
  });
});
