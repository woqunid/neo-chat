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

interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

interface MessageAutoScrollOptions {
  enabled: boolean;
  updateKey: unknown;
}

interface MutableFlagRef {
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

function useTouchScrollIntent(isFollowingRef: MutableFlagRef) {
  const touchStartYRef = useRef<number | null>(null);
  const handleTouchStart: TouchEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    },
    [],
  );
  const handleTouchMove: TouchEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      const startY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (startY === null || currentY === undefined) return;
      if (currentY - startY > TOUCH_DIRECTION_THRESHOLD_PX) {
        isFollowingRef.current = false;
      }
    },
    [isFollowingRef],
  );
  const handleTouchEnd = useCallback(() => {
    touchStartYRef.current = null;
  }, []);

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}

export function useMessageAutoScroll({
  enabled,
  updateKey,
}: MessageAutoScrollOptions) {
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
  const touchHandlers = useTouchScrollIntent(isFollowingRef);

  const handleScroll = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    isFollowingRef.current = resolveFollowingState(
      isFollowingRef.current,
      getDistanceFromBottom(container),
    );
  }, []);

  const handleWheel: WheelEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      if (event.deltaY < 0) isFollowingRef.current = false;
    },
    [],
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
    handleScroll,
    handleWheel,
    ...touchHandlers,
  };
}
