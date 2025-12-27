import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/utils/cn";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Label } from "@/components/ui/Label";
import { DropTarget } from "@/components/items/DropTarget";
import type { AppInfo } from "@/types/app";
import type { DropAction } from "@/hooks/useFolderCreation";

export type GridItem = AppInfo & { id: string };

export function AppItem({
  item,
  isDragActive,
  dropAction,
}: {
  item: GridItem;
  isDragActive: boolean;
  dropAction?: DropAction;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      transition: {
        duration: 200,
        easing: "ease",
      },
    });

  // Don't apply transform when this item is the folder creation target
  // This keeps the icon in place while the ring is showing
  const style = {
    transform: dropAction === "create-folder" ? undefined : CSS.Transform.toString(transform),
    transition,
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
      <DropTarget action={dropAction ?? null} />
      <Icon icon={item.icon} alt={item.name} {...attributes} {...listeners} />
      <Label>{item.name}</Label>
    </Container>
  );
}
