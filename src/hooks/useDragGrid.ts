import { useEffect, useRef, useState } from "react";
import { DragEngine } from "@/lib/dnd";
import type { GridItem, DragState, Rect, Point } from "@/lib/dnd";

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
  /** From index */
  fromIndex: number;
  /** To index (from center-crossing detection) */
  toIndex: number;
}

interface UseDragGridOptions {
  /** Initial order (null means not yet loaded) */
  initialOrder: string[] | null;
  /** Called when order changes (reorder completed) */
  onOrderChange?: (newOrder: string[]) => void;
  /** Called on every drag move (for folder creation detection) */
  onDragMove?: (info: DragMoveInfo) => void;
  /** Called when drag ends (for folder creation detection) */
  onDragEnd?: (info: DragEndInfo, reorder: () => void) => void;
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
 * Find the item with highest overlap (excluding the active item).
 */
function findHighestOverlap(
  activeRect: Rect,
  items: GridItem[],
  activeIndex: number
): OverlapInfo | null {
  let highest: OverlapInfo | null = null;

  for (const item of items) {
    if (item.index === activeIndex) continue;

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

  // Update refs in effect to avoid updating during render
  useEffect(() => {
    orderRef.current = order;
    onOrderChangeRef.current = onOrderChange;
    onDragMoveRef.current = onDragMove;
    onDragEndRef.current = onDragEnd;
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

    engine.on("onDragMove", (state: DragState) => {
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

      // Find overlap for folder creation
      const overlap = findHighestOverlap(activeRect, items, state.activeItem.index);

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

      // Find highest overlap at drop time
      const state = engine.getState();
      let overId: string | null = null;

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
        const overlap = findHighestOverlap(activeRect, items, fromIndex);
        if (overlap) {
          overId = overlap.targetId;
        }
      }

      setIsDragging(false);
      setActiveId(null);
      setActiveIndex(null);

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
            fromIndex,
            toIndex,
          },
          reorder
        );
      } else {
        // No external handler, just reorder
        reorder();
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
  };
}
