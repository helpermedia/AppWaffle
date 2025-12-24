import { useSortable } from "@dnd-kit/sortable";

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
}

export function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const transformString = transform
    ? `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${isDragging ? 1.1 : 1})`
    : isDragging
      ? "scale(1.1)"
      : undefined;

  const style: React.CSSProperties = {
    transform: transformString,
    // Use dnd-kit's default transition for shifting items
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 10 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
