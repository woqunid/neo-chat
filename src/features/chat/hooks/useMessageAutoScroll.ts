import {
  useCallback,
  useEffect,
  useRef,
  type TouchEventHandler,
  type WheelEventHandler,
} from "react";

const DETACH_THRESHOLD_PX = 160;
const RESUME_THRESHOLD_PX = 8;
const TOUCH_DIRECTION_THRESHOLD_PX = 4;
const SCROLL_IDLE_DELAY_MS = 120;

interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

interface MessageAutoScrollOptions {
  enabled: boolean;
  updateKey: unknown;
}

export interface MutableFlagRef {
  current: boolean;
}

export function getDistanceFromBottom({
  scrollHeight,
  scrollTop,
  clientHeight,
}: ScrollMetrics): number {
  return Math.max(0, scrollHeight - scrollTop - clientHeight);
}

export function resolveFollowingState(
  isFollowing: boolean,
  distanceFromBottom: number,
): boolean {
  const threshold = isFollowing ? DETACH_THRESHOLD_PX : RESUME_THRESHOLD_PX;
  return distanceFromBottom <= threshold;
}

function useTouchScrollIntent(
  isFollowingRef: MutableFlagRef,
  markUserScrolling: () => void,
) {
  const touchStartYRef = useRef<number | null>(null);
  const handleTouchStart: TouchEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
      markUserScrolling();
    },
    [markUserScrolling],
  );
  const handleTouchMove: TouchEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY === null || currentY === undefined) return;
      markUserScrolling();
      if (currentY - startY > TOUCH_DIRECTION_THRESHOLD_PX) {
        isFollowingRef.current = false;
      }
    },
    [isFollowingRef, markUserScrolling],
  );
  const handleTouchEnd = useCallback(() => {
    touchStartYRef.current = null;
  }, []);

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}

function useUserScrollingTracker() {
  const isUserScrollingRef = useRef(false);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endUserScrolling = useCallback(() => {
    isUserScrollingRef.current = false;
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = null;
  }, []);
  const markUserScrolling = useCallback(() => {
    isUserScrollingRef.current = true;
    if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
    scrollIdleTimerRef.current = setTimeout(
      endUserScrolling,
      SCROLL_IDLE_DELAY_MS,
    );
  }, [endUserScrolling]);

  useEffect(() => endUserScrolling, [endUserScrolling]);
  return { isUserScrollingRef, markUserScrolling, endUserScrolling };
}

export function useMessageAutoScroll({
  enabled,
  updateKey,
}: MessageAutoScrollOptions) {
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
  const { isUserScrollingRef, markUserScrolling, endUserScrolling } =
    useUserScrollingTracker();

  const touchHandlers = useTouchScrollIntent(isFollowingRef, markUserScrolling);

  const handleScroll = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    const wasFollowing = isFollowingRef.current;
    isFollowingRef.current = resolveFollowingState(
      wasFollowing,
      getDistanceFromBottom(container),
    );
    if (!wasFollowing || !isFollowingRef.current) markUserScrolling();
  }, [markUserScrolling]);

  const handleWheel: WheelEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      markUserScrolling();
      if (event.deltaY < 0) isFollowingRef.current = false;
    },
    [markUserScrolling],
  );

  useEffect(() => {
    void updateKey;
    const container = messagesScrollRef.current;
    if (!enabled || !container || !isFollowingRef.current) return;

    const frameId = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frameId);
  }, [enabled, updateKey]);

  return {
    messagesScrollRef,
    isUserScrollingRef,
    handleScroll,
    handleScrollEnd: endUserScrolling,
    handleWheel,
    ...touchHandlers,
  };
}
