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
        "absolute inset-1 rounded-2xl pointer-events-none z-10",
        "bg-white/20",
        "animate-pulse-glow",
        action === "create-folder" && "scale-[1.12]",
        action === "add-to-folder" && "scale-105"
      )}
    />
  );
}
