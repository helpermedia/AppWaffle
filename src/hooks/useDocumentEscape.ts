import { useEffect } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";

/**
 * Run a handler on each discrete document-level Escape press.
 * Document-level so it works without any focused element (a fresh launch
 * focuses nothing); ignores key auto-repeat so holding Escape peels one
 * layer instead of cascading through folder-close into app-quit.
 */
export function useDocumentEscape(onEscape: () => void) {
  const onEscapeRef = useLatestRef(onEscape);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.repeat) return;
      onEscapeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onEscapeRef]);
}
