import { useState, useRef, useEffect } from "react";
import { AppItem } from "@/components/items/AppItem";
import { useDragGrid, type DragMoveInfo } from "@/hooks/useDragGrid";
import { type GridFolder } from "@/components/items/FolderItem";
import { cn } from "@/utils/cn";
import { buildAppsMap } from "@/utils/appUtils";
import { resolveOrderToAppItems } from "@/utils/folderUtils";
import { useCloseAnimation } from "@/hooks/useCloseAnimation";
import { useDocumentEscape } from "@/hooks/useDocumentEscape";
import { useLatestRef } from "@/hooks/useLatestRef";
import type { DragCoordinator } from "@/lib/helper-dnd";

interface FolderModalProps {
  folder: GridFolder;
  /** Open with the name in edit mode, selected (for newly created folders) */
  autoEditName?: boolean;
  savedOrder?: string[];
  onOrderChange?: (newOrder: string[]) => void;
  onRename?: (newName: string) => void;
  onClose: () => void;
  onLaunch?: (path: string) => void;
  launchingPath?: string | null;
  /** Coordinator for seamless drag handoff to main grid */
  coordinator?: DragCoordinator | null;
}

export function FolderModal({
  folder,
  autoEditName = false,
  savedOrder,
  onOrderChange,
  onRename,
  onClose,
  onLaunch,
  launchingPath,
  coordinator,
}: FolderModalProps) {
  // Use saved order if available, otherwise use folder.apps order
  const defaultOrder = folder.apps.map((app) => app.path);
  const initialOrder = savedOrder && savedOrder.length > 0 ? savedOrder : defaultOrder;

  const { isClosing, triggerClose } = useCloseAnimation();
  // New folders open straight into rename mode (Launchpad behavior);
  // the input's ref callback focuses and selects the suggested name
  const [isEditing, setIsEditing] = useState(autoEditName);
  const [editValue, setEditValue] = useState(folder.name);
  const didFocusRef = useRef(false);
  const onCloseRef = useLatestRef(onClose);
  const handoffTriggeredRef = useRef(false);

  // Handle drag move - check for handoff to main grid
  const handleDragMove = (info: DragMoveInfo) => {
    if (!coordinator || handoffTriggeredRef.current) return;

    // Check if we should hand off to another grid
    const targetGridId = coordinator.checkBoundaries(info.pointer);

    if (targetGridId) {
      handoffTriggeredRef.current = true;
      // Trigger handoff - coordinator will update state and close folder
      coordinator.handoff(targetGridId, info.activeId, info.pointer);
    }
  };

  const { containerRef, order, isDragging, activeId, getEngine, cancelDrag } = useDragGrid({
    initialOrder,
    onOrderChange,
    onDragMove: handleDragMove,
  });

  // Reset handoff flag when drag ends (useEffect required — linter forbids ref writes during render)
  useEffect(() => {
    if (!isDragging) {
      handoffTriggeredRef.current = false;
    }
  }, [isDragging]);

  // Register with coordinator
  useEffect(() => {
    if (!coordinator) return;

    const engine = getEngine();
    const container = containerRef.current;

    if (engine && container) {
      coordinator.register({
        id: "folder-modal",
        engine,
        container,
      });
      coordinator.setActiveGrid("folder-modal");
    }

    return () => {
      coordinator.unregister("folder-modal");
      // If folder was the active grid, clear it
      if (coordinator.getActiveGrid() === "folder-modal") {
        coordinator.setActiveGrid(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getEngine called fresh; containerRef is stable
  }, [coordinator, containerRef]);

  function handleClose() {
    if (!triggerClose()) return;
    setTimeout(() => onCloseRef.current(), 200); // Match animation duration
  }

  function handleStartEdit() {
    didFocusRef.current = false;
    setEditValue(folder.name);
    setIsEditing(true);
  }

  function handleSaveEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename?.(trimmed);
    }
    setIsEditing(false);
  }

  function handleCancelEdit() {
    setEditValue(folder.name);
    setIsEditing(false);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleCancelEdit();
    }
  }

  // Derive items from order + folder apps
  const appsMap = buildAppsMap(folder.apps);
  const items = resolveOrderToAppItems(order ?? [], appsMap);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  // Escape closes the folder; while renaming, the input's own Escape
  // handler stops propagation before this listener sees the event.
  // Mid-drag Escape cancels the drag; mid-handoff it must do nothing.
  useDocumentEscape(() => {
    if (isEditing || coordinator?.isHandoffInProgress()) return;
    if (isDragging) {
      cancelDrag();
      return;
    }
    handleClose();
  });

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Don't close if we're clicking inside the folder content or during drag
    if (isDragging) return;
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div
      className={cn(
        "h-full flex flex-col items-center justify-center",
        isClosing ? "animate-fade-out" : "animate-fade-in"
      )}
      onClick={handleBackdropClick}
    >
      {isEditing ? (
        <input
          ref={(node) => {
            if (node && !didFocusRef.current) {
              didFocusRef.current = true;
              node.focus();
              node.select();
            }
          }}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={handleInputKeyDown}
          className={cn(
            "bg-transparent text-white text-xl font-medium text-center mb-4 drop-shadow-md",
            "border-none outline-none w-64",
            "border-b-2 border-white/50 focus:border-white",
            isClosing ? "animate-scale-out" : "animate-scale-in"
          )}
        />
      ) : (
        <h2
          onClick={handleStartEdit}
          className={cn(
            "text-white text-xl font-medium text-center mb-4 drop-shadow-md cursor-text",
            isClosing ? "animate-scale-out" : "animate-scale-in"
          )}
        >
          {folder.name}
        </h2>
      )}
      <div
        className={cn(
          "bg-white/15 backdrop-blur-xl rounded-3xl pt-8 pb-4 w-full max-w-7xl max-h-[60vh] overflow-y-auto",
          isClosing ? "animate-scale-out" : "animate-scale-in"
        )}
      >
        <div
          ref={containerRef}
          className="grid grid-cols-7 gap-4 place-items-center"
        >
          {items.map((item) => (
            <AppItem
              key={item.id}
              item={item}
              isDragActive={activeItem !== null}
              isDragging={activeId === item.id}
              onLaunch={onLaunch}
              isLaunching={launchingPath === item.path}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
