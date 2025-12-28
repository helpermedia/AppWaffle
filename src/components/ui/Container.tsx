import type { CSSProperties, ReactNode, Ref, MouseEventHandler } from "react";
import { cn } from "@/utils/cn";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
  "data-draggable"?: boolean;
  "data-id"?: string;
}

export function Container({
  children,
  className,
  style,
  ref,
  onClick,
  "data-draggable": dataDraggable,
  "data-id": dataId,
}: ContainerProps) {
  return (
    <div
      ref={ref}
      style={style}
      onClick={onClick}
      data-grid-item
      data-draggable={dataDraggable}
      data-id={dataId}
      className={cn(
        "w-32 h-40 p-2 rounded-xl flex flex-col items-center",
        className
      )}
    >
      {children}
    </div>
  );
}
