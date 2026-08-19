import type { ReactNode, Ref } from "react";
import { GRID_COLUMNS, GRID_GAP } from "@/constants/grid";
import { cn } from "@/utils/cn";

interface IconGridProps {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The shared icon grid container: GRID_COLUMNS columns with GRID_GAP
 * spacing, used by the main grid, search results, folder modal and the
 * paged layout so their geometry can't drift apart.
 */
export function IconGrid({ children, className, ref }: IconGridProps) {
  return (
    <div
      ref={ref}
      className={cn("grid place-items-center", className)}
      style={{
        gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
        gap: GRID_GAP,
      }}
    >
      {children}
    </div>
  );
}
