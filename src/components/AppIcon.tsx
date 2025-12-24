import { forwardRef } from "react";
import type { AppInfo } from "../types/app";
import { getIconSrc, ICON_BUTTON_CLASSES } from "../utils/iconUtils";

interface AppIconProps {
  app: AppInfo;
  index: number;
  onLaunch: (path: string) => void;
  isLaunching: boolean;
}

export const AppIcon = forwardRef<HTMLButtonElement, AppIconProps>(
  ({ app, index, onLaunch, isLaunching }, ref) => {
    const launchingClasses = isLaunching ? "scale-125 duration-150" : "";

    return (
      <button
        ref={ref}
        data-app-icon
        className={`${ICON_BUTTON_CLASSES} ${launchingClasses}`}
        onClick={() => onLaunch(app.path)}
        title={app.name}
      >
        <div className="size-16 flex items-center justify-center pointer-events-auto cursor-pointer">
          <img
            src={getIconSrc(app.icon)}
            alt={app.name}
            className="size-full object-contain drop-shadow-lg"
            draggable={false}
          />
        </div>
        <span className="text-[0.6875rem] text-white text-center line-clamp-2 drop-shadow-md h-8 leading-4">
          {index}. {app.name}
        </span>
      </button>
    );
  }
);

AppIcon.displayName = "AppIcon";
