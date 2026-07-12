import { describe, expect, it } from "vitest";
import {
  enqueueSessionMessageWrite,
  flushSessionMessageWrites,
  waitForSessionMessageWrites,
} from "../store/sessionMessagePersistence";

describe("session message persistence", () => {
  it("serializes writes per session and preserves the newest snapshot", async () => {
    const writes: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = enqueueSessionMessageWrite(
      "session-a",
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = () => {
            writes.push("old");
            resolve();
          };
        }),
    );
    const second = enqueueSessionMessageWrite("session-a", async () => {
      writes.push("new");
    });

    await Promise.resolve();
    expect(writes).toEqual([]);
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(writes).toEqual(["old", "new"]);
    expect(waitForSessionMessageWrites("session-a")).toBeUndefined();
  });

  it("allows later writes after a failure while rejecting the failed caller", async () => {
    const failed = enqueueSessionMessageWrite("session-b", async () => {
      throw new Error("write failed");
    });
    const succeeded = enqueueSessionMessageWrite("session-b", async () => {});

    await expect(failed).rejects.toThrow("write failed");
    await expect(succeeded).resolves.toBeUndefined();
  });

  it("flushes writes added while a flush is in progress", async () => {
    let releaseFirst: (() => void) | undefined;
    let secondFinished = false;
    const first = enqueueSessionMessageWrite(
      "session-c",
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const flush = flushSessionMessageWrites();
    const second = enqueueSessionMessageWrite("session-d", async () => {
      secondFinished = true;
    });

    releaseFirst?.();
    await Promise.all([first, second, flush]);
    expect(secondFinished).toBe(true);
  });
});
