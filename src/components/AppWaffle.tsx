import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { exit } from "@tauri-apps/plugin-process";
import { useApps } from "../hooks/useApps";
import { AppGrid } from "./AppGrid";

const baseClasses =
  "fixed inset-0 flex items-start justify-center pt-20 overflow-y-auto bg-black/[0.001] cursor-default transition-all duration-400 ease-out";

export function AppWaffle() {
  const { apps, loading, loadingMessage, error } = useApps();
  const isClosingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [launchingPath, setLaunchingPath] = useState<string | null>(null);

  const closeWithAnimation = async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await exit(0);
  };

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await closeWithAnimation();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-app-icon]")) {
        await closeWithAnimation();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
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
    <div className={containerClasses}>
      <AppGrid apps={apps} onLaunch={handleLaunch} launchingPath={launchingPath} />
    </div>
  );
}
