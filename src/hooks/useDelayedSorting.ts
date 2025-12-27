import { useRef, useCallback } from "react";
import { rectSortingStrategy, type SortingStrategy } from "@dnd-kit/sortable";
import { useDndSettings } from "@/hooks/useConfig";

interface HoverState {
  targetIndex: number | null;
  startTime: number;
  confirmed: boolean;
}

interface UseDelayedSortingOptions {
  /** Skip the delay entirely (e.g., when dragging folders) */
  skipDelay?: boolean;
}

/**
 * Creates a sorting strategy that delays item shifting until
 * the dragged item has been over a position for the specified delay.
 */
export function useDelayedSorting(options: UseDelayedSortingOptions = {}) {
  const { skipDelay = false } = options;
  const { sortingDelay } = useDndSettings();
  const hoverStateRef = useRef<HoverState>({
    targetIndex: null,
    startTime: 0,
    confirmed: false,
  });

  const confirmedIndexRef = useRef<number | null>(null);

  const strategy: SortingStrategy = useCallback(
    ({ activeIndex, activeNodeRect, index, rects, overIndex }) => {
      // Skip delay entirely - use default sorting immediately
      if (skipDelay) {
        return rectSortingStrategy({
          activeIndex,
          activeNodeRect,
          index,
          rects,
          overIndex,
        });
      }

      const now = Date.now();
      const state = hoverStateRef.current;

      // If hovering over original position, clear confirmed index
      // This allows items to snap back when user returns to start
      if (overIndex === activeIndex) {
        confirmedIndexRef.current = null;
        hoverStateRef.current = {
          targetIndex: overIndex,
          startTime: now,
          confirmed: false,
        };
        return null;
      }

      // If overIndex changed, reset the timer
      if (overIndex !== state.targetIndex) {
        hoverStateRef.current = {
          targetIndex: overIndex,
          startTime: now,
          confirmed: false,
        };
      } else if (!state.confirmed && now - state.startTime >= sortingDelay) {
        // Same target and delay passed - confirm it
        state.confirmed = true;
        confirmedIndexRef.current = overIndex;
      }

      // Use the confirmed index for computing transforms
      const effectiveOverIndex = state.confirmed
        ? overIndex
        : confirmedIndexRef.current;

      // If no confirmed position yet, don't shift items
      if (effectiveOverIndex === null) {
        return null;
      }

      // Use the default strategy with our effective index
      return rectSortingStrategy({
        activeIndex,
        activeNodeRect,
        index,
        rects,
        overIndex: effectiveOverIndex,
      });
    },
    [skipDelay, sortingDelay]
  );

  // Reset state when drag ends
  const resetDelayState = useCallback(() => {
    hoverStateRef.current = {
      targetIndex: null,
      startTime: 0,
      confirmed: false,
    };
    confirmedIndexRef.current = null;
  }, []);

  return { strategy, resetDelayState };
}
