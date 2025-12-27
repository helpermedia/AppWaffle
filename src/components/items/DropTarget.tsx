import { cn } from "@/utils/cn";
import type { DropAction } from "@/hooks/useFolderCreation";

interface DropTargetProps {
  action: DropAction;
}

export function DropTarget({ action }: DropTargetProps) {
  if (!action) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 rounded-2xl pointer-events-none z-10",
        "ring-4 ring-white/60 bg-white/10",
        "transition-all duration-150",
        action === "create-folder" && "scale-110",
        action === "add-to-folder" && "scale-105"
      )}
    />
  );
}
