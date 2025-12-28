import type { GridItem, Rect, Point } from "./types";

interface TransformOptions {
  /** Item selector within container (default: '[data-draggable]') */
  itemSelector?: string;
  /** Transition duration in ms (default: 200) */
  transitionDuration?: number;
}

/**
 * Handles the visual shifting of items when the target index changes.
 *
 * Responsibilities:
 * - Calculate which items need to shift
 * - Compute transform values for each item
 * - Apply transforms directly to DOM elements
 * - Reset transforms on drag end
 */
export class GridTransforms {
  private items: GridItem[] = [];
  private options: Required<TransformOptions>;

  private static DEFAULTS: Required<TransformOptions> = {
    itemSelector: "[data-draggable]",
    transitionDuration: 200,
  };

  constructor(options: TransformOptions = {}) {
    this.options = { ...GridTransforms.DEFAULTS, ...options };
  }

  /** Cache item positions at drag start */
  cachePositions(container: HTMLElement): GridItem[] {
    const elements = container.querySelectorAll(this.options.itemSelector);
    this.items = [];

    elements.forEach((el, index) => {
      if (!(el instanceof HTMLElement)) return;

      const domRect = el.getBoundingClientRect();
      const rect: Rect = {
        left: domRect.left,
        top: domRect.top,
        width: domRect.width,
        height: domRect.height,
        center: {
          x: domRect.left + domRect.width / 2,
          y: domRect.top + domRect.height / 2,
        },
      };

      this.items.push({
        id: el.dataset.id || String(index),
        element: el,
        index,
        rect,
      });

      // Ensure items have transition set
      el.style.transition = `transform ${this.options.transitionDuration}ms cubic-bezier(0.2, 0, 0, 1)`;
    });

    return this.items;
  }

  /** Apply shifts based on active and target indices */
  applyShifts(activeIndex: number, targetIndex: number): void {
    if (activeIndex === targetIndex) {
      // No shift needed, reset all
      this.reset();
      return;
    }

    const activeItem = this.items[activeIndex];
    if (!activeItem) return;

    // Determine shift direction and range
    const movingForward = targetIndex > activeIndex;
    const startIdx = movingForward ? activeIndex + 1 : targetIndex;
    const endIdx = movingForward ? targetIndex : activeIndex - 1;

    for (const item of this.items) {
      if (item.index === activeIndex) {
        // Active item is hidden/ghosted, no transform needed
        continue;
      }

      if (item.index >= startIdx && item.index <= endIdx) {
        // This item needs to shift
        const shiftTarget = movingForward
          ? this.items[item.index - 1]
          : this.items[item.index + 1];

        if (shiftTarget) {
          const dx = shiftTarget.rect.left - item.rect.left;
          const dy = shiftTarget.rect.top - item.rect.top;
          item.element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
      } else {
        // This item should be in its original position
        item.element.style.transform = "translate3d(0, 0, 0)";
      }
    }
  }

  /** Clear all transforms instantly (no animation) */
  reset(): void {
    for (const item of this.items) {
      // Remove transition first to prevent "snap back" animation
      item.element.style.transition = "none";
      item.element.style.transform = "";
    }
    // Note: Don't clear items here - they may be needed by event handlers
  }

  /** Get cached items */
  getItems(): GridItem[] {
    return this.items;
  }

  /** Get center point of an item by index */
  getItemCenter(index: number): Point | null {
    const item = this.items[index];
    return item ? item.rect.center : null;
  }
}
