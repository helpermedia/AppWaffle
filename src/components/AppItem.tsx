import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AppInfo } from "../types/app";
import { getIconSrc } from "../utils/iconUtils";

interface AppItemProps {
  app: AppInfo;
  isDragActive: boolean;
  onLaunch: (path: string) => void;
  isLaunching: boolean;
  debugIndex?: number;
}

export function AppItem({ app, isDragActive, onLaunch, isLaunching, debugIndex }: AppItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: app.path,
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
      onLaunch(app.path);
    }
  };

  // Only apply hover/launch effects when not actively dragging
  const interactiveClass = isDragging
    ? "opacity-0"
    : isDragActive
      ? "transition-transform duration-200"
      : isLaunching
        ? "scale-110 transition-transform duration-150"
        : "hover:scale-105 transition-transform";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      data-grid-item
      className={`flex flex-col items-center gap-0.5 w-32 h-28 cursor-grab active:cursor-grabbing ${interactiveClass}`}
    >
      <div className="size-16 flex items-center justify-center">
        <img
          src={getIconSrc(app.icon)}
          alt={app.name}
          className="size-full object-contain drop-shadow-lg"
          draggable={false}
        />
      </div>
      <span className="text-[0.6875rem] text-white text-center line-clamp-2 drop-shadow-md h-8 leading-4">
        {debugIndex !== undefined ? `${debugIndex}: ` : ""}{app.name}
      </span>
    </div>
  );
}

// Overlay version - must have identical dimensions to AppItem
export function AppItemOverlay({ app }: { app: AppInfo }) {
  return (
    <div className="flex flex-col items-center gap-0.5 w-32 h-28 cursor-grabbing">
      <div className="size-16 flex items-center justify-center">
        <img
          src={getIconSrc(app.icon)}
          alt={app.name}
          className="size-full object-contain drop-shadow-2xl"
          draggable={false}
        />
      </div>
      <span className="text-[0.6875rem] text-white text-center line-clamp-2 drop-shadow-md h-8 leading-4">
        {app.name}
      </span>
    </div>
  );
}
