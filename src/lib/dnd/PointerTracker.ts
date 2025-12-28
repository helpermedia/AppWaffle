import type { Point } from "./types";

/**
 * Handles low-level pointer event management.
 *
 * Responsibilities:
 * - Listen to pointer events on container
 * - Determine which item was clicked
 * - Track pointer position during drag
 * - Handle pointer capture for reliable tracking
 * - Detect drag activation (after minimum movement)
 */
export class PointerTracker {
  private container: HTMLElement;
  private isDragging = false;
  private startPoint: Point | null = null;
  private activeElement: HTMLElement | null = null;
  private pointerId: number | null = null;

  private static ACTIVATION_DISTANCE = 5; // pixels

  // Callbacks (set by DragEngine)
  onDragStart?: (item: HTMLElement, pointer: Point) => void;
  onDragMove?: (pointer: Point) => void;
  onDragEnd?: (pointer: Point) => void;
  onDragCancel?: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
  }

  /** Start listening for drag initiation */
  enable(): void {
    this.container.addEventListener("pointerdown", this.handlePointerDown);
  }

  /** Stop listening, cleanup */
  disable(): void {
    this.container.removeEventListener("pointerdown", this.handlePointerDown);
    this.cleanup();
  }

  private handlePointerDown(e: PointerEvent): void {
    // Only handle primary button (left click / touch)
    if (e.button !== 0) return;

    // First, check if we clicked on a drag handle (icon)
    const handle = (e.target as HTMLElement).closest("[data-drag-handle]");
    if (!handle) return;

    // Then find the parent draggable item (container)
    const item = handle.closest("[data-draggable]");
    if (!item || !(item instanceof HTMLElement)) return;

    // Don't preventDefault or setPointerCapture here - allow clicks to work normally
    // We'll do that only when drag actually starts

    this.startPoint = { x: e.clientX, y: e.clientY };
    this.activeElement = item;
    this.pointerId = e.pointerId;

    // Listen for move/up on document (pointer might leave container)
    document.addEventListener("pointermove", this.handlePointerMove);
    document.addEventListener("pointerup", this.handlePointerUp);
    document.addEventListener("pointercancel", this.handlePointerCancel);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.startPoint || !this.activeElement) return;

    const currentPoint = { x: e.clientX, y: e.clientY };

    if (!this.isDragging) {
      // Check if we've moved enough to activate drag
      const distance = Math.hypot(
        currentPoint.x - this.startPoint.x,
        currentPoint.y - this.startPoint.y
      );

      if (distance >= PointerTracker.ACTIVATION_DISTANCE) {
        this.isDragging = true;
        // Prevent text selection and capture pointer now that drag has started
        e.preventDefault();
        if (this.pointerId !== null) {
          this.container.setPointerCapture(this.pointerId);
        }
        this.onDragStart?.(this.activeElement, this.startPoint);
      }
    }

    if (this.isDragging) {
      e.preventDefault();
      this.onDragMove?.(currentPoint);
    }
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.isDragging) {
      this.onDragEnd?.({ x: e.clientX, y: e.clientY });
    }
    this.cleanup();
  }

  private handlePointerCancel(): void {
    if (this.isDragging) {
      this.onDragCancel?.();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.pointerId !== null) {
      try {
        this.container.releasePointerCapture(this.pointerId);
      } catch {
        // Pointer capture may already be released
      }
    }

    document.removeEventListener("pointermove", this.handlePointerMove);
    document.removeEventListener("pointerup", this.handlePointerUp);
    document.removeEventListener("pointercancel", this.handlePointerCancel);

    this.isDragging = false;
    this.startPoint = null;
    this.activeElement = null;
    this.pointerId = null;
  }
}
