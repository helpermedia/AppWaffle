import type { Ref } from "react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Block edits (e.g. mid-drag) without dropping focus */
  readOnly?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Launchpad-style search field. Stays focused so typing anywhere searches;
 * [data-search-input] tells useKeyboardNav that arrows/Enter here are grid
 * navigation, and [data-keep-open] excludes clicks from close-on-click-outside.
 */
export function SearchField({ value, onChange, readOnly, ref }: SearchFieldProps) {
  return (
    <div data-keep-open className="relative mx-auto mb-10 w-64">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.5" y2="16.5" />
      </svg>
      <input
        ref={ref}
        data-search-input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="Search"
        aria-label="Search apps"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        className="w-full select-text rounded-lg border border-white/20 bg-white/10 py-1.5 pl-9 pr-3 text-sm text-white caret-white outline-none transition-colors placeholder:text-white/50 focus:border-white/40 focus:bg-white/15"
      />
    </div>
  );
}
