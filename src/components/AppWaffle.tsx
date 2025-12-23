import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApps } from "../hooks/useApps";
import { AppGrid } from "./AppGrid";
import { FolderModal } from "./FolderModal";
import type { FolderInfo } from "../types/app";

const baseClasses =
  "fixed inset-0 flex items-start justify-center pt-20 overflow-y-auto bg-black/[0.001] cursor-default transition-all duration-400 ease-out";

export function AppWaffle() {
  const { apps, folders, loading, loadingMessage, error } = useApps();
  const isClosingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [launchingPath, setLaunchingPath] = useState<string | null>(null);
  const [openFolder, setOpenFolder] = useState<FolderInfo | null>(null);

  const closeWithAnimation = async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await exit(0);
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't close app when folder modal is open - let it handle Escape
      if (e.key === "Escape" && !openFolder) {
        await closeWithAnimation();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFolder]);

  useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      // Don't close when clicking inside folder modal or app icons
      const target = e.target as HTMLElement;
      if (!target.closest("[data-app-icon]")) {
        if (openFolder) {
          setOpenFolder(null);
        } else {
          await closeWithAnimation();
        }
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [openFolder]);

  // Close when window loses focus (e.g., clicking dock or switching apps)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) {
        closeWithAnimation();
      }
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  const handleLaunch = async (path: string) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    try {
      invoke("launch_app", { path });
      setLaunchingPath(path);
      await new Promise((resolve) => setTimeout(resolve, 150));
      setIsClosing(true);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await exit(0);
    } catch (e) {
      console.error("Failed to launch app:", e);
    }
  };

  const handleOpenFolder = (folder: FolderInfo) => {
    setOpenFolder(folder);
  };

  const handleCloseFolder = () => {
    setOpenFolder(null);
  };

  const containerClasses = `${baseClasses} ${isClosing ? "opacity-0 scale-95" : "opacity-100 scale-100"}`;

  if (loading) {
    return (
      <div className={containerClasses}>
        <p className="text-white text-lg drop-shadow-md p-5">{loadingMessage}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerClasses}>
        <p className="text-red-400 text-lg drop-shadow-md p-5">Error: {error}</p>
      </div>
    );
  }

  return (
    <>
      <div className={containerClasses}>
        <AppGrid
          apps={apps}
          folders={folders}
          onLaunch={handleLaunch}
          onOpenFolder={handleOpenFolder}
          launchingPath={launchingPath}
        />
      </div>
      {openFolder && (
        <FolderModal
          folder={openFolder}
          onClose={handleCloseFolder}
          onLaunch={handleLaunch}
          launchingPath={launchingPath}
        />
      )}
    </>
  );
}
