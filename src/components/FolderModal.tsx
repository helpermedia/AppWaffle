import { useState, useEffect, useRef } from "react";
import { AppItem, type GridItem } from "@/components/items/AppItem";
import { useDragGrid } from "@/hooks/useDragGrid";
import { type GridFolder } from "@/components/items/FolderItem";
import { cn } from "@/utils/cn";

interface FolderModalProps {
  folder: GridFolder;
  savedOrder?: string[];
  onOrderChange?: (newOrder: string[]) => void;
  onRename?: (newName: string) => void;
  onClose: () => void;
}

export function FolderModal({
  folder,
  savedOrder,
  onOrderChange,
  onRename,
  onClose,
}: FolderModalProps) {
  // Use saved order if available, otherwise use folder.apps order
  const defaultOrder = folder.apps.map((app) => app.path);
  const initialOrder = savedOrder && savedOrder.length > 0 ? savedOrder : defaultOrder;

  const { containerRef, order, isDragging, activeId } = useDragGrid({
    initialOrder,
    onOrderChange,
  });

  const [isClosing, setIsClosing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(folder.name);
  const didFocusRef = useRef(false);
  const isClosingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  function handleClose() {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
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
  const appsMap = new Map(folder.apps.map((app) => [app.path, app]));
  const items = (order ?? [])
    .map((id) => {
      const app = appsMap.get(id);
      return app ? { ...app, id } : null;
    })
    .filter((item): item is GridItem => item !== null);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  // Close on Escape (only when not editing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isEditing) {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEditing]);

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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
