import { useRef } from "react";

/**
 * Returns a ref that always holds the latest value.
 * Useful for accessing current props/state inside callbacks
 * without stale closures.
 */
export function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = useRef(value);
  // eslint-disable-next-line react-hooks/refs -- Intentional: writing current prop to ref during render is idempotent
  ref.current = value;
  return ref;
}
