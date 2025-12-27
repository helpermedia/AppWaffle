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
        "bg-white/50",
        "shadow-[0_0_24px_rgba(255,255,255,0.4)]",
        "transition-all duration-150",
        action === "create-folder" && "scale-[1.12]",
        action === "add-to-folder" && "scale-105"
      )}
    />
  );
}
