import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getIconSrc } from "../../utils/iconUtils";
import { cn } from "../../utils/cn";
import type { AppInfo } from "../../types/app";

export type GridItem = AppInfo & { id: string };

// Shared styles for app items
const itemStyles = {
  container: "w-32 h-40 p-2 rounded-xl flex flex-col items-center justify-start pt-2",
  icon: "w-24 h-24",
  label: "text-xs text-white mt-1 w-full text-center leading-normal line-clamp-2",
};

export function SortableAppItem({
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
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        itemStyles.container,
        isDragging && "opacity-0",
        !isDragging && isDragActive && "transition-transform duration-200"
      )}
    >
      <img
        src={getIconSrc(item.icon)}
        alt={item.name}
        className={itemStyles.icon}
        draggable={false}
        {...attributes}
        {...listeners}
      />
      <span className={itemStyles.label}>{item.name}</span>
    </div>
  );
}

export function AppItemOverlay({ item }: { item: GridItem }) {
  return (
    <div className={itemStyles.container}>
      <img
        src={getIconSrc(item.icon)}
        alt={item.name}
        className={itemStyles.icon}
        draggable={false}
      />
      <span className={itemStyles.label}>{item.name}</span>
    </div>
  );
}
