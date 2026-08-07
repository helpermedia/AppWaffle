import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DragEngine, Point } from "@/lib/helper-dnd";
import type { DragMoveInfo } from "@/hooks/useDragGrid";

/**
 * Screen region (CSS pixels) that hands a drag off to the native Dock
 * session. The wire format also carries `side` and `autoHide` — useful when
 * debugging, unused here.
 */
interface DockZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseDockDragOptions {
  /** Engine driving the active gesture (ghost access + handoff cancel) */
  getEngine: () => DragEngine | null;
  /** Whether this grid item is an app that can be pinned (folders can't) */
  isPinnable: (id: string) => boolean;
}

function pointInZone(point: Point, zone: DockZone): boolean {
  return (
    point.x >= zone.x &&
    point.x < zone.x + zone.width &&
    point.y >= zone.y &&
    point.y < zone.y + zone.height
  );
}

/**
 * Launchpad-style "drop an app onto the Dock".
 *
 * A DOM drag can never leave the webview, so when the pointer enters the
 * Dock's screen region the in-flight gesture is handed off to a native
 * NSDraggingSession (start_dock_drag). The Dock itself pins the dropped
 * app; the grid keeps the app either way, matching Launchpad.
 */
export function useDockDrag({ getEngine, isPinnable }: UseDockDragOptions) {
  const zoneRef = useRef<DockZone | null>(null);
  const gestureRef = useRef<{ activeId: string | null; handedOff: boolean }>({
    activeId: null,
    handedOff: false,
  });

  // The zone is stable for the app's lifetime: AppWaffle quits on focus
  // loss, so the Dock can't be moved or resized while we're frontmost.
  useEffect(() => {
    let stale = false;
    invoke<DockZone>("get_dock_drag_zone")
      .then((zone) => {
        if (!stale) zoneRef.current = zone;
      })
      .catch((error) => {
        // Without a zone, dock drag is disabled for this session
        console.warn("useDockDrag: could not resolve Dock zone", error);
      });
    return () => {
      stale = true;
    };
  }, []);

  /** Forget the current gesture. Call on drag end and drag cancel. */
  function reset(): void {
    gestureRef.current = { activeId: null, handedOff: false };
  }

  function beginNativeDrag(appPath: string): void {
    const engine = getEngine();
    const ghost = engine?.getGhostElement() ?? null;
    const rect = ghost?.getBoundingClientRect() ?? null;

    // Hide the DOM ghost now: the native drag image appears in the same
    // frame, and both visible at once would double the icon.
    if (ghost) ghost.style.visibility = "hidden";

    invoke("start_dock_drag", {
      appPath,
      ghostRect: rect
        ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
        : null,
    })
      .then(() => {
        // The native session owns the mouse now; end the DOM drag. The
        // pointer release will never reach the webview.
        getEngine()?.cancelForHandoff();
      })
      .catch((error) => {
        // e.g. the pointer was released mid-invoke: let the DOM drag
        // finish normally.
        console.warn("useDockDrag: native drag did not start", error);
        if (ghost) ghost.style.visibility = "";
        gestureRef.current.handedOff = false;
      });
  }

  /**
   * Feed every grid drag move through this. Returns true while the gesture
   * belongs to the native session, so grid-side drag logic (folder
   * creation) must stand down.
   */
  function handleDragMove(info: DragMoveInfo): boolean {
    const gesture = gestureRef.current;
    if (gesture.activeId !== info.activeId) {
      gesture.activeId = info.activeId;
      gesture.handedOff = false;
    }
    if (gesture.handedOff) return true;

    const zone = zoneRef.current;
    if (!zone || !isPinnable(info.activeId) || !pointInZone(info.pointer, zone)) {
      return false;
    }

    gesture.handedOff = true;
    beginNativeDrag(info.activeId);
    return true;
  }

  return { handleDragMove, reset };
}
