// Core engine
export { DragEngine } from "./DragEngine";

// Coordination (for multi-grid handoff)
export { DragCoordinator } from "./DragCoordinator";

// Sub-modules (for advanced usage)
export { PointerTracker } from "./PointerTracker";
export { GhostElement } from "./GhostElement";
export { SlotDetection } from "./SlotDetection";
export { GridTransforms } from "./GridTransforms";

// Types
export type {
  Point,
  Rect,
  GridItem,
  DragState,
  DragEvents,
  DragOptions,
  DropAnimationTarget,
} from "./types";

export type {
  GridRegistration,
  HandoffRequest,
  DragCoordinatorOptions,
} from "./DragCoordinator";
