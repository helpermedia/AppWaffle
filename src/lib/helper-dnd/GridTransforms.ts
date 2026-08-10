import type { GridItem, Rect, Point } from "./types";

interface TransformOptions {
  /** Item selector within container (default: '[data-draggable]') */
  itemSelector?: string;
  /** Transition duration in ms (default: 200) */
  transitionDuration?: number;
}

/**
 * Whether an item is visually displaced by the active reorder.
 * Forward drags shift (active, target], backward drags shift [target, active).
 * Single source of truth for the shifted range — applyShifts renders it,
 * SlotDetection and overlap checks must classify with the same rule.
 */
export function isItemShifted(itemIndex: number, activeIndex: number, targetIndex: number): boolean {
  if (activeIndex === targetIndex) return false;
  return targetIndex > activeIndex
    ? itemIndex > activeIndex && itemIndex <= targetIndex
    : itemIndex >= targetIndex && itemIndex < activeIndex;
}

/**
 * The slot an item currently occupies: its own index, unless shifted by the
 * active reorder — then the neighboring slot toward the vacated origin.
 */
export function effectiveSlot(itemIndex: number, activeIndex: number, targetIndex: number): number {
  if (!isItemShifted(itemIndex, activeIndex, targetIndex)) return itemIndex;
  return targetIndex > activeIndex ? itemIndex - 1 : itemIndex + 1;
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
  private originalTransitions: Map<HTMLElement, string> = new Map();

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
    this.originalTransitions.clear();

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

      // Store original transition before overwriting
      this.originalTransitions.set(el, el.style.transition);

      // Set transition for smooth shifting
      el.style.transition = `transform ${this.options.transitionDuration}ms cubic-bezier(0.2, 0, 0, 1)`;
    });

    return this.items;
  }

  /**
   * Apply shifts based on active and target indices.
   * target === active animates every shifted item back home (the drag
   * returned to its origin) — reset() stays reserved for drag end, where
   * the snap must be instant.
   */
  applyShifts(activeIndex: number, targetIndex: number): void {
    // Public API: out-of-range indices must render nothing rather than
    // mis-classify the shifted range. (The engine always passes indices
    // of cached items, but external callers get the boundary check.)
    if (!this.items[activeIndex] || !this.items[targetIndex]) return;

    for (const item of this.items) {
      if (item.index === activeIndex) {
        // Active item is hidden/ghosted, no transform needed
        continue;
      }

      if (isItemShifted(item.index, activeIndex, targetIndex)) {
        const slotItem = this.items[effectiveSlot(item.index, activeIndex, targetIndex)];
        if (slotItem) {
          const dx = slotItem.rect.left - item.rect.left;
          const dy = slotItem.rect.top - item.rect.top;
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

    // Restore original transitions after a frame (allows instant reset first)
    requestAnimationFrame(() => {
      for (const item of this.items) {
        const original = this.originalTransitions.get(item.element);
        item.element.style.transition = original ?? "";
      }
      this.originalTransitions.clear();
    });

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
