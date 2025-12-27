import type { CSSProperties, ReactNode, Ref } from "react";
import { cn } from "@/utils/cn";

interface ContainerProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

export function Container({ children, className, style, ref }: ContainerProps) {
  return (
    <div
      ref={ref}
      style={style}
      data-grid-item
      className={cn(
        "w-32 h-40 p-2 rounded-xl flex flex-col items-center",
        className
      )}
    >
      {children}
    </div>
  );
}
