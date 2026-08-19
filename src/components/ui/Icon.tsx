import { useState } from "react";
import { cn } from "@/utils/cn";
import { DEFAULT_ICON, getIconSrc } from "@/utils/iconUtils";

interface IconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  icon: string | null;
  alt: string;
}

export function Icon({ icon, alt, ...props }: IconProps) {
  // Icons that arrive after mount (progressive generation) cross-fade in:
  // the skeleton stays mounted beneath the blooming artwork until the
  // reveal finishes, so no frame swaps abruptly. The animation class is
  // dropped once played so DOM clones (drag ghost) don't replay it.
  const [revealing, setRevealing] = useState(icon === null);

  return (
    <div className="relative w-24 h-24">
      {(icon === null || revealing) && (
        <img
          src={DEFAULT_ICON}
          alt=""
          className="absolute inset-0 w-24 h-24"
          draggable={false}
        />
      )}
      {icon !== null && (
        <img
          src={getIconSrc(icon)}
          alt={alt}
          className={cn("relative w-24 h-24", revealing && "animate-icon-reveal")}
          draggable={false}
          onAnimationEnd={() => setRevealing(false)}
          {...props}
        />
      )}
    </div>
  );
}
