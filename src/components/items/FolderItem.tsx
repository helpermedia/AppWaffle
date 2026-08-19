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

/** Preview density tiers: capacity and the grid classes that render it */
const PREVIEW_TIERS = [
  { capacity: 4, classes: "grid-cols-2 grid-rows-2" },
  { capacity: 9, classes: "grid-cols-3 grid-rows-3" },
  { capacity: 16, classes: "grid-cols-4 grid-rows-4" },
];

export function FolderPreview({ apps }: { apps: AppInfo[] }) {
  // Density follows the folder size; anything past the largest tier's
  // capacity isn't represented
  const tier =
    PREVIEW_TIERS.find((t) => apps.length <= t.capacity) ??
    PREVIEW_TIERS[PREVIEW_TIERS.length - 1];
  const previewApps = apps.slice(0, tier.capacity);

  return (
    <div
      className={cn(
        "w-24 h-24 bg-white/20 rounded-2xl p-2 grid gap-1 border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
        tier.classes
      )}
    >
      {previewApps.map((app) =>
        app.icon ? (
          <img
            key={app.path}
            src={getIconSrc(app.icon)}
            alt={app.name}
            className="w-full h-full object-contain rounded-md"
            draggable={false}
          />
        ) : (
          // Soft placeholder cell while (or if) the icon never generates —
          // the full-size skeleton SVG is near-invisible at mini scale
          <div key={app.path} className="w-full h-full rounded-md bg-white/15" />
        )
      )}
    </div>
  );
}

export function FolderItem({
  item,
  isDragActive,
  isDragging,
  dropAction,
  onOpen,
  isSelected,
}: {
  item: GridFolder;
  isDragActive: boolean;
  isDragging: boolean;
  dropAction?: DropAction;
  onOpen: (folder: GridFolder) => void;
  /** Keyboard-selection highlight */
  isSelected?: boolean;
}) {
  const handleClick = () => {
    // Only open if no drag is in progress (same guard as AppItem)
    if (!isDragActive) {
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
        isDragging && "opacity-0 pointer-events-none",
        isSelected && "bg-white/15"
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
