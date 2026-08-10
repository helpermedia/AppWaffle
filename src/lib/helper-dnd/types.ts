/** 2D point coordinates */
export interface Point {
  x: number;
  y: number;
}

/** Bounding rectangle with center point */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  center: Point;
}

/** Represents an item in the grid */
export interface GridItem {
  id: string;
  element: HTMLElement;
  rect: Rect;
  index: number;
}

/** Drag session state */
export interface DragState {
  /** Item being dragged */
  activeItem: GridItem;
  /** Starting pointer position (viewport coordinates) */
  startPointer: Point;
  /** Current pointer position (viewport coordinates) */
  currentPointer: Point;
  /** Previous frame pointer position (viewport coordinates) */
  previousPointer: Point;
  /**
   * Current center of the dragged item in the drag-start coordinate frame:
   * pointer-derived, plus scrollDelta. Item rects are cached at drag start,
   * so this is the value to compare against them.
   */
  activeCenter: Point;
  /** Index where item would be inserted */
  targetIndex: number;
  /**
   * How far the scroll host has scrolled since drag start (auto-scroll and
   * manual wheel alike). Bridges live viewport coordinates and the cached
   * drag-start frame: startFrameY = viewportY + scrollDelta.
   */
  scrollDelta: number;
}

/** Drop animation target info */
export interface DropAnimationTarget {
  /** Center point to animate ghost to */
  center: Point;
  /** Animation duration in ms (default: 200) */
  duration?: number;
}

/** Events emitted by DragEngine */
export interface DragEvents {
  onDragStart?: (item: GridItem) => void;
  onDragMove?: (state: DragState) => void;
  onIndexChange?: (fromIndex: number, toIndex: number) => void;
  /**
   * Called before drop animation to get animation target.
   * Return null to skip animation (ghost destroyed immediately).
   * Return undefined to use default reorder slot animation.
   */
  getDropAnimationTarget?: (state: DragState) => DropAnimationTarget | null | undefined;
  onDragEnd?: (fromIndex: number, toIndex: number) => void;
  onDragCancel?: () => void;
}

/** Check if a point is outside a DOMRect */
export function isPointOutsideRect(point: Point, rect: DOMRect): boolean {
  return (
    point.x < rect.left ||
    point.x > rect.right ||
    point.y < rect.top ||
    point.y > rect.bottom
  );
}

/** Configuration options */
export interface DragOptions {
  /** Minimum pixels to move before drag starts (default: 5) */
  activationDistance?: number;
  /** Duration of shift animation in ms (default: 200) */
  shiftDuration?: number;
  /** Icon size in pixels for hit detection (default: 96) */
  iconSize?: number;
  /** CSS class applied to ghost element */
  ghostClass?: string;
  /** CSS class applied to item being dragged */
  draggingClass?: string;
  /** Edge auto-scroll of the nearest scrollable ancestor (default: true) */
  autoScroll?: boolean;
  /** Edge zone size in px where auto-scroll engages (default: 80) */
  autoScrollEdgeSize?: number;
  /** Maximum auto-scroll speed in px per frame (default: 16) */
  autoScrollMaxSpeed?: number;
}
