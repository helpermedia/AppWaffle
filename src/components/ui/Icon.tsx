import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import { DEFAULT_ICON, getIconSrc } from "@/utils/iconUtils";

interface IconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  icon: string | null;
  alt: string;
}

/** icon-reveal animation duration plus slack, for the settle fallback */
const REVEAL_SETTLE_MS = 700;

export function Icon({ icon, alt, className, ...props }: IconProps) {
  // Icons that arrive after mount (progressive generation) cross-fade in:
  // the skeleton stays mounted beneath the blooming artwork until the
  // reveal finishes, so no frame swaps abruptly. The animation class is
  // dropped once played so DOM clones (drag ghost) don't replay it.
  const [revealing, setRevealing] = useState(icon === null);

  // Settle fallback: in a hidden subtree (the grid kept mounted with
  // display:none during search or in paged layout) animations never run,
  // so onAnimationEnd alone would leave both layers mounted all session
  // and mass-replay reveals when the subtree reappears
  useEffect(() => {
    if (icon === null || !revealing) return;
    const timer = setTimeout(() => setRevealing(false), REVEAL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [icon, revealing]);

  return (
    <div className="relative w-24 h-24">
      {(icon === null || revealing) && (
        <img
          src={DEFAULT_ICON}
          alt=""
          className={cn("absolute inset-0 w-24 h-24", className)}
          draggable={false}
        />
      )}
      {icon !== null && (
        <img
          {...props}
          src={getIconSrc(icon)}
          alt={alt}
          draggable={false}
          className={cn("relative w-24 h-24", revealing && "animate-icon-reveal", className)}
          onAnimationEnd={() => setRevealing(false)}
        />
      )}
    </div>
  );
}
