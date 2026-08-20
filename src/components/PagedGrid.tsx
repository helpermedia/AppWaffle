import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppItem } from "@/components/items/AppItem";
import { FolderItem, type GridFolder } from "@/components/items/FolderItem";
import { IconGrid } from "@/components/ui/IconGrid";
import { useDragGrid, type DragMoveInfo } from "@/hooks/useDragGrid";
import { useLatestRef } from "@/hooks/useLatestRef";
import { GRID_COLUMNS, GRID_GAP, TILE_HEIGHT, pageGridId } from "@/constants/grid";
import { cn } from "@/utils/cn";
import { watchPointerRelease } from "@/lib/helper-dnd";
import type { DragCoordinator, DragEngine, Point } from "@/lib/helper-dnd";
import type { GridItemUnion, PageDragHandlers } from "@/hooks/useGrid";
import type { PagedFolderInsert } from "@/hooks/useDragHandoff";
import type { DropAction } from "@/hooks/useFolderCreation";

/** An in-progress drag inside one of the pages, for host-level guards
 *  and for routing dock pinning to the engine that owns the gesture */
export interface PagedDragHandle {
  pageIndex: number;
  cancel: () => void;
  getEngine: () => DragEngine | null;
}

/** How a page exposes its engine to the flip machinery */
interface PageRegistration {
  getEngine: () => DragEngine | null;
  getContainer: () => HTMLElement | null;
}

/** Zone along the viewport's left/right edge that arms a page flip */
const FLIP_EDGE_SIZE = 40;

/** How long the pointer must dwell in the edge zone before flipping —
 *  deliberately longer than the Dock's 150ms: a flip relocates the item
 *  across pages, and grazing the edge mid-reorder must not trigger it */
const FLIP_DWELL_MS = 400;

/** Duration of the page slide when a drag flips pages */
const FLIP_ANIMATION_MS = 300;

/** Slide the viewport with per-frame instant scrolls: CSS scroll-smooth
 *  has no completion signal, and the target engine must cache item rects
 *  only after the viewport settles */
function animateViewportTo(el: HTMLElement, targetLeft: number): Promise<void> {
  return new Promise((resolve) => {
    const startLeft = el.scrollLeft;
    const delta = targetLeft - startLeft;
    const start = performance.now();
    function frame(now: number) {
      const t = Math.min(1, (now - start) / FLIP_ANIMATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      el.scrollTo({ left: startLeft + delta * eased, behavior: "instant" });
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

interface PagedGridProps {
  items: GridItemUnion[];
  selectedId: string | null;
  launchingPath: string | null;
  /** Kept mounted while true (search open, folder open) so the page
   *  position survives; display:none resets scrollLeft without an event */
  hidden: boolean;
  onLaunch: (path: string) => void;
  onCloseApp: () => void;
  onOpenFolder: (folder: GridFolder) => void;
  /** Commit a new master order (a page's reorder spliced into the whole) */
  onOrderChange: (newOrder: string[]) => void;
  /** Reports the active page drag, null when none (Escape and guards) */
  onDragStateChange: (drag: PagedDragHandle | null) => void;
  /** Dock handoff, folder creation and drop animation (from useGrid) */
  dragHandlers: PageDragHandlers;
  /** Folder-creation ring target (shared with the main grid's logic) */
  dropTarget: { id: string; action: DropAction } | null;
  /** Handoff coordinator: the current page registers as the folder
   *  drag-out target while the paged layout is visible */
  coordinator: DragCoordinator;
  /** Registers how a folder drag-out lands in the visible page's window;
   *  called with null on unmount */
  registerFolderInsert: (insert: PagedFolderInsert | null) => void;
}

interface PageProps {
  pageItems: GridItemUnion[];
  pageIndex: number;
  /** The page at the current scroll position — it alone registers with
   *  the handoff coordinator, so a folder drag-out targets it */
  isCurrent: boolean;
  selectedId: string | null;
  launchingPath: string | null;
  onLaunch: (path: string) => void;
  onCloseApp: () => void;
  onOpenFolder: (folder: GridFolder) => void;
  onOrderChange: (pageIndex: number, pageIds: string[]) => void;
  onDragStateChange: (pageIndex: number, drag: PagedDragHandle | null) => void;
  onDragMove: (pageIndex: number, info: DragMoveInfo, dockOwned: boolean) => void;
  registerPage: (pageIndex: number, registration: PageRegistration) => void;
  unregisterPage: (pageIndex: number) => void;
  /** Item mid-flip into this render: its tile hides before its engine
   *  adopts the drag, or ghost and tile would both show during the slide */
  pendingDragId: string | null;
  dragHandlers: PageDragHandlers;
  dropTarget: { id: string; action: DropAction } | null;
  coordinator: DragCoordinator;
}

/**
 * One page with its own drag engine, so slot detection sees single-page
 * geometry. Reorders splice back into the master order via onOrderChange.
 * Renders from the hook's order (the drag commit path) while item data
 * resolves fresh from props, keeping icon loads live. External slice
 * changes (cross-page moves rippling through the positional windows) are
 * synced into the hook whenever the id set differs; same-set sequence
 * changes stay owned by the hook, whose order runs ahead of the parent
 * during a local drop commit.
 */
function Page({
  pageItems,
  pageIndex,
  isCurrent,
  selectedId,
  launchingPath,
  onLaunch,
  onCloseApp,
  onOpenFolder,
  onOrderChange,
  onDragStateChange,
  onDragMove,
  registerPage,
  unregisterPage,
  pendingDragId,
  dragHandlers,
  dropTarget,
  coordinator,
}: PageProps) {
  const { containerRef, order, setOrder, activeId, cancelDrag, getEngine } = useDragGrid({
    initialOrder: pageItems.map((item) => item.data.id),
    // No-op today (AutoScroller only attaches to vertical-overflow hosts,
    // which pages don't have) — pinned off so a future AutoScroller change
    // can't start moving the paged viewport under a live drag
    engineOptions: { autoScroll: false },
    onOrderChange: (pageIds) => onOrderChange(pageIndex, pageIds),
    onDragStart: () => {
      dragHandlers.onDragStart();
      onDragStateChange(pageIndex, { pageIndex, cancel: cancelDrag, getEngine });
    },
    onDragMove: (info) => {
      // Shared behavior first — Dock handoff outranks the flip dwell,
      // exactly as it outranks folder creation
      const dockOwned = dragHandlers.onDragMove(info);
      onDragMove(pageIndex, info, dockOwned);
    },
    onDragEnd: (info, reorder, complete) => {
      dragHandlers.onDragEnd(info, reorder, () => {
        complete();
        onDragStateChange(pageIndex, null);
      });
    },
    onDragCancel: () => {
      dragHandlers.onDragCancel();
      onDragStateChange(pageIndex, null);
    },
    getDropAnimationTarget: dragHandlers.getDropAnimationTarget,
  });

  // Sync external slice changes into the hook: setState during render
  // (React retries synchronously before commit, per house convention)
  const sliceIds = pageItems.map((item) => item.data.id);
  const currentOrder = order ?? [];
  const orderIdSet = new Set(currentOrder);
  const sameIdSet =
    currentOrder.length === sliceIds.length && sliceIds.every((id) => orderIdSet.has(id));
  if (!sameIdSet) {
    setOrder(sliceIds);
  }

  // Expose the engine to the flip machinery. The mount-time registration
  // object is enough: its getters close over stable refs.
  const registrationRef = useLatestRef<PageRegistration>({
    getEngine,
    getContainer: () => containerRef.current,
  });
  useEffect(() => {
    registerPage(pageIndex, registrationRef.current);
    return () => unregisterPage(pageIndex);
  }, [registerPage, unregisterPage, pageIndex, registrationRef]);

  // Only the current page joins the handoff coordinator, so a folder
  // drag-out has exactly one candidate target: this page. Its engine
  // exists before this runs (useDragGrid's effect is registered first).
  useEffect(() => {
    if (!isCurrent) return;
    const engine = registrationRef.current.getEngine();
    const container = registrationRef.current.getContainer();
    if (!engine || !container) {
      console.warn("PagedGrid: current page engine not ready, folder drag-out disabled");
      return;
    }
    const id = pageGridId(pageIndex);
    coordinator.register({ id, engine, container });
    return () => coordinator.unregister(id);
  }, [isCurrent, coordinator, pageIndex, registrationRef]);

  // Engine teardown paths (unmount mid-drag, destroy during the drop
  // animation) emit no events — release the host's drag handle on the way
  // out so guards can't wedge on a drag that no longer exists. The owner
  // check upstream makes this a no-op for pages that aren't dragging.
  const releaseRef = useLatestRef(() => onDragStateChange(pageIndex, null));
  useEffect(() => {
    // Mount-time capture (lint-preferred): the closure only touches stable
    // values (pageIndex never changes; the handler chain ends in stable
    // setters and refs), so latest-vs-mount is equivalent here
    const release = releaseRef.current;
    return () => release();
  }, [releaseRef]);

  const itemsById = new Map(pageItems.map((item) => [item.data.id, item]));
  const ordered = (order ?? []).flatMap((id) => itemsById.get(id) ?? []);

  return (
    <IconGrid ref={containerRef} className="max-w-7xl mx-auto">
      {ordered.map((item) => {
        const dropAction = dropTarget?.id === item.data.id ? dropTarget.action : undefined;
        return item.type === "app" ? (
          <AppItem
            key={item.data.id}
            item={item.data}
            isDragActive={activeId !== null}
            isDragging={activeId === item.data.id || pendingDragId === item.data.id}
            dropAction={dropAction}
            isSelected={selectedId === item.data.id}
            onLaunch={onLaunch}
            onCloseApp={onCloseApp}
            isLaunching={launchingPath === item.data.path}
          />
        ) : (
          <FolderItem
            key={item.data.id}
            item={item.data}
            isDragActive={activeId !== null}
            isDragging={activeId === item.data.id || pendingDragId === item.data.id}
            dropAction={dropAction}
            isSelected={selectedId === item.data.id}
            onOpen={onOpenFolder}
          />
        );
      })}
    </IconGrid>
  );
}

/**
 * Launchpad-style paged layout: full-width pages snapped horizontally,
 * holding as many whole rows as the viewport fits. Each page runs its own
 * drag engine with the main grid's shared behavior (reorder, folder
 * creation, Dock pinning); dwelling at a viewport edge mid-drag flips to
 * the adjacent page and hands the gesture off to its engine, and folder
 * drag-outs adopt onto the current page via the coordinator.
 */
export function PagedGrid({
  items,
  selectedId,
  launchingPath,
  hidden,
  onLaunch,
  onCloseApp,
  onOpenFolder,
  onOrderChange,
  onDragStateChange,
  dragHandlers,
  dropTarget,
  coordinator,
  registerFolderInsert,
}: PagedGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(0);
  const [page, setPage] = useState(0);
  const [isPageDragging, setIsPageDragging] = useState(false);
  const [pendingDragId, setPendingDragId] = useState<string | null>(null);

  // Pages register their engines here for the flip handoff
  const [pagesMap] = useState(() => new Map<number, PageRegistration>());
  const [pageRegistry] = useState(() => ({
    register: (index: number, registration: PageRegistration) => {
      pagesMap.set(index, registration);
    },
    unregister: (index: number) => {
      pagesMap.delete(index);
    },
  }));

  // Which page owns the live drag: N pages report into one handle slot,
  // so a late clear (unmount, teardown) from a non-owner must not wipe
  // another page's active drag
  const dragOwnerRef = useRef<number | null>(null);

  // Edge-dwell flip state. While a flip is in flight, handle clears from
  // the source page's cancel are suppressed — the drag continues on the
  // target, and dropping the handle would open a frames-wide window where
  // Escape falls through to close-the-launcher.
  const flipRef = useRef<{
    inProgress: boolean;
    armedDirection: -1 | 0 | 1;
    timer: number | null;
  }>({ inProgress: false, armedDirection: 0, timer: null });
  const lastPointerRef = useRef<Point>({ x: 0, y: 0 });

  function clearFlipDwell() {
    const flip = flipRef.current;
    if (flip.timer !== null) {
      clearTimeout(flip.timer);
      flip.timer = null;
    }
    flip.armedDirection = 0;
  }

  useEffect(() => {
    const flip = flipRef.current;
    return () => {
      if (flip.timer !== null) clearTimeout(flip.timer);
    };
  }, []);

  // The window is fullscreen and never resizes, but the grid can mount
  // hidden (0 height) — measure whenever it becomes visible. The rect is
  // cached for the per-move edge checks: measuring there would force a
  // style recalc after every ghost/shift transform write.
  const viewportRectRef = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (hidden || !el || el.clientHeight === 0) return;
    viewportRectRef.current = el.getBoundingClientRect();
    setRows(Math.max(1, Math.floor((el.clientHeight + GRID_GAP) / (TILE_HEIGHT + GRID_GAP))));
  }, [hidden]);

  // display:none (search, folder modal) drops scrollLeft to 0 without a
  // scroll event; restore the active page synchronously on un-hide.
  // Layout effect, no rAF: a folder drag-out adopts onto the current page
  // right after the un-hiding commit, and the target engine must cache
  // item rects with the viewport already restored — an async restore can
  // lose the race when the scheduler yields under continuous pointer input.
  const wasHiddenRef = useRef(hidden);
  useLayoutEffect(() => {
    if (wasHiddenRef.current && !hidden) {
      const el = viewportRef.current;
      // "instant" overrides the viewport's scroll-smooth
      el?.scrollTo({ left: page * el.clientWidth, behavior: "instant" });
    }
    wasHiddenRef.current = hidden;
  }, [hidden, page]);

  const perPage = rows * GRID_COLUMNS;
  const pages: GridItemUnion[][] = [];
  if (perPage > 0) {
    for (let i = 0; i < items.length; i += perPage) {
      pages.push(items.slice(i, i + perPage));
    }
  }

  // A folder drag-out lands at the visible page's last slot: everything
  // before it stays put and the page's last item cascades onward — the
  // calm-entry counterpart of the flip's near-edge insertion
  const folderInsertRef = useLatestRef<PagedFolderInsert>((idsWithoutItem, itemId) => {
    const insertAt = Math.min((page + 1) * perPage - 1, idsWithoutItem.length);
    const placed = [...idsWithoutItem];
    placed.splice(insertAt, 0, itemId);
    return placed;
  });
  useEffect(() => {
    registerFolderInsert((idsWithoutItem, itemId) =>
      folderInsertRef.current(idsWithoutItem, itemId)
    );
    return () => registerFolderInsert(null);
  }, [registerFolderInsert, folderInsertRef]);

  function releaseHeldDrag() {
    dragOwnerRef.current = null;
    setIsPageDragging(false);
    onDragStateChange(null);
  }

  function handleDragStateChange(pageIndex: number, drag: PagedDragHandle | null) {
    if (drag === null && (flipRef.current.inProgress || dragOwnerRef.current !== pageIndex)) {
      return;
    }
    if (drag === null) clearFlipDwell();
    dragOwnerRef.current = drag ? pageIndex : null;
    setIsPageDragging(drag !== null);
    onDragStateChange(drag);
  }

  function handlePageOrderChange(pageIndex: number, pageIds: string[]) {
    const masterIds = items.map((item) => item.data.id);
    const start = pageIndex * perPage;
    // A page may only reorder its own window: same ids, same count. A
    // mismatch means the partition drifted under the page and committing
    // would corrupt the master order.
    const windowIds = new Set(masterIds.slice(start, start + pageIds.length));
    if (windowIds.size !== pageIds.length || !pageIds.every((id) => windowIds.has(id))) {
      console.warn("PagedGrid: dropped stale reorder from page", pageIndex);
      return;
    }
    onOrderChange([
      ...masterIds.slice(0, start),
      ...pageIds,
      ...masterIds.slice(start + pageIds.length),
    ]);
  }

  /** Arm, re-aim or clear the edge dwell for the current drag position */
  function handlePageDragMove(pageIndex: number, info: DragMoveInfo, dockOwned: boolean) {
    lastPointerRef.current = info.pointer;
    const rect = viewportRectRef.current;
    const flip = flipRef.current;
    if (!rect || flip.inProgress) return;

    // A left/right Dock's zone can overlap the flip zones: once the Dock
    // owns the gesture, a flip firing mid-handoff would adopt the hidden
    // ghost into an invisible drag beside the live native session
    if (dockOwned) {
      clearFlipDwell();
      return;
    }

    const direction: -1 | 0 | 1 =
      info.pointer.x < rect.left + FLIP_EDGE_SIZE
        ? -1
        : info.pointer.x > rect.right - FLIP_EDGE_SIZE
          ? 1
          : 0;
    const targetPage = pageIndex + direction;

    if (direction === 0 || targetPage < 0 || targetPage >= pages.length) {
      clearFlipDwell();
      return;
    }
    if (flip.armedDirection === direction) return; // dwell already running

    clearFlipDwell();
    flip.armedDirection = direction;
    flip.timer = window.setTimeout(() => {
      flip.timer = null;
      flip.armedDirection = 0;
      void performFlip(pageIndex, targetPage, info.activeId);
    }, FLIP_DWELL_MS);
  }

  /**
   * Keep the detached ghost under the pointer while the flip animates:
   * no engine is tracking moves in that window. Replicates GhostElement's
   * positioning scheme (fixed at 0,0 plus translate3d; scale matches its
   * DEFAULTS) — the target engine recalibrates from the ghost's rendered
   * rect on adoption, so any sub-pixel drift self-corrects.
   */
  function followGhost(ghost: HTMLElement): () => void {
    const rect = ghost.getBoundingClientRect();
    const start = lastPointerRef.current;
    const offsetX = rect.left - start.x;
    const offsetY = rect.top - start.y;
    const onMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      ghost.style.transform = `translate3d(${e.clientX + offsetX}px, ${e.clientY + offsetY}px, 0) scale(1.02)`;
    };
    document.addEventListener("pointermove", onMove, { capture: true });
    return () => document.removeEventListener("pointermove", onMove, true);
  }

  /**
   * Hand the live drag from one page's engine to the adjacent page's:
   * the same dance as DragCoordinator.handoff, plus the order move and
   * the viewport flip. Runs outside the coordinator deliberately — its
   * single onHandoff slot belongs to the folder flow.
   */
  async function performFlip(fromPage: number, toPage: number, itemId: string) {
    const fromEngine = pagesMap.get(fromPage)?.getEngine();
    const target = pagesMap.get(toPage);
    const viewport = viewportRef.current;
    if (!fromEngine || !target || !viewport) return;

    // The dwell can fire after the pointer released (a still pointer and a
    // released one both stop producing moves); adopting a ghost that is
    // already settling would corrupt the drop
    if (!fromEngine.isActivelyDragging()) return;

    const flip = flipRef.current;
    flip.inProgress = true;
    // The source tracker's listeners die at cancelForHandoff and the
    // target's only attach in startDragAt — a release inside the awaited
    // frames below would otherwise go unobserved and the adopted drag
    // could never end (frozen ghost, wedged guards)
    const releaseWatch = watchPointerRelease();
    try {
      // Ownership of the ghost transfers before the source cancels, so
      // nothing visual is destroyed. cancelForHandoff (not cancel) emits
      // onDragCancel, resetting the source page's React drag state; the
      // host handle survives because clears are suppressed mid-flip.
      const ghost = fromEngine.detachGhost();
      if (!ghost) {
        // Defensive (a live drag implies a ghost): kill the gesture before
        // dropping the guards, never the other way around
        fromEngine.cancelForHandoff();
        releaseHeldDrag();
        return;
      }
      fromEngine.cancelForHandoff();

      // Move the item into the target page's near-edge slot in the master
      // order (forward: first slot; backward: last slot). Windows are
      // positional, so removal and insertion cancel out for every other
      // item: the target page's tiles stay put, one neighbor backfills
      // across the boundary, and the item's slot lands where the ghost
      // already hovers. (Original Launchpad instead left a hole on the
      // source page — positional windows can't represent gaps.)
      const masterIds = items.map((item) => item.data.id).filter((id) => id !== itemId);
      const insertAt = Math.min(
        toPage > fromPage ? toPage * perPage : toPage * perPage + perPage - 1,
        masterIds.length
      );
      masterIds.splice(insertAt, 0, itemId);
      // Hidden from first paint on the target page (its engine only takes
      // over at adoption): committed in the same batch as the order move
      setPendingDragId(itemId);
      onOrderChange(masterIds);

      // Slide to the target page like a normal page change. The first
      // animation frame runs after React commits the new slices, and the
      // target engine caches item rects only after the viewport settles.
      const stopFollowing = followGhost(ghost);
      try {
        await animateViewportTo(viewport, toPage * viewport.clientWidth);
      } finally {
        stopFollowing();
      }

      const element = target
        .getContainer()
        ?.querySelector<HTMLElement>(`[data-draggable][data-id="${CSS.escape(itemId)}"]`);
      const toEngine = target.getEngine();
      if (releaseWatch.wasReleased() || !element || !toEngine) {
        // Released mid-flip: the order move stands (the user did drag the
        // item to this page), but there is no live gesture left to adopt
        ghost.remove();
        releaseHeldDrag();
        return;
      }

      // Adopt: emits onDragStart, so the target page takes over the handle
      toEngine.startDragAt(element, lastPointerRef.current, ghost);
    } finally {
      // The target's activeId hides the tile from here (same commit), so
      // clearing the pending id never flashes it visible
      setPendingDragId(null);
      releaseWatch.dispose();
      flip.inProgress = false;
    }
  }

  function goToPage(index: number) {
    if (isPageDragging) return;
    const el = viewportRef.current;
    el?.scrollTo({ left: index * el.clientWidth });
  }

  return (
    <div className={cn("flex-1 min-h-0 flex flex-col", hidden && "hidden")}>
      <div
        ref={viewportRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          // Hidden layouts fire spurious scrolls with a 0 width
          if (el.clientWidth === 0) return;
          setPage(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className={cn(
          "flex-1 min-h-0 flex overflow-y-hidden scroll-smooth [&::-webkit-scrollbar]:hidden",
          // Mid-drag the cached item rects live in the drag-start frame: a
          // user-initiated horizontal scroll would silently shift them, so
          // scrolling is locked while a page drag is active. Snapping is
          // suspended with it — mandatory snap re-snaps every frame of the
          // flip's rAF slide to a page boundary, collapsing the animation
          // into a jump. The flip targets an exact boundary, so snapping
          // resumes on a snap point when the drag ends.
          isPageDragging ? "overflow-x-hidden snap-none" : "overflow-x-auto snap-x snap-mandatory"
        )}
      >
        {pages.map((pageItems, index) => (
          <div key={index} className="w-full shrink-0 snap-center">
            <Page
              pageItems={pageItems}
              pageIndex={index}
              // Clamped: after shrinking while hidden, `page` can exceed
              // the page count and no page would register for drag-out
              isCurrent={index === Math.min(page, pages.length - 1)}
              selectedId={selectedId}
              launchingPath={launchingPath}
              onLaunch={onLaunch}
              onCloseApp={onCloseApp}
              onOpenFolder={onOpenFolder}
              onOrderChange={handlePageOrderChange}
              onDragStateChange={handleDragStateChange}
              onDragMove={handlePageDragMove}
              registerPage={pageRegistry.register}
              unregisterPage={pageRegistry.unregister}
              pendingDragId={pendingDragId}
              dragHandlers={dragHandlers}
              dropTarget={dropTarget}
              coordinator={coordinator}
            />
          </div>
        ))}
      </div>
      {/* Always mounted so the viewport height (and row fit) is stable */}
      <div data-keep-open className="flex h-8 items-center justify-center gap-2.5">
        {pages.length > 1 &&
          pages.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Page ${index + 1}`}
              onClick={() => goToPage(index)}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                index === page ? "bg-white/70" : "bg-white/25 hover:bg-white/40"
              )}
            />
          ))}
      </div>
    </div>
  );
}
