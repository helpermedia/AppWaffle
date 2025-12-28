import { PointerTracker } from "./PointerTracker";
import { GhostElement } from "./GhostElement";
import { SlotDetection } from "./SlotDetection";
import { GridTransforms } from "./GridTransforms";
import type { Point, GridItem, DragState, DragEvents, DragOptions } from "./types";

/**
 * The main orchestrator that coordinates all modules.
 *
 * Responsibilities:
 * - Initialize and coordinate all sub-modules
 * - Manage drag lifecycle
 * - Emit events to React layer
 * - Handle cleanup
 */
export class DragEngine {
  private container: HTMLElement;
  private options: Required<DragOptions>;

  private pointerTracker: PointerTracker;
  private ghostElement: GhostElement;
  private slotDetection: SlotDetection;
  private gridTransforms: GridTransforms;

  private state: DragState | null = null;
  private events: Partial<DragEvents> = {};

  private static DEFAULTS: Required<DragOptions> = {
    activationDistance: 5,
    shiftDuration: 200,
    ghostClass: "drag-ghost",
    draggingClass: "is-dragging",
  };

  constructor(container: HTMLElement, options: DragOptions = {}) {
    this.container = container;
    this.options = { ...DragEngine.DEFAULTS, ...options };

    this.pointerTracker = new PointerTracker(container);
    this.ghostElement = new GhostElement({ className: this.options.ghostClass });
    this.slotDetection = new SlotDetection();
    this.gridTransforms = new GridTransforms({
      transitionDuration: this.options.shiftDuration,
    });

    this.setupPointerCallbacks();
  }

  /** Start listening for drags */
  enable(): void {
    this.pointerTracker.enable();
  }

  /** Stop listening, full cleanup */
  destroy(): void {
    this.pointerTracker.disable();
    this.ghostElement.destroy();
    this.gridTransforms.reset();
    this.slotDetection.reset();
    this.state = null;
    this.events = {}; // Clear event handlers to prevent memory leaks
  }

  /** Subscribe to drag events */
  on<K extends keyof DragEvents>(event: K, handler: DragEvents[K]): void {
    this.events[event] = handler;
  }

  /** Unsubscribe from drag events */
  off<K extends keyof DragEvents>(event: K): void {
    delete this.events[event];
  }

  /** Get current drag state (for external access) */
  getState(): DragState | null {
    return this.state;
  }

  /** Get all cached grid items */
  getItems(): GridItem[] {
    return this.gridTransforms.getItems();
  }

  private setupPointerCallbacks(): void {
    this.pointerTracker.onDragStart = this.handleDragStart.bind(this);
    this.pointerTracker.onDragMove = this.handleDragMove.bind(this);
    this.pointerTracker.onDragEnd = this.handleDragEnd.bind(this);
    this.pointerTracker.onDragCancel = this.handleDragCancel.bind(this);
  }

  private handleDragStart(element: HTMLElement, pointer: Point): void {
    // Cache all item positions
    const items = this.gridTransforms.cachePositions(this.container);

    // Find the active item
    const activeIndex = items.findIndex((item) => item.element === element);
    if (activeIndex === -1) return;

    const activeItem = items[activeIndex];

    // Initialize state
    this.state = {
      activeItem,
      startPointer: pointer,
      currentPointer: pointer,
      previousPointer: pointer,
      activeCenter: activeItem.rect.center,
      targetIndex: activeIndex,
    };

    // Create ghost
    this.ghostElement.create(element, pointer);

    // Note: Original is hidden via React state (isDragging prop), not DOM manipulation

    // Initialize slot detection
    this.slotDetection.initialize(items, activeIndex);

    // Emit event
    this.events.onDragStart?.(activeItem);
  }

  private handleDragMove(pointer: Point): void {
    if (!this.state) return;

    // Update ghost position
    this.ghostElement.updatePosition(pointer);

    // Calculate new center position
    const dx = pointer.x - this.state.startPointer.x;
    const dy = pointer.y - this.state.startPointer.y;
    const newCenter: Point = {
      x: this.state.activeItem.rect.center.x + dx,
      y: this.state.activeItem.rect.center.y + dy,
    };

    // Check for slot change
    const newTargetIndex = this.slotDetection.update(newCenter);

    if (newTargetIndex !== null) {
      // Slot changed! Update shifts
      this.gridTransforms.applyShifts(this.state.activeItem.index, newTargetIndex);
      this.state.targetIndex = newTargetIndex;

      // Emit event
      this.events.onIndexChange?.(this.state.activeItem.index, newTargetIndex);
    }

    // Update state
    this.state.previousPointer = this.state.currentPointer;
    this.state.currentPointer = pointer;
    this.state.activeCenter = newCenter;

    // Emit move event
    this.events.onDragMove?.(this.state);
  }

  private async handleDragEnd(_pointer: Point): Promise<void> {
    if (!this.state) return;

    const fromIndex = this.state.activeItem.index;
    const toIndex = this.state.targetIndex;

    // Get animation target from callback, or use default reorder slot
    let animationTarget = this.events.getDropAnimationTarget?.(this.state);

    // If no callback provided, use default behavior (animate to reorder slot)
    if (animationTarget === undefined) {
      const targetCenter = this.slotDetection.getSlotCenter(toIndex);
      animationTarget = { center: targetCenter, duration: this.options.shiftDuration };
    }

    // Animate ghost (or destroy immediately if target is null)
    if (animationTarget) {
      await this.ghostElement.animateTo(
        animationTarget.center,
        animationTarget.duration ?? this.options.shiftDuration
      );
    } else {
      this.ghostElement.destroy();
    }

    // Check if we were destroyed during animation (e.g., component unmounted)
    if (!this.state) return;

    // Reset transforms
    this.gridTransforms.reset();
    this.slotDetection.reset();

    // Emit event - React will update state and show original via isDragging prop
    this.events.onDragEnd?.(fromIndex, toIndex);

    this.state = null;
  }

  private handleDragCancel(): void {
    if (!this.state) return;

    // Cleanup without committing changes (immediate, no animation)
    this.ghostElement.destroy();
    this.gridTransforms.reset();
    this.slotDetection.reset();

    // Emit event - React will update state and show original via isDragging prop
    this.events.onDragCancel?.();

    this.state = null;
  }
}
