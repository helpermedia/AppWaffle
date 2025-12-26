import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getIconSrc } from "@/utils/iconUtils";
import { cn } from "@/utils/cn";
import { Container } from "@/components/ui/Container";
import { Label } from "@/components/ui/Label";
import type { FolderInfo } from "@/types/app";

export type GridFolder = FolderInfo & { id: string };

export function FolderPreview({ apps }: { apps: FolderInfo["apps"] }) {
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
    <Container
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging && "opacity-0",
        !isDragging && isDragActive && "transition-transform duration-200"
      )}
    >
      <div onClick={handleClick} {...attributes} {...listeners}>
        <FolderPreview apps={item.apps} />
      </div>
      <Label>{item.name}</Label>
    </Container>
  );
}
