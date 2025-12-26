import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/utils/cn";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Label } from "@/components/ui/Label";
import type { AppInfo } from "@/types/app";

export type GridItem = AppInfo & { id: string };

export function AppItem({
  item,
  isDragActive,
}: {
  item: GridItem;
  isDragActive: boolean;
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

  return (
    <Container
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging && "opacity-0",
        !isDragging && isDragActive && "transition-transform duration-200"
      )}
    >
      <Icon icon={item.icon} alt={item.name} {...attributes} {...listeners} />
      <Label>{item.name}</Label>
    </Container>
  );
}
