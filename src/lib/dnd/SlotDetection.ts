import type { GridItem, Point } from "./types";

/**
 * Grid layout metadata calculated from item positions.
 */
interface GridLayout {
  /** Number of columns in the grid */
  columns: number;
  /** Total number of items */
  totalItems: number;
  /** Width of each item container */
  itemWidth: number;
  /** Height of each item container */
  itemHeight: number;
  /** Icon size (used for hit detection) */
  iconSize: number;
  /** Horizontal gap between items */
  gapX: number;
  /** Vertical gap between items */
  gapY: number;
  /** Container left offset (first item's left position) */
  offsetX: number;
  /** Container top offset (first item's top position) */
  offsetY: number;
  /** Width of a cell (item + gap) */
  cellWidth: number;
  /** Height of a cell (item + gap) */
  cellHeight: number;
}

/**
 * Direction-aware center-crossing detection for grid drag-and-drop.
 *
 * Items only shift when the dragged item's center crosses the target's center
 * in the movement direction. This matches macOS Launchpad / iOS home screen behavior.
 *
 * Key behaviors:
 * - Track frame-by-frame center position
 * - Detect when we cross a target item's center
 * - Only count crossings in the direction we're moving
 * - All items between origin and target shift at once
 */
export class SlotDetection {
  private layout: GridLayout | null = null;
  private items: GridItem[] = [];
  private activeIndex: number = -1;
  private targetIndex: number = -1;
  private previousCenter: Point | null = null;

  /**
   * Initialize with grid items at drag start.
   * Calculates grid layout from item positions.
   */
  initialize(items: GridItem[], activeIndex: number): void {
    if (items.length === 0) return;

    this.items = items;
    this.activeIndex = activeIndex;
    this.targetIndex = activeIndex;
    this.previousCenter = items[activeIndex].rect.center;
    this.layout = this.calculateLayout(items);
  }

  /**
   * Update with current dragged item center position.
   * Returns new target index if a center-crossing occurred, null otherwise.
   */
  update(currentCenter: Point): number | null {
    if (!this.layout || !this.previousCenter) return null;

    // Check for center crossings with adjacent items
    const newTargetIndex = this.detectCrossing(currentCenter);

    // Update previous center for next frame
    this.previousCenter = currentCenter;

    if (newTargetIndex !== null && newTargetIndex !== this.targetIndex) {
      this.targetIndex = newTargetIndex;
      return this.targetIndex;
    }

    return null;
  }

  /**
   * Get the current target index (where item would be inserted).
   */
  getTargetIndex(): number {
    return this.targetIndex;
  }

  /**
   * Get the center point of a slot by index.
   * Used for drop animation - animate ghost to this position.
   */
  getSlotCenter(slotIndex: number): Point {
    if (!this.layout) {
      // Fallback: return center of item at that index if available
      const item = this.items[slotIndex];
      if (item) return item.rect.center;
      return { x: 0, y: 0 };
    }

    const col = slotIndex % this.layout.columns;
    const row = Math.floor(slotIndex / this.layout.columns);

    return {
      x: this.layout.offsetX + col * this.layout.cellWidth + this.layout.itemWidth / 2,
      y: this.layout.offsetY + row * this.layout.cellHeight + this.layout.itemHeight / 2,
    };
  }

  /**
   * Reset state for next drag.
   */
  reset(): void {
    this.layout = null;
    this.items = [];
    this.activeIndex = -1;
    this.targetIndex = -1;
    this.previousCenter = null;
  }

  /**
   * Detect if we crossed a target item's center between previous and current position.
   * Returns new target index if crossing detected, null otherwise.
   */
  private detectCrossing(currentCenter: Point): number | null {
    if (!this.previousCenter) return null;

    // Calculate movement direction
    const deltaX = currentCenter.x - this.previousCenter.x;
    const deltaY = currentCenter.y - this.previousCenter.y;

    // Determine primary movement axis (which direction dominates)
    const isHorizontalPrimary = Math.abs(deltaX) >= Math.abs(deltaY);

    // Check items we might cross
    for (const item of this.items) {
      // Skip the active item
      if (item.index === this.activeIndex) continue;

      const targetCenter = item.rect.center;

      // Check if we crossed this item's center
      if (isHorizontalPrimary) {
        // Horizontal movement - check X axis crossing
        const crossedRight = deltaX > 0 &&
          this.previousCenter.x < targetCenter.x &&
          currentCenter.x >= targetCenter.x;

        const crossedLeft = deltaX < 0 &&
          this.previousCenter.x > targetCenter.x &&
          currentCenter.x <= targetCenter.x;

        if (crossedRight || crossedLeft) {
          // Verify we're in the same row (Y within icon size, not full item height)
          const yDistance = Math.abs(currentCenter.y - targetCenter.y);
          if (yDistance < this.layout!.iconSize) {
            return item.index;
          }
        }
      } else {
        // Vertical movement - check Y axis crossing
        const crossedDown = deltaY > 0 &&
          this.previousCenter.y < targetCenter.y &&
          currentCenter.y >= targetCenter.y;

        const crossedUp = deltaY < 0 &&
          this.previousCenter.y > targetCenter.y &&
          currentCenter.y <= targetCenter.y;

        if (crossedDown || crossedUp) {
          // Verify we're in the same column (X within icon size)
          const xDistance = Math.abs(currentCenter.x - targetCenter.x);
          if (xDistance < this.layout!.iconSize) {
            return item.index;
          }
        }
      }
    }

    return null;
  }

  /**
   * Calculate grid layout from item positions.
   * Analyzes the first two items to determine columns, gaps, and dimensions.
   */
  private calculateLayout(items: GridItem[]): GridLayout {
    const first = items[0].rect;
    const itemWidth = first.width;
    const itemHeight = first.height;

    // Icon size is 96px (w-24 in Tailwind) - used for hit detection
    // This is smaller than the full item which includes the label
    const iconSize = 96;

    // Determine columns by finding items in the first row
    let columns = 1;
    for (let i = 1; i < items.length; i++) {
      // If this item's top is significantly different, we've moved to next row
      if (Math.abs(items[i].rect.top - first.top) > itemHeight / 2) {
        break;
      }
      columns++;
    }

    // Calculate gap from first two items (if we have at least 2 in first row)
    let gapX = 0;
    let gapY = 0;

    if (columns >= 2) {
      gapX = items[1].rect.left - (first.left + itemWidth);
    }

    // Calculate vertical gap from items in different rows
    if (items.length > columns) {
      gapY = items[columns].rect.top - (first.top + itemHeight);
    }

    // Cell dimensions (item + gap)
    const cellWidth = itemWidth + gapX;
    const cellHeight = itemHeight + gapY;

    return {
      columns,
      totalItems: items.length,
      itemWidth,
      itemHeight,
      iconSize,
      gapX,
      gapY,
      offsetX: first.left,
      offsetY: first.top,
      cellWidth,
      cellHeight,
    };
  }
}
