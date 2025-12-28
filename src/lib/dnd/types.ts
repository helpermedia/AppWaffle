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
  /** Starting pointer position */
  startPointer: Point;
  /** Current pointer position */
  currentPointer: Point;
  /** Previous frame pointer position (for crossing detection) */
  previousPointer: Point;
  /** Current center of dragged item */
  activeCenter: Point;
  /** Index where item would be inserted */
  targetIndex: number;
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

/** Configuration options */
export interface DragOptions {
  /** Minimum pixels to move before drag starts (default: 5) */
  activationDistance?: number;
  /** Duration of shift animation in ms (default: 200) */
  shiftDuration?: number;
  /** CSS class applied to ghost element */
  ghostClass?: string;
  /** CSS class applied to item being dragged */
  draggingClass?: string;
}
