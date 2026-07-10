import { describe, expect, it } from "vitest";
import {
  getDistanceFromBottom,
  resolveFollowingState,
} from "../features/chat/hooks/useMessageAutoScroll";

describe("message auto scroll", () => {
  it("calculates a non-negative distance from the bottom", () => {
    expect(
      getDistanceFromBottom({
        scrollHeight: 1_000,
        scrollTop: 700,
        clientHeight: 200,
      }),
    ).toBe(100);
    expect(
      getDistanceFromBottom({
        scrollHeight: 500,
        scrollTop: 0,
        clientHeight: 600,
      }),
    ).toBe(0);
  });

  it("does not resume following until the user returns to the bottom", () => {
    expect(resolveFollowingState(true, 100)).toBe(true);
    expect(resolveFollowingState(true, 161)).toBe(false);
    expect(resolveFollowingState(false, 100)).toBe(false);
    expect(resolveFollowingState(false, 9)).toBe(false);
    expect(resolveFollowingState(false, 8)).toBe(true);
  });
});
