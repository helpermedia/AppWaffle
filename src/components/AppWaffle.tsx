import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGrid } from "@/hooks/useGrid";
import { useCloseAnimation } from "@/hooks/useCloseAnimation";
import { AppItem } from "@/components/items/AppItem";
import { FolderItem } from "@/components/items/FolderItem";
import { FolderModal } from "@/components/FolderModal";

export function AppWaffle() {
  const {
    items,
    activeItem,
    openFolder,
    containerRef,
    isDragging,
    activeId,
    dropTarget,
    coordinator,
    handleOpenFolder,
    handleCloseFolder,
    handleRenameFolder,
    handleFolderOrderChange,
    getOpenFolderSavedOrder,
  } = useGrid();

  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);
  const [launchingPath, setLaunchingPath] = useState<string | null>(null);
  const { isClosing, setIsClosing, isClosingRef, triggerClose } = useCloseAnimation();

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !openFolder) {
        closeApp();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFolder]);

  // Close on click outside (empty space)
  function handleBackgroundClick(e: React.MouseEvent) {
    // Don't close if folder is open, dragging, or clicking on an item
    if (openFolder || isDragging) return;
    const target = e.target as HTMLElement;
    if (!target.closest("[data-draggable]")) {
      closeApp();
    }
  }

  return (
    <div
      ref={scrollRef}
      className={`w-full h-full p-20 overflow-auto transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleBackgroundClick}
    >
      {openFolder && (
        <FolderModal
          folder={openFolder}
          savedOrder={getOpenFolderSavedOrder()}
          onOrderChange={(newOrder) => handleFolderOrderChange(openFolder.id, newOrder)}
          onRename={(newName) => handleRenameFolder(openFolder.id, newName)}
          onClose={onCloseFolder}
          onLaunch={handleLaunch}
          launchingPath={launchingPath}
          coordinator={coordinator}
        />
      )}

      <div className={openFolder ? "hidden" : undefined}>
        <div
          ref={containerRef}
          className="grid grid-cols-7 gap-4 place-items-center max-w-7xl mx-auto"
        >
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
                  onLaunch={handleLaunch}
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
                  onOpen={onOpenFolder}
                />
              );
            }
          })}
        </div>
      </div>
    </div>
  );
}
