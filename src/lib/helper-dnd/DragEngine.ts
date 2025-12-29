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
    iconSize: 96,
    ghostClass: "drag-ghost",
    draggingClass: "is-dragging",
  };

  constructor(container: HTMLElement, options: DragOptions = {}) {
    this.container = container;
    this.options = { ...DragEngine.DEFAULTS, ...options };

    this.pointerTracker = new PointerTracker(container, {
      activationDistance: this.options.activationDistance,
    });
    this.ghostElement = new GhostElement({ className: this.options.ghostClass });
    this.slotDetection = new SlotDetection({
      iconSize: this.options.iconSize,
    });
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

  /**
   * Reset transforms on all items.
   * Call from React's useLayoutEffect after reorder to clear transforms
   * synchronously before browser paint.
   */
  resetTransforms(): void {
    this.gridTransforms.reset();
  }

  /** Get all cached grid items */
  getItems(): GridItem[] {
    return this.gridTransforms.getItems();
  }

  /** Get the container element */
  getContainer(): HTMLElement {
    return this.container;
  }

  /** Get the ghost element (for handoff to another engine) */
  getGhostElement(): HTMLElement | null {
    return this.ghostElement.getElement();
  }

  /**
   * Detach and return the ghost element, transferring ownership to caller.
   * After calling this, the engine no longer manages the ghost,
   * so destroy() or cancel() won't remove it from the DOM.
   * Used during drag handoff to preserve the ghost across engine switches.
   */
  detachGhost(): HTMLElement | null {
    return this.ghostElement.detach();
  }

  /**
   * Start a drag at a specific element, optionally with an existing ghost.
   * Used for handoff from another engine.
   *
   * @param element - The element to drag
   * @param pointer - Current pointer position
   * @param existingGhost - Optional existing ghost element to adopt
   */
  startDragAt(element: HTMLElement, pointer: Point, existingGhost?: HTMLElement | null): void {
    // Cache all item positions
    const items = this.gridTransforms.cachePositions(this.container);

    // Find the element in the cached items
    const activeIndex = items.findIndex((item) => item.element === element);
    if (activeIndex === -1) {
      console.warn("DragEngine.startDragAt: element not found in grid");
      existingGhost?.remove();
      return;
    }

    const activeItem = items[activeIndex];

    // For adopted drags, we need to adjust startPointer so that slot detection
    // calculates positions based on where the ghost actually is, not where
    // the item is rendered in the DOM.
    let startPointer = pointer;
    let activeCenter = activeItem.rect.center;

    if (existingGhost) {
      // Get the ghost's current center position
      const ghostRect = existingGhost.getBoundingClientRect();
      const ghostCenter: Point = {
        x: ghostRect.left + ghostRect.width / 2,
        y: ghostRect.top + ghostRect.height / 2,
      };

      // Adjust startPointer so that: activeItem.rect.center + (pointer - startPointer) = ghostCenter
      // This makes slot detection work correctly based on ghost position
      startPointer = {
        x: pointer.x - (ghostCenter.x - activeItem.rect.center.x),
        y: pointer.y - (ghostCenter.y - activeItem.rect.center.y),
      };
      activeCenter = ghostCenter;
    }

    // Initialize state
    this.state = {
      activeItem,
      startPointer,
      currentPointer: pointer,
      previousPointer: pointer,
      activeCenter,
      targetIndex: activeIndex,
    };

    // Adopt existing ghost or create new one
    if (existingGhost) {
      this.ghostElement.adopt(existingGhost, pointer);
    } else {
      this.ghostElement.create(element, pointer);
    }

    // Initialize slot detection
    this.slotDetection.initialize(items, activeIndex);

    // Adopt the pointer tracking (listen for move/up events)
    this.pointerTracker.adoptDrag();

    // Emit event
    this.events.onDragStart?.(activeItem);
  }

  /**
   * Cancel the current drag operation (cleanup without committing).
   * @param preserveGhost - If true, don't destroy the ghost element (used for handoff)
   */
  cancel(preserveGhost = false): void {
    if (!this.state) return;

    // Cleanup without committing changes
    if (!preserveGhost) {
      this.ghostElement.destroy();
    }
    this.gridTransforms.reset();
    this.slotDetection.reset();

    // Clean up pointer tracking to stop receiving events
    this.pointerTracker.disable();
    this.pointerTracker.enable(); // Re-enable for future drags

    // Note: We don't emit onDragCancel here - the caller handles state cleanup

    this.state = null;
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

    // Clear slot detection (doesn't affect visuals)
    this.slotDetection.reset();

    // NOTE: Don't reset transforms here! Let React re-render first.
    // The React hook will call resetTransforms() in useLayoutEffect after
    // React commits the new order, ensuring transforms are cleared only
    // after items are in their new DOM positions.

    // Emit event - React will update state and reorder items
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
