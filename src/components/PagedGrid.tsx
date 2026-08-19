import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppItem } from "@/components/items/AppItem";
import { FolderItem, type GridFolder } from "@/components/items/FolderItem";
import { IconGrid } from "@/components/ui/IconGrid";
import { useDragGrid } from "@/hooks/useDragGrid";
import { useLatestRef } from "@/hooks/useLatestRef";
import { GRID_COLUMNS, GRID_GAP, TILE_HEIGHT } from "@/constants/grid";
import { cn } from "@/utils/cn";
import type { GridItemUnion } from "@/hooks/useGrid";

/** An in-progress drag inside one of the pages, for host-level guards */
export interface PagedDragHandle {
  pageIndex: number;
  cancel: () => void;
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
}

interface PageProps {
  pageItems: GridItemUnion[];
  pageIndex: number;
  selectedId: string | null;
  launchingPath: string | null;
  onLaunch: (path: string) => void;
  onCloseApp: () => void;
  onOpenFolder: (folder: GridFolder) => void;
  onOrderChange: (pageIndex: number, pageIds: string[]) => void;
  onDragStateChange: (pageIndex: number, drag: PagedDragHandle | null) => void;
}

/**
 * One page with its own drag engine, so slot detection sees single-page
 * geometry. Reorders splice back into the master order via onOrderChange.
 * Renders from the hook's order (the drag commit path) while item data
 * resolves fresh from props, keeping icon loads live. Page slices only
 * change externally on layout switches, which remount the whole PagedGrid;
 * cross-page moves arrive in a later increment and will sync via setOrder.
 */
function Page({
  pageItems,
  pageIndex,
  selectedId,
  launchingPath,
  onLaunch,
  onCloseApp,
  onOpenFolder,
  onOrderChange,
  onDragStateChange,
}: PageProps) {
  const { containerRef, order, activeId, cancelDrag } = useDragGrid({
    initialOrder: pageItems.map((item) => item.data.id),
    // No-op today (AutoScroller only attaches to vertical-overflow hosts,
    // which pages don't have) — pinned off so a future AutoScroller change
    // can't start moving the paged viewport under a live drag
    engineOptions: { autoScroll: false },
    onOrderChange: (pageIds) => onOrderChange(pageIndex, pageIds),
    onDragStart: () => onDragStateChange(pageIndex, { pageIndex, cancel: cancelDrag }),
    onDragEnd: (_info, reorder, complete) => {
      reorder();
      complete();
      onDragStateChange(pageIndex, null);
    },
    onDragCancel: () => onDragStateChange(pageIndex, null),
  });

  // Engine teardown paths (unmount mid-drag, destroy during the drop
  // animation) emit no events — release the host's drag handle on the way
  // out so guards can't wedge on a drag that no longer exists. The owner
  // check upstream makes this a no-op for pages that aren't dragging.
  // Mount-time capture is sound: the closure only reaches stable values
  // (pageIndex never changes; the handler chain ends in setters and refs).
  const releaseRef = useLatestRef(() => onDragStateChange(pageIndex, null));
  useEffect(() => {
    const release = releaseRef.current;
    return () => release();
  }, [releaseRef]);

  const itemsById = new Map(pageItems.map((item) => [item.data.id, item]));
  const ordered = (order ?? []).flatMap((id) => itemsById.get(id) ?? []);

  return (
    <IconGrid ref={containerRef} className="max-w-7xl mx-auto">
      {ordered.map((item) =>
        item.type === "app" ? (
          <AppItem
            key={item.data.id}
            item={item.data}
            isDragActive={activeId !== null}
            isDragging={activeId === item.data.id}
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
            isDragging={activeId === item.data.id}
            isSelected={selectedId === item.data.id}
            onOpen={onOpenFolder}
          />
        )
      )}
    </IconGrid>
  );
}

/**
 * Launchpad-style paged layout: full-width pages snapped horizontally,
 * holding as many whole rows as the viewport fits. Each page runs its own
 * drag engine for within-page reordering; cross-page moves, folder
 * creation and drag-to-Dock are later increments. Keyboard navigation's
 * own scrollIntoView drives page flips, animated by scroll-smooth.
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
}: PagedGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(0);
  const [page, setPage] = useState(0);
  const [isPageDragging, setIsPageDragging] = useState(false);

  // The window is fullscreen and never resizes, but the grid can mount
  // hidden (0 height) — measure whenever it becomes visible
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (hidden || !el || el.clientHeight === 0) return;
    setRows(Math.max(1, Math.floor((el.clientHeight + GRID_GAP) / (TILE_HEIGHT + GRID_GAP))));
  }, [hidden]);

  // display:none (search, folder modal) drops scrollLeft to 0 without a
  // scroll event; restore the active page when visible again
  const wasHiddenRef = useRef(hidden);
  useEffect(() => {
    if (wasHiddenRef.current && !hidden) {
      requestAnimationFrame(() => {
        const el = viewportRef.current;
        // "instant" overrides the viewport's scroll-smooth
        el?.scrollTo({ left: page * el.clientWidth, behavior: "instant" });
      });
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

  // Which page owns the live drag: N pages report into one handle slot,
  // so a late clear (unmount, teardown) from a non-owner must not wipe
  // another page's active drag
  const dragOwnerRef = useRef<number | null>(null);

  function handleDragStateChange(pageIndex: number, drag: PagedDragHandle | null) {
    if (drag === null && dragOwnerRef.current !== pageIndex) return;
    dragOwnerRef.current = drag ? pageIndex : null;
    setIsPageDragging(drag !== null);
    onDragStateChange(drag);
  }

  function handlePageOrderChange(pageIndex: number, pageIds: string[]) {
    const masterIds = items.map((item) => item.data.id);
    const start = pageIndex * perPage;
    // A page may only reorder its own window: same ids, same count. A
    // mismatch means the partition drifted under the page (its order is
    // seeded once at mount) and committing would corrupt the master order.
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
          "flex-1 min-h-0 flex overflow-y-hidden snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden",
          // Mid-drag the cached item rects live in the drag-start frame:
          // a user-initiated horizontal scroll would silently shift them,
          // so scrolling is locked while a page drag is active
          isPageDragging ? "overflow-x-hidden" : "overflow-x-auto"
        )}
      >
        {pages.map((pageItems, index) => (
          <div key={index} className="w-full shrink-0 snap-center">
            <Page
              pageItems={pageItems}
              pageIndex={index}
              selectedId={selectedId}
              launchingPath={launchingPath}
              onLaunch={onLaunch}
              onCloseApp={onCloseApp}
              onOpenFolder={onOpenFolder}
              onOrderChange={handlePageOrderChange}
              onDragStateChange={handleDragStateChange}
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
