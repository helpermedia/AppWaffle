import { useEffect, useRef, useState } from "react";
import { DragEngine } from "@/lib/helper-dnd";
import type { GridItem, DragState, Rect, Point, DropAnimationTarget } from "@/lib/helper-dnd";

/** Overlap information for folder creation */
export interface OverlapInfo {
  /** ID of the item being overlapped */
  targetId: string;
  /** Index of the item being overlapped */
  targetIndex: number;
  /** Overlap ratio (0-1) */
  ratio: number;
}

/** Drag move event for folder creation integration */
export interface DragMoveInfo {
  /** ID of the item being dragged */
  activeId: string;
  /** Index of the item being dragged */
  activeIndex: number;
  /** Current center position */
  activeCenter: Point;
  /** Current pointer position */
  pointer: Point;
  /** Overlap with target item (if any) */
  overlap: OverlapInfo | null;
}

/** Drag end event for folder creation integration */
export interface DragEndInfo {
  /** ID of the item being dragged */
  activeId: string;
  /** ID of the target item (highest overlap) */
  overId: string | null;
  /** Overlap ratio with target (0-1) */
  overlapRatio: number;
  /** From index */
  fromIndex: number;
  /** To index (from center-crossing detection) */
  toIndex: number;
}

/** Callback to complete drag operation and show original item */
export type DragCompleteCallback = () => void;

/** Info passed to getDropAnimationTarget */
export interface DropAnimationInfo {
  /** ID of the item being dragged */
  activeId: string;
  /** ID of the target item with highest overlap (if any) */
  overId: string | null;
  /** Overlap ratio (0-1) */
  overlapRatio: number;
}

interface UseDragGridOptions {
  /** Initial order (null means not yet loaded) */
  initialOrder: string[] | null;
  /** Called when order changes (reorder completed) */
  onOrderChange?: (newOrder: string[]) => void;
  /** Called on every drag move (for folder creation detection) */
  onDragMove?: (info: DragMoveInfo) => void;
  /** Called when drag ends (for folder creation detection). Must call `complete()` to show original item. */
  onDragEnd?: (info: DragEndInfo, reorder: () => void, complete: DragCompleteCallback) => void;
  /**
   * Called before drop animation to determine animation target.
   * Return null to skip animation (for folder actions).
   * Return undefined to use default reorder slot animation.
   */
  getDropAnimationTarget?: (info: DropAnimationInfo) => DropAnimationTarget | null | undefined;
  /** Called when item is dropped outside the container bounds */
  onDragOutside?: (appId: string) => void;
  /** Called when drag exits container bounds (during drag, not on drop) */
  onDragExit?: (appId: string) => void;
}

interface UseDragGridReturn {
  /** Attach to container element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Current order of item IDs */
  order: string[] | null;
  /** Set order directly (for external updates) */
  setOrder: React.Dispatch<React.SetStateAction<string[] | null>>;
  /** Currently dragging */
  isDragging: boolean;
  /** ID of item being dragged */
  activeId: string | null;
  /** Index of item being dragged */
  activeIndex: number | null;
  /** Get the underlying DragEngine instance (for coordination) */
  getEngine: () => DragEngine | null;
}

/**
 * Calculate overlap ratio between two rects.
 * Returns 0-1 where 1 means complete overlap.
 */
function calculateOverlap(activeRect: Rect, targetRect: Rect): number {
  const overlapLeft = Math.max(activeRect.left, targetRect.left);
  const overlapRight = Math.min(
    activeRect.left + activeRect.width,
    targetRect.left + targetRect.width
  );
  const overlapTop = Math.max(activeRect.top, targetRect.top);
  const overlapBottom = Math.min(
    activeRect.top + activeRect.height,
    targetRect.top + targetRect.height
  );

  if (overlapRight <= overlapLeft || overlapBottom <= overlapTop) {
    return 0;
  }

  const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
  const activeArea = activeRect.width * activeRect.height;

  return activeArea > 0 ? overlapArea / activeArea : 0;
}

/**
 * Check if an item is shifted (between active and target indices).
 * Shifted items use CSS transforms and their cached rects are not accurate.
 */
function isItemShifted(itemIndex: number, activeIndex: number, targetIndex: number): boolean {
  if (activeIndex === targetIndex) return false;
  const minIdx = Math.min(activeIndex, targetIndex);
  const maxIdx = Math.max(activeIndex, targetIndex);
  // Items between active and target (exclusive of active) are shifted
  return itemIndex > minIdx && itemIndex <= maxIdx;
}

/**
 * Find the item with highest overlap (excluding the active item and shifted items).
 */
function findHighestOverlap(
  activeRect: Rect,
  items: GridItem[],
  activeIndex: number,
  targetIndex: number = activeIndex
): OverlapInfo | null {
  let highest: OverlapInfo | null = null;

  for (const item of items) {
    // Skip active item and shifted items (their cached positions are invalid)
    if (item.index === activeIndex) continue;
    if (isItemShifted(item.index, activeIndex, targetIndex)) continue;

    const ratio = calculateOverlap(activeRect, item.rect);
    if (ratio > 0 && (highest === null || ratio > highest.ratio)) {
      highest = {
        targetId: item.id,
        targetIndex: item.index,
        ratio,
      };
    }
  }

  return highest;
}

/**
 * Reorder an array by moving an item from one index to another.
 */
function arrayMove<T>(array: T[], fromIndex: number, toIndex: number): T[] {
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

export function useDragGrid({
  initialOrder,
  onOrderChange,
  onDragMove,
  onDragEnd,
  getDropAnimationTarget,
  onDragOutside,
  onDragExit,
}: UseDragGridOptions): UseDragGridReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DragEngine | null>(null);

  const [order, setOrder] = useState<string[] | null>(initialOrder);
  const [isDragging, setIsDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Keep refs for callbacks to avoid stale closures
  const orderRef = useRef(order);
  const onOrderChangeRef = useRef(onOrderChange);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  const getDropAnimationTargetRef = useRef(getDropAnimationTarget);
  const onDragOutsideRef = useRef(onDragOutside);
  const onDragExitRef = useRef(onDragExit);

  // Update refs in effect to avoid updating during render
  useEffect(() => {
    orderRef.current = order;
    onOrderChangeRef.current = onOrderChange;
    onDragMoveRef.current = onDragMove;
    onDragEndRef.current = onDragEnd;
    getDropAnimationTargetRef.current = getDropAnimationTarget;
    onDragOutsideRef.current = onDragOutside;
    onDragExitRef.current = onDragExit;
  });

  // Initialize engine
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new DragEngine(container);

    engine.on("onDragStart", (item: GridItem) => {
      setIsDragging(true);
      setActiveId(item.id);
      setActiveIndex(item.index);
    });

    // Callback to determine drop animation target
    engine.on("getDropAnimationTarget", (state: DragState) => {
      if (!getDropAnimationTargetRef.current) return undefined;

      const items = engine.getItems();

      // Calculate current rect of active item
      const dx = state.currentPointer.x - state.startPointer.x;
      const dy = state.currentPointer.y - state.startPointer.y;
      const activeRect: Rect = {
        left: state.activeItem.rect.left + dx,
        top: state.activeItem.rect.top + dy,
        width: state.activeItem.rect.width,
        height: state.activeItem.rect.height,
        center: state.activeCenter,
      };

      // Find overlap (skip shifted items - their cached positions are invalid)
      const overlap = findHighestOverlap(activeRect, items, state.activeItem.index, state.targetIndex);

      return getDropAnimationTargetRef.current({
        activeId: state.activeItem.id,
        overId: overlap?.targetId ?? null,
        overlapRatio: overlap?.ratio ?? 0,
      });
    });

    engine.on("onDragMove", (state: DragState) => {
      // Check if pointer exited container bounds during drag
      if (onDragExitRef.current) {
        const containerRect = container.getBoundingClientRect();
        const pointer = state.currentPointer;
        const isOutside =
          pointer.x < containerRect.left ||
          pointer.x > containerRect.right ||
          pointer.y < containerRect.top ||
          pointer.y > containerRect.bottom;

        if (isOutside) {
          const appId = state.activeItem.id;
          const currentOrder = orderRef.current;

          // Remove from order
          if (currentOrder) {
            const newOrder = currentOrder.filter((id) => id !== appId);
            setOrder(newOrder);
            if (onOrderChangeRef.current) {
              queueMicrotask(() => onOrderChangeRef.current?.(newOrder));
            }
          }

          // Cancel the drag and cleanup
          engine.cancel();
          setIsDragging(false);
          setActiveId(null);
          setActiveIndex(null);

          // Notify parent
          onDragExitRef.current(appId);
          return;
        }
      }

      if (!onDragMoveRef.current) return;

      const items = engine.getItems();

      // Calculate current rect of active item based on pointer movement
      const dx = state.currentPointer.x - state.startPointer.x;
      const dy = state.currentPointer.y - state.startPointer.y;
      const activeRect: Rect = {
        left: state.activeItem.rect.left + dx,
        top: state.activeItem.rect.top + dy,
        width: state.activeItem.rect.width,
        height: state.activeItem.rect.height,
        center: state.activeCenter,
      };

      // Find overlap for folder creation (skip shifted items)
      const overlap = findHighestOverlap(activeRect, items, state.activeItem.index, state.targetIndex);

      onDragMoveRef.current({
        activeId: state.activeItem.id,
        activeIndex: state.activeItem.index,
        activeCenter: state.activeCenter,
        pointer: state.currentPointer,
        overlap,
      });
    });

    engine.on("onDragEnd", (fromIndex: number, toIndex: number) => {
      const items = engine.getItems();
      const activeItem = items[fromIndex];
      const currentOrder = orderRef.current;

      // Check if dropped outside container bounds
      const state = engine.getState();
      if (state && onDragOutsideRef.current) {
        const containerRect = container.getBoundingClientRect();
        const pointer = state.currentPointer;
        const isOutside =
          pointer.x < containerRect.left ||
          pointer.x > containerRect.right ||
          pointer.y < containerRect.top ||
          pointer.y > containerRect.bottom;

        if (isOutside) {
          // Remove from order and call outside handler
          if (currentOrder) {
            const newOrder = currentOrder.filter((id) => id !== activeItem.id);
            setOrder(newOrder);
            if (onOrderChangeRef.current) {
              queueMicrotask(() => onOrderChangeRef.current?.(newOrder));
            }
          }
          setIsDragging(false);
          setActiveId(null);
          setActiveIndex(null);
          onDragOutsideRef.current(activeItem.id);
          return;
        }
      }

      // Find highest overlap at drop time
      let overId: string | null = null;
      let overlapRatio = 0;

      if (state) {
        const dx = state.currentPointer.x - state.startPointer.x;
        const dy = state.currentPointer.y - state.startPointer.y;
        const activeRect: Rect = {
          left: state.activeItem.rect.left + dx,
          top: state.activeItem.rect.top + dy,
          width: state.activeItem.rect.width,
          height: state.activeItem.rect.height,
          center: state.activeCenter,
        };
        const overlap = findHighestOverlap(activeRect, items, fromIndex, toIndex);
        if (overlap) {
          overId = overlap.targetId;
          overlapRatio = overlap.ratio;
        }
      }

      // Complete callback - shows original item. Must be called by handler.
      const complete = () => {
        setIsDragging(false);
        setActiveId(null);
        setActiveIndex(null);
      };

      // Create reorder function
      const reorder = () => {
        if (!currentOrder || fromIndex === toIndex) return;

        const newOrder = arrayMove(currentOrder, fromIndex, toIndex);
        setOrder(newOrder);

        if (onOrderChangeRef.current) {
          queueMicrotask(() => onOrderChangeRef.current?.(newOrder));
        }
      };

      // Let external handler decide whether to reorder or do something else
      if (onDragEndRef.current) {
        onDragEndRef.current(
          {
            activeId: activeItem?.id ?? "",
            overId,
            overlapRatio,
            fromIndex,
            toIndex,
          },
          reorder,
          complete
        );
      } else {
        // No external handler, just reorder and complete
        reorder();
        complete();
      }
    });

    engine.on("onDragCancel", () => {
      setIsDragging(false);
      setActiveId(null);
      setActiveIndex(null);
    });

    engine.enable();
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []); // Only run on mount

  return {
    containerRef,
    order,
    setOrder,
    isDragging,
    activeId,
    activeIndex,
    getEngine: () => engineRef.current,
  };
}
