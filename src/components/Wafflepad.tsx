import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGrid } from "@/hooks/useGrid";
import { useConfig } from "@/hooks/useConfig";
import { useCloseAnimation } from "@/hooks/useCloseAnimation";
import { useDocumentEscape } from "@/hooks/useDocumentEscape";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import { AppItem } from "@/components/items/AppItem";
import { FolderItem, type GridFolder } from "@/components/items/FolderItem";
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
    pages,
    handlePagesChange,
    reorderPage,
    retireEmptyPages,
    pageDragHandlers,
    setActivePageEngine,
    setPagedFolderInsert,
    handleOpenFolder,
    handleCloseFolder,
    handleRenameFolder,
    handleFolderOrderChange,
    handleUngroupFolder,
    getOpenFolderSavedOrder,
  } = useGrid();

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);
  // The last press: where it landed, and whether an inline rename input
  // held focus (so the press blurred and committed it) — consumed by the
  // click handler
  const mouseDownRef = useRef<{ x: number; y: number; blursEdit: boolean } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [launchingPath, setLaunchingPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { isClosing, setIsClosing, isClosingRef, triggerClose } = useCloseAnimation();
  const { layout } = useConfig();

  // A drag inside a page engine (paged layout); the main grid's isDragging
  // can't see those, so host guards combine both. The active engine is
  // also bridged to useGrid so Dock pinning reads the right ghost.
  const [pagedDrag, setPagedDrag] = useState<PagedDragHandle | null>(null);
  const anyDragging = isDragging || pagedDrag !== null;

  function handlePagedDragChange(drag: PagedDragHandle | null) {
    setPagedDrag(drag);
    setActivePageEngine(drag ? drag.getEngine : null);
  }

  // Searching swaps the grid for a flat, ranked result list (drag disabled
  // there — reordering a filtered view would corrupt the saved order)
  const searchQuery = query.trim();
  const searchResults = searchQuery ? searchApps(items, searchQuery) : null;

  // Save scroll position when opening folder
  function onOpenFolder(folder: GridFolder) {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
    handleOpenFolder(folder);
  }

  function onUngroupFolder(folder: GridFolder) {
    handleUngroupFolder(folder.id);
  }

  // Inline folder rename (context-menu Rename): the tile swaps its label
  // for an input. The host owns the state so Escape, click-outside and
  // search focus can be guarded around it.
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  // Only the mounted input can end a rename, so an input that unmounts
  // without one (its folder removed from under it) would leave the guards
  // below wedged for the session — derive against the live items to heal
  const renamingFolderId =
    renameTargetId !== null && items.some((item) => item.data.id === renameTargetId)
      ? renameTargetId
      : null;

  function onRenameStart(folder: GridFolder) {
    setRenameTargetId(folder.id);
  }

  function onRenameEnd(folder: GridFolder, newName: string | null) {
    if (newName !== null) handleRenameFolder(folder.id, newName);
    setRenameTargetId(null);
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
    enabled: !openFolder && !anyDragging && !isClosing && !renamingFolderId,
    autoSelectFirst: searchResults !== null,
    resetKey: searchQuery,
    onActivate: handleActivate,
  });

  // Keep the search field focused so typing always searches (Launchpad
  // behavior) — on mount, whenever the folder modal closes, and when an
  // inline rename ends (its input took focus and then unmounted)
  useEffect(() => {
    if (!openFolder && !renamingFolderId) {
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [openFolder, renamingFolderId]);

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
  // so does an inline rename's input (which also stops the event at the
  // React root), an active drag cancels, a search query clears, otherwise
  // close. Tests searchQuery (not query) so layers match what's on screen —
  // whitespace-only input shows the normal grid and must not eat a press.
  useDocumentEscape(() => {
    if (openFolder || renamingFolderId || coordinator.isHandoffInProgress()) return;
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
    const press = mouseDownRef.current;
    mouseDownRef.current = null;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5) return;
    // A press that blurred an inline rename already did its job (the blur
    // committed the name): that click must not also close the launcher.
    // Read from the press, not from state — the blur's state update has
    // flushed by the time the click arrives.
    if (press?.blursEdit) return;
    const target = e.target as HTMLElement;
    if (!target.closest("[data-grid-item], [data-keep-open]")) {
      closeApp();
    }
  }

  // Clicks must not steal focus from the search field — except clicks into
  // real editable controls. While another editable (the folder modal's or
  // a tile's rename input) holds focus, the press blurs it explicitly,
  // which commits the rename, and still prevents the default: the browser
  // only moves focus for primary-button presses (a right-click must commit
  // too, before the context menu it opens can act on the folder), and its
  // default action runs after React has flushed the commit — whose effect
  // has just returned focus to the search field — and would clear it again.
  // Note: this supersedes the label-selectability affordance of icon-scoped
  // drag handles (helper-dnd README) — moot here, as body-level select-none
  // already disables label selection app-wide.
  function handleRootMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    const active = document.activeElement;
    const editableAwaitingBlur =
      (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
      !active.hasAttribute("data-search-input");
    mouseDownRef.current = { x: e.clientX, y: e.clientY, blursEdit: editableAwaitingBlur };
    if (target.closest("input, textarea")) return;
    if (editableAwaitingBlur) active.blur();
    e.preventDefault();
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
          coordinator={coordinator}
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
                    onUngroup={onUngroupFolder}
                    // Hidden in paged layout, where the page tile renders
                    // the input — a second one here would be dead weight
                    isRenaming={layout !== "paged" && renamingFolderId === item.data.id}
                    onRenameStart={onRenameStart}
                    onRenameEnd={onRenameEnd}
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
            onUngroupFolder={onUngroupFolder}
            renamingFolderId={renamingFolderId}
            onRenameStart={onRenameStart}
            onRenameEnd={onRenameEnd}
            pages={pages}
            onPagesChange={handlePagesChange}
            onPageReorder={reorderPage}
            onRetireEmptyPages={retireEmptyPages}
            onDragStateChange={handlePagedDragChange}
            dragHandlers={pageDragHandlers}
            dropTarget={dropTarget}
            coordinator={coordinator}
            registerFolderInsert={setPagedFolderInsert}
          />
        )}
      </div>
    </div>
  );
}
