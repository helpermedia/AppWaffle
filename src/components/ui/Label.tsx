import type { ReactNode } from "react";

interface LabelProps {
  children: ReactNode;
}

export function Label({ children }: LabelProps) {
  return (
    <span className="text-xs text-white mt-1 w-full text-center leading-normal line-clamp-2">
      {children}
    </span>
  );
}
