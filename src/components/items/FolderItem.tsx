import { getIconSrc } from "@/utils/iconUtils";
import { cn } from "@/utils/cn";
import { Container } from "@/components/ui/Container";
import { Label } from "@/components/ui/Label";
import { DropTarget } from "@/components/items/DropTarget";
import type { AppInfo } from "@/types/app";
import type { DropAction } from "@/hooks/useFolderCreation";

export interface GridFolder {
  id: string;
  name: string;
  apps: AppInfo[];
}

export function FolderPreview({ apps }: { apps: AppInfo[] }) {
  const previewApps = apps.slice(0, 4);

  return (
    <div className="w-24 h-24 bg-white/20 rounded-2xl p-2 grid grid-cols-2 grid-rows-2 gap-1 border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
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
  isDragging,
  dropAction,
  onOpen,
}: {
  item: GridFolder;
  isDragActive: boolean;
  isDragging: boolean;
  dropAction?: DropAction;
  onOpen: (folder: GridFolder) => void;
}) {
  const handleClick = () => {
    // Only open if not being dragged
    if (!isDragging) {
      onOpen(item);
    }
  };

  return (
    <Container
      data-draggable
      data-id={item.id}
      className={cn(
        "relative",
        // Transition for smooth shifting during drag
        isDragActive && "transition-transform duration-200",
        // Hide original when being dragged (ghost is visible instead)
        isDragging && "opacity-0 pointer-events-none"
      )}
    >
      <div className="relative" data-drag-handle onClick={handleClick}>
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
