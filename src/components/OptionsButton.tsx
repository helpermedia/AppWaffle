import { useConfig } from "@/hooks/useConfig";
import { showOptionsMenu } from "@/utils/optionsMenu";

/**
 * The "…" view-options button (Apps-app style), anchored to the right of
 * the search field. Opens a native menu for switching the grid layout.
 */
export function OptionsButton() {
  const { layout, setLayout } = useConfig();

  return (
    <button
      type="button"
      data-keep-open
      aria-label="View options"
      onClick={() => showOptionsMenu(layout, setLayout)}
      className="absolute left-full top-1/2 ml-2.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-lg leading-none text-white/60 transition-colors hover:bg-white/20 hover:text-white/90"
    >
      ⋯
    </button>
  );
}
