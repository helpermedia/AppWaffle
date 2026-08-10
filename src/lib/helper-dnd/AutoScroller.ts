import type { Point } from "./types";

interface AutoScrollerOptions {
  /** Distance from the host's edge where scrolling engages, in px (default: 80) */
  edgeSize?: number;
  /** Maximum scroll speed in px per frame (default: 16) */
  maxSpeed?: number;
}

/**
 * Edge auto-scroll for drags inside a scrollable container.
 *
 * While a drag is active, holding the pointer within `edgeSize` of the
 * scroll host's top/bottom edge scrolls it continuously, speed easing up
 * as the pointer nears the edge (vertical only — the grids scroll
 * vertically). All scrolling since drag start — auto-scroll and manual
 * wheel alike — is exposed via getScrollDelta(), and every host scroll
 * fires onScroll so the engine can re-run detection between pointer
 * events. The host's rect and scroll range are cached at start(): the
 * hot path performs no layout reads beyond scrollTop.
 */
export class AutoScroller {
  private options: Required<AutoScrollerOptions>;
  private host: HTMLElement | null = null;
  private hostRect: DOMRect | null = null;
  private maxScroll = 0;
  private startScrollTop = 0;
  private speed = 0;
  private rafId: number | null = null;

  /** Called on every host scroll so the engine can re-run detection */
  onScroll: (() => void) | null = null;

  private static DEFAULTS: Required<AutoScrollerOptions> = {
    edgeSize: 80,
    maxSpeed: 16,
  };

  constructor(options: AutoScrollerOptions = {}) {
    this.options = { ...AutoScroller.DEFAULTS, ...options };
  }

  /** Nearest scrollable ancestor (the element itself included), if any. */
  static findScrollHost(element: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = element;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      const scrollable = style.overflowY === "auto" || style.overflowY === "scroll";
      if (scrollable && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return null;
  }

  /** Begin tracking at drag start. No-op when there is nothing to scroll. */
  start(container: HTMLElement): void {
    this.host = AutoScroller.findScrollHost(container);
    if (!this.host) return;

    this.hostRect = this.host.getBoundingClientRect();
    this.maxScroll = this.host.scrollHeight - this.host.clientHeight;
    this.startScrollTop = this.host.scrollTop;
    this.speed = 0;
    this.host.addEventListener("scroll", this.handleHostScroll, { passive: true });
  }

  /** Total scroll movement since drag start (manual wheel included). */
  getScrollDelta(): number {
    return this.host ? this.host.scrollTop - this.startScrollTop : 0;
  }

  /** Update from the current pointer position; engages/disengages the loop. */
  update(pointer: Point): void {
    if (!this.host || !this.hostRect) return;

    const rect = this.hostRect;
    const { maxSpeed } = this.options;
    // Zones must never overlap: on hosts shorter than 2x edgeSize, split
    // at the midpoint so a pointer is always in at most one zone
    const edgeSize = Math.min(this.options.edgeSize, rect.height / 2);

    // Depth into each edge zone; pointers past the host's edge don't scroll
    // (leaving the folder panel means handoff, not scrolling)
    const topDepth = edgeSize - (pointer.y - rect.top);
    const bottomDepth = edgeSize - (rect.bottom - pointer.y);

    if (topDepth > 0 && pointer.y >= rect.top) {
      this.speed = -maxSpeed * Math.min(topDepth / edgeSize, 1);
    } else if (bottomDepth > 0 && pointer.y <= rect.bottom) {
      this.speed = maxSpeed * Math.min(bottomDepth / edgeSize, 1);
    } else {
      this.speed = 0;
    }

    this.ensureLoop();
  }

  /** Stop scrolling and forget the host (drag ended or cancelled). */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.host?.removeEventListener("scroll", this.handleHostScroll);
    this.host = null;
    this.hostRect = null;
    this.speed = 0;
  }

  /** Any host scroll (ours or the user's wheel) re-runs engine detection.
      Also revives a loop parked at a scroll end once scrolling frees it. */
  private handleHostScroll = (): void => {
    this.onScroll?.();
    this.ensureLoop();
  };

  private ensureLoop(): void {
    if (this.speed !== 0 && this.rafId === null) {
      this.rafId = requestAnimationFrame(this.step);
    }
  }

  private step = (): void => {
    this.rafId = null;
    if (!this.host || this.speed === 0) return;

    const before = this.host.scrollTop;
    const next = Math.max(0, Math.min(before + this.speed, this.maxScroll));
    if (next === before) return; // pinned at an end — park until scrolling frees us

    this.host.scrollTop = next; // detection follows via the scroll event

    // Defensive: scroll events dispatch async, so nothing here should be
    // able to stop() us mid-frame — but a stopped scroller must never re-arm
    if (this.host && this.speed !== 0) {
      this.rafId = requestAnimationFrame(this.step);
    }
  };
}
