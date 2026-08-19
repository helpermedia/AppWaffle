import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGrid } from "@/hooks/useGrid";
import { useConfig } from "@/hooks/useConfig";
import { useCloseAnimation } from "@/hooks/useCloseAnimation";
import { useDocumentEscape } from "@/hooks/useDocumentEscape";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import { AppItem } from "@/components/items/AppItem";
import { FolderItem } from "@/components/items/FolderItem";
import { FolderModal } from "@/components/FolderModal";
import { OptionsButton } from "@/components/OptionsButton";
import { PagedGrid, type PagedDragHandle } from "@/components/PagedGrid";
import { SearchField } from "@/components/SearchField";
import { IconGrid } from "@/components/ui/IconGrid";
import { GRID_COLUMNS } from "@/constants/grid";
import { cn } from "@/utils/cn";
import { searchApps } from "@/utils/searchUtils";

export function Wafflepad() {
  const {
    items,
    activeItem,
    openFolder,
    newFolderId,
    containerRef,
    isDragging,
    activeId,
    cancelDrag,
    dropTarget,
    coordinator,
    handleMainOrderChange,
    handleOpenFolder,
    handleCloseFolder,
    handleRenameFolder,
    handleFolderOrderChange,
    getOpenFolderSavedOrder,
  } = useGrid();

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [launchingPath, setLaunchingPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { isClosing, setIsClosing, isClosingRef, triggerClose } = useCloseAnimation();
  const { layout } = useConfig();

  // A drag inside a page engine (paged layout); the main grid's isDragging
  // can't see those, so host guards combine both
  const [pagedDrag, setPagedDrag] = useState<PagedDragHandle | null>(null);
  const anyDragging = isDragging || pagedDrag !== null;

  // Searching swaps the grid for a flat, ranked result list (drag disabled
  // there — reordering a filtered view would corrupt the saved order)
  const searchQuery = query.trim();
  const searchResults = searchQuery ? searchApps(items, searchQuery) : null;

  // Save scroll position when opening folder
  function onOpenFolder(folder: Parameters<typeof handleOpenFolder>[0]) {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    handleOpenFolder(folder);
  }

  // Restore scroll position when closing folder
  function onCloseFolder() {
    handleCloseFolder();
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = savedScrollTop.current;
      }
    });
  }

  // Unified close with fade-out animation
  const CLOSE_ANIMATION_MS = 300;

  function closeApp() {
    if (!triggerClose()) return;
    invoke("quit_after_delay", { delayMs: CLOSE_ANIMATION_MS });
  }

  function handleLaunch(path: string) {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    // Launch app immediately
    invoke("launch_app", { path });
    setLaunchingPath(path);

    // Show pulse effect first, then fade out
    setTimeout(() => setIsClosing(true), 600);

    // Close after pulse + fade-out
    invoke("quit_after_delay", { delayMs: 900 });
  }

  function handleActivate(id: string) {
    if (searchResults) {
      const app = searchResults.find((a) => a.id === id);
      if (app) handleLaunch(app.path);
      return;
    }
    const item = items.find((i) => i.data.id === id);
    if (!item) return;
    if (item.type === "app") {
      handleLaunch(item.data.path);
    } else {
      onOpenFolder(item.data);
    }
  }

  const navigableIds = searchResults
    ? searchResults.map((app) => app.id)
    : items.map((item) => item.data.id);

  const { selectedId } = useKeyboardNav({
    ids: navigableIds,
    columns: GRID_COLUMNS,
    enabled: !openFolder && !anyDragging && !isClosing,
    autoSelectFirst: searchResults !== null,
    resetKey: searchQuery,
    onActivate: handleActivate,
  });

  // Keep the search field focused so typing always searches (Launchpad
  // behavior) — on mount and whenever the folder modal closes
  useEffect(() => {
    if (!openFolder) {
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [openFolder]);

  const searchScrollTop = useRef(0);
  const wasSearchingRef = useRef(false);

  // Entering search saves the grid scroll position and starts results at
  // the top (again on each keystroke); leaving search restores the grid
  // position — mirrors the folder open/close flow
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (searchQuery) {
      if (!wasSearchingRef.current) searchScrollTop.current = el.scrollTop;
      el.scrollTop = 0;
    } else if (wasSearchingRef.current) {
      el.scrollTop = searchScrollTop.current;
    }
    wasSearchingRef.current = searchQuery !== "";
  }, [searchQuery]);

  // Escape peels one layer per press: the folder modal owns it while open,
  // an active drag cancels, a search query clears, otherwise close.
  // Tests searchQuery (not query) so layers match what's on screen —
  // whitespace-only input shows the normal grid and must not eat a press.
  useDocumentEscape(() => {
    if (openFolder || coordinator.isHandoffInProgress()) return;
    if (anyDragging) {
      cancelDrag();
      pagedDrag?.cancel();
      return;
    }
    if (searchQuery) {
      setQuery("");
      return;
    }
    closeApp();
  });

  // Close on click outside (empty space)
  function handleBackgroundClick(e: React.MouseEvent) {
    // Don't close if folder is open, dragging, or clicking on an item
    if (openFolder || anyDragging) return;
    // A press that traveled isn't a click: a drag can release as a click
    // on the common ancestor of press and release — the background — and
    // must not quit the launcher. Consumed on read so a click with no
    // fresh press can't compare against a stale one.
    const start = mouseDownPos.current;
    mouseDownPos.current = null;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
    const target = e.target as HTMLElement;
    if (!target.closest("[data-grid-item], [data-keep-open]")) {
      closeApp();
    }
  }

  // Clicks must not steal focus from the search field — except clicks into
  // real editable controls, or while another editable (the folder rename
  // input) holds focus: it commits on blur, so the click-away must be
  // allowed to blur it or the rename would be lost.
  // Note: this supersedes the label-selectability affordance of icon-scoped
  // drag handles (helper-dnd README) — moot here, as body-level select-none
  // already disables label selection app-wide.
  function handleRootMouseDown(e: React.MouseEvent) {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    const active = document.activeElement;
    const editableAwaitingBlur =
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
      !active.hasAttribute("data-search-input");
    if (!editableAwaitingBlur) {
      e.preventDefault();
    }
  }

  return (
    <div
      ref={scrollRef}
      className={`w-full h-full p-20 overflow-auto transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleBackgroundClick}
      onMouseDown={handleRootMouseDown}
    >
      {openFolder && (
        <FolderModal
          key={openFolder.id}
          folder={openFolder}
          autoEditName={openFolder.id === newFolderId}
          savedOrder={getOpenFolderSavedOrder()}
          onOrderChange={(newOrder) => handleFolderOrderChange(openFolder.id, newOrder)}
          onRename={(newName) => handleRenameFolder(openFolder.id, newName)}
          onClose={onCloseFolder}
          onLaunch={handleLaunch}
          onCloseApp={closeApp}
          launchingPath={launchingPath}
          // No drag handoff to the main grid in paged layout: that grid is
          // display:none there, so a drag-out would land on 0x0 rects and
          // persist an arbitrary position. In-folder reordering still works.
          coordinator={layout === "paged" ? null : coordinator}
        />
      )}

      <div
        className={cn(
          openFolder && "hidden",
          // Paged mode fills the viewport: pages size themselves to it
          !openFolder && layout === "paged" && !searchResults && "h-full flex flex-col"
        )}
      >
        <SearchField
          ref={searchInputRef}
          value={query}
          onChange={setQuery}
          readOnly={anyDragging}
        >
          <OptionsButton />
        </SearchField>

        {searchResults &&
          (searchResults.length > 0 ? (
            <IconGrid className="max-w-7xl mx-auto">
              {searchResults.map((app) => (
                <AppItem
                  key={app.id}
                  item={app}
                  draggable={false}
                  isDragActive={false}
                  isDragging={false}
                  isSelected={selectedId === app.id}
                  onLaunch={handleLaunch}
                  onCloseApp={closeApp}
                  isLaunching={launchingPath === app.path}
                />
              ))}
            </IconGrid>
          ) : (
            <p data-keep-open className="mt-24 text-center text-2xl text-white/50">
              No Results
            </p>
          ))}

        {/* Kept mounted (hidden) during search and in paged layout so the
            drag engine's DOM, scroll position and icon state survive */}
        <div className={searchResults || layout === "paged" ? "hidden" : undefined}>
          <IconGrid ref={containerRef} className="max-w-7xl mx-auto">
            {items.map((item) => {
              const isDropTarget = dropTarget?.id === item.data.id;
              const dropAction = isDropTarget ? dropTarget.action : undefined;

              if (item.type === "app") {
                return (
                  <AppItem
                    key={item.data.id}
                    item={item.data}
                    isDragActive={activeItem !== null}
                    isDragging={activeId === item.data.id}
                    dropAction={dropAction}
                    isSelected={selectedId === item.data.id}
                    onLaunch={handleLaunch}
                    onCloseApp={closeApp}
                    isLaunching={launchingPath === item.data.path}
                  />
                );
              } else {
                return (
                  <FolderItem
                    key={item.data.id}
                    item={item.data}
                    isDragActive={activeItem !== null}
                    isDragging={activeId === item.data.id}
                    dropAction={dropAction}
                    isSelected={selectedId === item.data.id}
                    onOpen={onOpenFolder}
                  />
                );
              }
            })}
          </IconGrid>
        </div>

        {layout === "paged" && (
          <PagedGrid
            items={items}
            selectedId={selectedId}
            launchingPath={launchingPath}
            hidden={searchResults !== null || openFolder !== null}
            onLaunch={handleLaunch}
            onCloseApp={closeApp}
            onOpenFolder={onOpenFolder}
            onOrderChange={handleMainOrderChange}
            onDragStateChange={setPagedDrag}
          />
        )}
      </div>
    </div>
  );
}
