import type { DragEngine } from "./DragEngine";
import { isPointOutsideRect, type Point } from "./types";

/**
 * Registration info for a grid participating in coordinated drag.
 */
export interface GridRegistration {
  /** Unique identifier for this grid */
  id: string;
  /** The DragEngine instance for this grid */
  engine: DragEngine;
  /** Container element (for bounds checking) */
  container: HTMLElement;
}

/**
 * Handoff request passed to the callback.
 */
export interface HandoffRequest {
  /** ID of item being dragged */
  itemId: string;
  /** Current pointer position */
  pointer: Point;
  /** Grid the drag is leaving */
  fromGridId: string;
  /** Grid the drag is entering */
  toGridId: string;
}

/**
 * Options for DragCoordinator.
 */
export interface DragCoordinatorOptions {
  /**
   * Called when a handoff should occur.
   * The callback should:
   * 1. Update state (close folder, add item to main grid)
   * 2. Return a Promise that resolves when the target grid DOM is ready
   */
  onHandoff?: (request: HandoffRequest) => Promise<void> | void;
}

/**
 * Coordinates drag handoff between multiple grids.
 *
 * This is a framework-agnostic class that can be used with any UI framework.
 * For React, wrap it in a hook (useDragCoordinator).
 *
 * @example
 * ```typescript
 * const coordinator = new DragCoordinator({
 *   onHandoff: async (request) => {
 *     // Update your app state here
 *     await updateStateAndWaitForRender();
 *   }
 * });
 *
 * // Register grids
 * coordinator.register({ id: 'main', engine: mainEngine, container: mainEl });
 * coordinator.register({ id: 'folder', engine: folderEngine, container: folderEl });
 *
 * // Start monitoring (call on every drag move)
 * coordinator.checkBoundaries(currentPointer);
 * ```
 */
export class DragCoordinator {
  private grids = new Map<string, GridRegistration>();
  private activeGridId: string | null = null;
  private isHandingOff = false;

  /** Callback when handoff occurs. Can be set directly for React integration. */
  onHandoff?: (request: HandoffRequest) => Promise<void> | void;

  constructor(options: DragCoordinatorOptions = {}) {
    this.onHandoff = options.onHandoff;
  }

  /**
   * Register a grid for coordination.
   */
  register(registration: GridRegistration): void {
    this.grids.set(registration.id, registration);
  }

  /**
   * Unregister a grid.
   */
  unregister(gridId: string): void {
    this.grids.delete(gridId);
    if (this.activeGridId === gridId) {
      this.activeGridId = null;
    }
  }

  /**
   * Set the currently active grid (the one with an active drag).
   */
  setActiveGrid(gridId: string | null): void {
    this.activeGridId = gridId;
  }

  /**
   * Get the currently active grid ID.
   */
  getActiveGrid(): string | null {
    return this.activeGridId;
  }

  /**
   * Check if pointer has exited the active grid.
   * Call this on every drag move event.
   *
   * @returns The target grid ID to hand off to, or null if no handoff needed
   */
  checkBoundaries(pointer: Point): string | null {
    if (!this.activeGridId || this.isHandingOff) return null;

    const activeGrid = this.grids.get(this.activeGridId);
    if (!activeGrid) return null;

    const activeRect = activeGrid.container.getBoundingClientRect();

    if (!isPointOutsideRect(pointer, activeRect)) return null;

    // Pointer is outside active grid - find target grid
    // First, try to find a grid that contains the pointer
    for (const [gridId, registration] of this.grids) {
      if (gridId === this.activeGridId) continue;

      const rect = registration.container.getBoundingClientRect();
      // Skip grids with zero bounds (hidden elements)
      if (rect.width === 0 || rect.height === 0) continue;

      const isInside =
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom;

      if (isInside) {
        return gridId;
      }
    }

    // No visible grid contains the pointer - return the first other registered grid
    // This handles the case where the target grid is hidden (e.g., main grid behind folder modal)
    for (const gridId of this.grids.keys()) {
      if (gridId !== this.activeGridId) {
        return gridId;
      }
    }

    return null;
  }

  /**
   * Execute a handoff from the active grid to another grid.
   *
   * @param toGridId - The grid to hand off to
   * @param itemId - The ID of the item being dragged
   * @param pointer - Current pointer position
   */
  async handoff(toGridId: string, itemId: string, pointer: Point): Promise<boolean> {
    if (this.isHandingOff) {
      console.log("[Handoff] Already in progress, skipping");
      return false;
    }
    if (!this.activeGridId) {
      console.log("[Handoff] No active grid");
      return false;
    }

    const fromGrid = this.grids.get(this.activeGridId);
    const toGrid = this.grids.get(toGridId);

    if (!fromGrid || !toGrid) {
      console.log("[Handoff] Grid not found", { fromGrid: !!fromGrid, toGrid: !!toGrid });
      return false;
    }

    console.log("[Handoff] Starting", { from: this.activeGridId, to: toGridId, itemId });
    this.isHandingOff = true;

    let ghost: HTMLElement | null = null;

    try {
      // Get the drag state before canceling
      const state = fromGrid.engine.getState();
      if (!state) {
        console.log("[Handoff] No drag state");
        this.isHandingOff = false;
        return false;
      }

      // Detach the ghost element - this transfers ownership to us
      // so the engine's destroy() won't remove it from DOM
      ghost = fromGrid.engine.detachGhost();
      if (!ghost) {
        console.log("[Handoff] No ghost element");
        this.isHandingOff = false;
        return false;
      }

      console.log("[Handoff] Got ghost, canceling source drag");

      // Cancel source drag (ghost already detached, won't be destroyed)
      fromGrid.engine.cancel();

      // Notify callback to update state (close folder, add to main grid, etc.)
      const request: HandoffRequest = {
        itemId,
        pointer,
        fromGridId: this.activeGridId,
        toGridId,
      };

      console.log("[Handoff] Calling onHandoff callback");
      await this.onHandoff?.(request);

      console.log("[Handoff] Waiting for render");
      // Wait for React to render the new state (2 RAF frames)
      await this.waitForRender();

      // Find the item element in the target grid
      console.log("[Handoff] Looking for item in target grid");
      const itemElement = toGrid.container.querySelector(
        `[data-draggable][data-id="${itemId}"]`
      ) as HTMLElement | null;

      if (!itemElement) {
        // Item not found in target grid - destroy ghost and abort
        console.warn(`[Handoff] Item ${itemId} not found in grid ${toGridId}`);
        ghost.remove();
        this.isHandingOff = false;
        this.activeGridId = null;
        return false;
      }

      console.log("[Handoff] Found item, starting drag on target grid");
      // Start drag on target grid with the existing ghost
      toGrid.engine.startDragAt(itemElement, pointer, ghost);

      // Update active grid
      this.activeGridId = toGridId;
      this.isHandingOff = false;

      console.log("[Handoff] Complete!");
      return true;
    } catch (error) {
      console.error("[Handoff] Failed", error);
      ghost?.remove();
      this.isHandingOff = false;
      return false;
    }
  }

  /**
   * Check if a handoff is currently in progress.
   */
  isHandoffInProgress(): boolean {
    return this.isHandingOff;
  }

  /**
   * Get a registered grid by ID.
   */
  getGrid(gridId: string): GridRegistration | undefined {
    return this.grids.get(gridId);
  }

  /**
   * Cleanup all registrations.
   */
  destroy(): void {
    this.grids.clear();
    this.activeGridId = null;
    this.isHandingOff = false;
  }

  /**
   * Wait for 2 animation frames (allows React to render).
   */
  private waitForRender(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }
}
