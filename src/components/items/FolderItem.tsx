import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getIconSrc } from "@/utils/iconUtils";
import { cn } from "@/utils/cn";
import { Container } from "@/components/ui/Container";
import { Label } from "@/components/ui/Label";
import { DropTarget } from "@/components/items/DropTarget";
import type { AppInfo } from "@/types/app";
import type { DropAction } from "@/hooks/useFolderCreation";

// Unified folder type - works for both physical and virtual folders
export interface GridFolder {
  id: string;
  name: string;
  apps: AppInfo[];
}

export function FolderPreview({ apps }: { apps: AppInfo[] }) {
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

export function FolderItem({
  item,
  isDragActive,
  dropAction,
  onOpen,
}: {
  item: GridFolder;
  isDragActive: boolean;
  dropAction?: DropAction;
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
    <Container
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "opacity-0",
        !isDragging && isDragActive && "transition-transform duration-200"
      )}
    >
      <div className="relative" onClick={handleClick} {...attributes} {...listeners}>
        <DropTarget action={dropAction ?? null} />
        <FolderPreview apps={item.apps} />
      </div>
      <Label>{item.name}</Label>
    </Container>
  );
}

export function FolderItemOverlay({ item }: { item: GridFolder }) {
  return (
    <Container>
      <FolderPreview apps={item.apps} />
      <Label>{item.name}</Label>
    </Container>
  );
}
