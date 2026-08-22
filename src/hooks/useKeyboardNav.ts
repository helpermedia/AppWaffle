import { useEffect, useState } from "react";
import { useLatestRef } from "@/hooks/useLatestRef";

interface UseKeyboardNavOptions {
  /** Item ids in visual grid order (row-major) */
  ids: string[];
  /** Number of grid columns, for row jumps on ArrowUp/ArrowDown */
  columns: number;
  /** When false, key presses are ignored and no selection renders */
  enabled: boolean;
  /** Select the first item automatically whenever resetKey changes (search results) */
  autoSelectFirst?: boolean;
  /** Selection resets whenever this value changes (e.g. the search query) */
  resetKey?: unknown;
  /** Activate (launch/open) an item on Enter */
  onActivate: (id: string) => void;
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable)
  );
}

function moveIndex(current: number | null, key: string, count: number, columns: number): number {
  if (current === null) return 0;
  switch (key) {
    case "ArrowRight":
      return Math.min(current + 1, count - 1);
    case "ArrowLeft":
      return Math.max(current - 1, 0);
    case "ArrowDown": {
      const next = current + columns;
      if (next < count) return next;
      // Land on the last item when only a shorter final row is below
      const lastRow = Math.floor((count - 1) / columns);
      return Math.floor(current / columns) < lastRow ? count - 1 : current;
    }
    case "ArrowUp": {
      const next = current - columns;
      return next >= 0 ? next : current;
    }
    default:
      return current;
  }
}

/**
 * Keep the keyboard-selected item in view. The same app can render twice
 * (hidden main grid + search results), so scroll the visible instance.
 */
function scrollSelectionIntoView(id: string) {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
  for (const el of candidates) {
    if (el.checkVisibility?.() ?? el.offsetParent !== null) {
      // The paged viewport slides itself to the selection's page: overflow
      // hidden still leaves it a scroll container, and scrollIntoView's
      // minimal scroll would drag it off its page boundaries
      if (!el.closest("[data-paged-viewport]")) {
        el.scrollIntoView({ block: "nearest" });
      }
      return;
    }
  }
}

/**
 * Launchpad-style keyboard navigation over a row-major grid: arrow keys
 * move a selection highlight, Enter activates it. Listens at document
 * level so it works without any focused element; keys typed into editable
 * elements are left alone, except the search field ([data-search-input])
 * where arrows/Enter are meant for grid navigation.
 */
export function useKeyboardNav({
  ids,
  columns,
  enabled,
  autoSelectFirst = false,
  resetKey = null,
  onActivate,
}: UseKeyboardNavOptions) {
  const [selection, setSelection] = useState<{ resetKey: unknown; index: number | null }>({
    resetKey,
    index: autoSelectFirst ? 0 : null,
  });

  // Reset selection when the reset key changes (e.g. each search keystroke).
  // setState during render: React retries before commit, so no stale frame.
  if (selection.resetKey !== resetKey) {
    setSelection({ resetKey, index: autoSelectFirst ? 0 : null });
  }

  // Items can shrink under a live selection — clamp instead of losing it
  const index =
    selection.index !== null && ids.length > 0 ? Math.min(selection.index, ids.length - 1) : null;
  const selectedId = enabled && index !== null ? ids[index] : null;

  const stateRef = useLatestRef({ ids, columns, enabled, index, resetKey, onActivate });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { ids, columns, enabled, index, resetKey, onActivate } = stateRef.current;
      if (!enabled || ids.length === 0 || e.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableElement(e.target) && !e.target.hasAttribute("data-search-input")) return;

      if (e.key === "Enter") {
        if (e.repeat || index === null) return;
        e.preventDefault();
        onActivate(ids[index]);
        return;
      }

      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const next = moveIndex(index, e.key, ids.length, columns);
        setSelection({ resetKey, index: next });
        scrollSelectionIntoView(ids[next]);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [stateRef]);

  return { selectedId };
}
