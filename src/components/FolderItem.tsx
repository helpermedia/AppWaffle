import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { FolderInfo } from "../types/app";
import { getIconSrc } from "../utils/iconUtils";

interface FolderItemProps {
  folder: FolderInfo;
  isDragActive: boolean;
  onOpen: (folder: FolderInfo) => void;
  debugIndex?: number;
}

export function FolderItem({ folder, isDragActive, onOpen, debugIndex }: FolderItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: folder.path,
    transition: {
      duration: 200,
      easing: "ease",
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const previewApps = folder.apps.slice(0, 4);

  const handleClick = () => {
    if (!isDragging) {
      onOpen(folder);
    }
  };

  // Only apply hover effects when not actively dragging
  const interactiveClass = isDragging
    ? "opacity-0"
    : isDragActive
      ? "transition-transform duration-200"
      : "hover:scale-105 transition-transform";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      data-grid-item
      className={`flex flex-col items-center gap-0.5 w-32 h-28 cursor-grab active:cursor-grabbing ${interactiveClass}`}
    >
      <div className="size-16 flex items-center justify-center">
        <div className="size-14 bg-white/20 backdrop-blur-sm rounded-xl p-1.5 grid grid-cols-2 gap-0.5">
          {previewApps.map((app) => (
            <img
              key={app.path}
              src={getIconSrc(app.icon)}
              alt={app.name}
              className="size-full object-contain rounded"
              draggable={false}
            />
          ))}
          {Array.from({ length: 4 - previewApps.length }).map((_, i) => (
            <div key={`empty-${i}`} className="size-full rounded bg-white/10" />
          ))}
        </div>
      </div>
      <span className="text-[0.6875rem] text-white text-center line-clamp-2 drop-shadow-md h-8 leading-4">
        {debugIndex !== undefined ? `${debugIndex}: ` : ""}{folder.name}
      </span>
    </div>
  );
}

// Overlay version - must have identical dimensions to FolderItem
export function FolderItemOverlay({ folder }: { folder: FolderInfo }) {
  const previewApps = folder.apps.slice(0, 4);

  return (
    <div className="flex flex-col items-center gap-0.5 w-32 h-28 cursor-grabbing">
      <div className="size-16 flex items-center justify-center">
        <div className="size-14 bg-white/20 backdrop-blur-sm rounded-xl p-1.5 grid grid-cols-2 gap-0.5 shadow-2xl shadow-black/50">
          {previewApps.map((app) => (
            <img
              key={app.path}
              src={getIconSrc(app.icon)}
              alt={app.name}
              className="size-full object-contain rounded"
              draggable={false}
            />
          ))}
          {Array.from({ length: 4 - previewApps.length }).map((_, i) => (
            <div key={`empty-${i}`} className="size-full rounded bg-white/10" />
          ))}
        </div>
      </div>
      <span className="text-[0.6875rem] text-white text-center line-clamp-2 drop-shadow-md h-8 leading-4">
        {folder.name}
      </span>
    </div>
  );
}
