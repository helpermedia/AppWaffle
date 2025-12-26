import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getIconSrc } from "../../utils/iconUtils";
import { cn } from "../../utils/cn";
import type { FolderInfo } from "../../types/app";

export type GridFolder = FolderInfo & { id: string };

// Shared styles for folder items (matches AppItem dimensions)
const itemStyles = {
  container: "w-32 h-40 p-2 rounded-xl flex flex-col items-center justify-start pt-2",
  label: "text-xs text-white mt-1 w-full text-center leading-normal line-clamp-2",
};

// 2x2 grid preview of folder contents
function FolderPreview({ apps }: { apps: FolderInfo["apps"] }) {
  const previewApps = apps.slice(0, 4);

  return (
    <div className="w-24 h-24 bg-white/25 rounded-2xl p-2 grid grid-cols-2 grid-rows-2 gap-1">
      {previewApps.map((app) => (
        <img
          key={app.path}
          src={getIconSrc(app.icon)}
          alt={app.name}
          className="w-full h-full object-contain rounded-md"
          draggable={false}
        />
      ))}
    </div>
  );
}

export function SortableFolderItem({
  item,
  isDragActive,
  onOpen,
}: {
  item: GridFolder;
  isDragActive: boolean;
  onOpen: (folder: GridFolder) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      transition: {
        duration: 200,
        easing: "ease",
      },
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = () => {
    if (!isDragging) {
      onOpen(item);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        itemStyles.container,
        isDragging && "opacity-0",
        !isDragging && isDragActive && "transition-transform duration-200"
      )}
    >
      <div
        onClick={handleClick}
        {...attributes}
        {...listeners}
      >
        <FolderPreview apps={item.apps} />
      </div>
      <span className={itemStyles.label}>{item.name}</span>
    </div>
  );
}

export function FolderItemOverlay({ item }: { item: GridFolder }) {
  return (
    <div className={itemStyles.container}>
      <FolderPreview apps={item.apps} />
      <span className={itemStyles.label}>{item.name}</span>
    </div>
  );
}
