import { useState, useRef } from "react";

/**
 * Encapsulates the close-animation guard pattern:
 * - `isClosing` state for driving CSS transitions/animations
 * - `isClosingRef` ref guard to prevent double-triggers
 * - `triggerClose()` sets both; returns false if already closing
 */
export function useCloseAnimation() {
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);

  function triggerClose() {
    if (isClosingRef.current) return false;
    isClosingRef.current = true;
    setIsClosing(true);
    return true;
  }

  return { isClosing, setIsClosing, isClosingRef, triggerClose };
}
