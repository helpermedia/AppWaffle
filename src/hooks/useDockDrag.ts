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
 * How long the pointer must stay inside the Dock zone before the gesture
 * is handed off to the native session. The handoff is one-way (AppKit has
 * no API to reclaim a live drag session), and edge auto-scroll lives just
 * above the zone — a graze or instant regret must keep the web drag alive.
 */
const HANDOFF_DWELL_MS = 150;

/** How soon a rejected handoff retries when no move event does it first */
const HANDOFF_RETRY_MS = 150;

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
  const gestureRef = useRef<{
    activeId: string | null;
    handedOff: boolean;
    inZone: boolean;
    /** The dwell was completed for this zone visit — retries skip it */
    dwellDone: boolean;
  }>({
    activeId: null,
    handedOff: false,
    inZone: false,
    dwellDone: false,
  });
  const dwellTimerRef = useRef<number | null>(null);

  function clearDwellTimer(): void {
    if (dwellTimerRef.current !== null) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  }

  // The zone is stable for the app's lifetime: Wafflepad quits on focus
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
      if (dwellTimerRef.current !== null) clearTimeout(dwellTimerRef.current);
    };
  }, []);

  /** Forget the current gesture. Call on drag end and drag cancel. */
  function reset(): void {
    clearDwellTimer();
    gestureRef.current = { activeId: null, handedOff: false, inZone: false, dwellDone: false };
  }

  /** Hand off now unless already done. Used by the dwell timer and retries. */
  function attemptHandoff(): void {
    const gesture = gestureRef.current;
    if (gesture.handedOff || gesture.activeId === null) return;
    gesture.handedOff = true;
    beginNativeDrag(gesture.activeId);
  }

  function beginNativeDrag(appPath: string): void {
    const engine = getEngine();
    const ghost = engine?.getGhostElement() ?? null;
    // Frame the native drag image on the tile's square artwork, not the
    // whole ghost (which includes the label area below) — the native image
    // is the bare app icon and would stretch to fill a 4:5 tile frame
    const artwork = ghost?.querySelector("img") ?? null;
    const rect = (artwork ?? ghost)?.getBoundingClientRect() ?? null;

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
        // e.g. the pointer was released mid-invoke, or the Rust guard saw
        // no live mouse event (likelier when the dwell timer, not a move,
        // fires the invoke): let the DOM drag continue. dwellDone stays
        // set, so the next in-zone move retries without re-paying the
        // dwell — intent was already proven for this zone visit.
        console.warn("useDockDrag: native drag did not start", error);
        if (ghost) ghost.style.visibility = "";
        gestureRef.current.handedOff = false;
        // A perfectly still pointer — the gesture the dwell exists for —
        // generates no further move events, so a rejected attempt must
        // re-arm itself; whichever of the timer or the next move comes
        // first retries.
        if (gestureRef.current.inZone && dwellTimerRef.current === null) {
          dwellTimerRef.current = window.setTimeout(() => {
            dwellTimerRef.current = null;
            const current = gestureRef.current;
            if (!current.inZone || current.handedOff) return;
            attemptHandoff();
          }, HANDOFF_RETRY_MS);
        }
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
      clearDwellTimer();
      gesture.activeId = info.activeId;
      gesture.handedOff = false;
      gesture.inZone = false;
    }
    if (gesture.handedOff) return true;

    const zone = zoneRef.current;
    const inZone =
      zone !== null && isPinnable(info.activeId) && pointInZone(info.pointer, zone);

    if (!inZone) {
      gesture.inZone = false;
      gesture.dwellDone = false; // a fresh visit pays a fresh dwell
      clearDwellTimer();
      return false;
    }

    // Dwell before the irreversible handoff: the timer (not move events)
    // decides, so a pointer held perfectly still over the Dock still hands
    // off. Leaving the zone first cancels it and the web drag continues.
    if (!gesture.inZone) {
      gesture.inZone = true;
      dwellTimerRef.current = window.setTimeout(() => {
        dwellTimerRef.current = null;
        const current = gestureRef.current;
        if (!current.inZone || current.handedOff) return;
        current.dwellDone = true;
        attemptHandoff();
      }, HANDOFF_DWELL_MS);
    } else if (gesture.dwellDone) {
      // A prior attempt failed after the dwell completed — retry on this
      // move immediately, matching the pre-dwell behavior
      attemptHandoff();
    }

    // Dock territory: folder logic stands down while hovering here
    return true;
  }

  return { handleDragMove, reset };
}
