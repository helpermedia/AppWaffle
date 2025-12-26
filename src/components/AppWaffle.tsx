import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useApps } from "../hooks/useApps";
import { getIconSrc } from "../utils/iconUtils";
import type { AppInfo } from "../types/app";

type GridItem = AppInfo & { id: string };

function SortableAppItem({
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
      {...attributes}
      {...listeners}
      className={`w-32 h-40 p-2 rounded-xl cursor-grab active:cursor-grabbing flex flex-col items-center justify-start pt-2 ${
        isDragging ? "opacity-0" : isDragActive ? "transition-transform duration-200" : ""
      }`}
    >
      <img
        src={getIconSrc(item.icon)}
        alt={item.name}
        className="w-24 h-24"
        draggable={false}
      />
      <span className="text-xs text-white mt-1 w-full text-center leading-normal line-clamp-2">
        {item.name}
      </span>
    </div>
  );
}

function AppItemOverlay({ item }: { item: GridItem }) {
  return (
    <div className="w-32 h-40 p-2 rounded-xl flex flex-col items-center justify-start pt-2 cursor-grabbing">
      <img
        src={getIconSrc(item.icon)}
        alt={item.name}
        className="w-24 h-24"
        draggable={false}
      />
      <span className="text-xs text-white mt-1 w-full text-center leading-normal line-clamp-2">
        {item.name}
      </span>
    </div>
  );
}

export function AppWaffle() {
  const { apps, loading, loadingMessage, error } = useApps();
  const [order, setOrder] = useState<string[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Initialize order once apps load
  if (order === null && apps.length > 0) {
    setOrder(apps.map((app) => app.path));
  }

  // Derive items from order + apps (icons update automatically)
  const items = useMemo(() => {
    if (!order) return [];
    const appsMap = new Map(apps.map((app) => [app.path, app]));
    return order
      .map((id) => {
        const app = appsMap.get(id);
        return app ? { ...app, id } : null;
      })
      .filter((item): item is GridItem => item !== null);
  }, [order, apps]);

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-white/70">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-20 overflow-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-7 gap-4 place-items-center max-w-7xl mx-auto">
            {items.map((item) => (
              <SortableAppItem
                key={item.id}
                item={item}
                isDragActive={activeItem !== null}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeItem && <AppItemOverlay item={activeItem} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
