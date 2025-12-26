import { getIconSrc } from "@/utils/iconUtils";

interface IconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  icon: string | null;
  alt: string;
}

export function Icon({ icon, alt, ...props }: IconProps) {
  return (
    <img
      src={getIconSrc(icon)}
      alt={alt}
      className="w-24 h-24"
      draggable={false}
      {...props}
    />
  );
}
