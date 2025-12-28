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
  isDragging,
  dropAction,
  onLaunch,
  isLaunching,
}: {
  item: GridItem;
  isDragActive: boolean;
  isDragging: boolean;
  dropAction?: DropAction;
  onLaunch?: (path: string) => void;
  isLaunching?: boolean;
}) {
  function handleClick() {
    // Only launch if not currently dragging
    if (!isDragActive && onLaunch) {
      onLaunch(item.path);
    }
  }

  return (
    <Container
      data-draggable
      data-id={item.id}
      onClick={handleClick}
      className={cn(
        "relative",
        // Transition for smooth shifting during drag
        isDragActive && "transition-transform duration-200",
        // Hide original when being dragged (ghost is visible instead)
        isDragging && "opacity-0 pointer-events-none",
        // Grow animation when launching
        isLaunching && "animate-launch-grow"
      )}
    >
      <div className="relative" data-drag-handle>
        <DropTarget action={dropAction ?? null} />
        <Icon icon={item.icon} alt={item.name} />
      </div>
      <Label>{item.name}</Label>
    </Container>
  );
}
