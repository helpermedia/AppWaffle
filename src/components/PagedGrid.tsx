import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppItem } from "@/components/items/AppItem";
import { FolderItem, type GridFolder } from "@/components/items/FolderItem";
import { IconGrid } from "@/components/ui/IconGrid";
import { GRID_COLUMNS, GRID_GAP, TILE_HEIGHT } from "@/constants/grid";
import { cn } from "@/utils/cn";
import type { GridItemUnion } from "@/hooks/useGrid";

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
}

/**
 * Launchpad-style paged layout: full-width pages snapped horizontally,
 * holding as many whole rows as the viewport fits. Launching, search,
 * folders and the context menu all work here; every drag interaction —
 * reordering, folder creation and drag-to-Dock — lives in the scrollable
 * layout (the drag engine binds to its grid, kept mounted hidden), so
 * tiles render inert. Keyboard navigation's own scrollIntoView drives
 * page flips, animated by scroll-smooth on the viewport.
 */
export function PagedGrid({
  items,
  selectedId,
  launchingPath,
  hidden,
  onLaunch,
  onCloseApp,
  onOpenFolder,
}: PagedGridProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(0);
  const [page, setPage] = useState(0);

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

  function goToPage(index: number) {
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
        className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((pageItems, index) => (
          <div key={index} className="w-full shrink-0 snap-center">
            <IconGrid className="max-w-7xl mx-auto">
              {pageItems.map((item) =>
                item.type === "app" ? (
                  <AppItem
                    key={item.data.id}
                    item={item.data}
                    draggable={false}
                    isDragActive={false}
                    isDragging={false}
                    isSelected={selectedId === item.data.id}
                    onLaunch={onLaunch}
                    onCloseApp={onCloseApp}
                    isLaunching={launchingPath === item.data.path}
                  />
                ) : (
                  <FolderItem
                    key={item.data.id}
                    item={item.data}
                    draggable={false}
                    isDragActive={false}
                    isDragging={false}
                    isSelected={selectedId === item.data.id}
                    onOpen={onOpenFolder}
                  />
                )
              )}
            </IconGrid>
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
