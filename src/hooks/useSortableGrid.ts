import { useState, type Dispatch, type SetStateAction } from "react";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

interface UseSortableGridOptions {
  initialOrder: string[] | null;
  enableKeyboard?: boolean;
  onOrderChange?: (newOrder: string[]) => void;
}

interface UseSortableGridReturn {
  order: string[] | null;
  setOrder: Dispatch<SetStateAction<string[] | null>>;
  activeId: string | null;
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  resetDrag: () => void;
}

export function useSortableGrid({
  initialOrder,
  enableKeyboard = false,
  onOrderChange,
}: UseSortableGridOptions): UseSortableGridReturn {
  const [order, setOrder] = useState<string[] | null>(initialOrder);
  const [activeId, setActiveId] = useState<string | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5,
    },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });

  const sensors = useSensors(
    pointerSensor,
    ...(enableKeyboard ? [keyboardSensor] : [])
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setOrder((prev) => {
        if (!prev) return prev;
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        const newOrder = arrayMove(prev, oldIndex, newIndex);
        // Call onOrderChange outside of render cycle via microtask
        if (onOrderChange) {
          queueMicrotask(() => onOrderChange(newOrder));
        }
        return newOrder;
      });
    }
  }

  // Reset drag state without reordering (for use when other handlers consume the drop)
  function resetDrag() {
    setActiveId(null);
  }

  return {
    order,
    setOrder,
    activeId,
    sensors,
    handleDragStart,
    handleDragEnd,
    resetDrag,
  };
}
