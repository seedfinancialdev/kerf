// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The tour (design spec §4): four tips, one at a time, each a small card beside the part of the
// Workshop it is about, shown the first time the Workshop opens and again from Learn. It never
// covers what it points at and never blocks the screen: Escape or a click elsewhere ends it.

import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useKerf, useKerfStore } from "../state/useKerf";
import { placeTip, type TipPlacement } from "./Tip";

/** One tip: the part of the Workshop it points at (its `data-tour` name), its words, and its side. */
interface TourTip {
  anchor: "steps" | "sizes" | "model" | "drawer";
  text: string;
  placement: TipPlacement;
  /** A selector for the anchor's panel, whose edge the card sits beside instead of the anchor's. */
  panel?: string;
}

/**
 * The four tips in the design spec's words (§4). Each sits where it covers nothing it talks about:
 * under the steps, left of the inspector the sizes are in (over the model), right of the model (over
 * the inspector, as the left panel is too narrow) and above the drawer.
 */
const TOUR: readonly [TourTip, ...TourTip[]] = [
  {
    anchor: "steps",
    text: "These four steps take your piece from shape to cut list.",
    placement: "below",
  },
  {
    anchor: "sizes",
    text: "Type a size, or drag its label to adjust it. Any unit works.",
    placement: "left",
    panel: ".panel",
  },
  {
    anchor: "model",
    text: "Orbit with the middle mouse button or two fingers. The tools work like SketchUp's: P to push or pull, M to move, T to measure.",
    placement: "right",
  },
  {
    anchor: "drawer",
    text: "Your shopping list, cut list, sheets and assembly steps live here, always up to date.",
    placement: "above",
  },
];

/** How far along its part of the screen the card's arrow points, from that part's start, in pixels. */
const ARROW_INSET = 20;
/** The nearest the arrow comes to the card's corners, in pixels, so it clears their rounding. */
const ARROW_CLEAR = 14;

/** Where the card is drawn: its top-left corner, and the side and offset of its arrow (none when unanchored). */
interface CardPlace {
  left: number;
  top: number;
  arrow: { side: TipPlacement; at: number } | null;
}

/** The part of the Workshop `tip` points at, if it is on screen. */
const anchorOf = (tip: TourTip): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-tour="${tip.anchor}"]`);

/**
 * Where a card of size `card` (pixels) goes for `tip`: beside its anchor, with the arrow pointing
 * a little way into it; or, when the anchor is not on screen, in the middle of the window.
 */
function placeCard(tip: TourTip, card: DOMRect): CardPlace {
  const anchor = anchorOf(tip);
  const target = anchor?.getBoundingClientRect();
  if (!target) {
    return {
      left: (window.innerWidth - card.width) / 2,
      top: (window.innerHeight - card.height) / 2,
      arrow: null,
    };
  }
  const edge = tip.panel ? anchor?.closest(tip.panel)?.getBoundingClientRect() : undefined;
  const beside = edge
    ? { left: edge.left, right: edge.right, top: target.top, bottom: target.bottom }
    : target;
  const { left, top, side } = placeTip(beside, card, tip.placement);
  const along = side === "below" || side === "above";
  const at = along ? target.left + ARROW_INSET - left : target.top + ARROW_INSET - top;
  const room = (along ? card.width : card.height) - ARROW_CLEAR;
  return { left, top, arrow: { side, at: Math.max(ARROW_CLEAR, Math.min(at, room)) } };
}

/** True when the card would be drawn where it already is. */
const samePlace = (a: CardPlace | null, b: CardPlace): boolean =>
  a !== null &&
  a.left === b.left &&
  a.top === b.top &&
  a.arrow?.side === b.arrow?.side &&
  a.arrow?.at === b.arrow?.at;

/** The tour, while it has not been seen or skipped (`toured` in the store). */
export function Tour() {
  const toured = useKerf((s) => s.toured);
  return toured ? null : <TourCard />;
}

/** The card for the tip shown, from the first; it ends the tour through the store's `finishTour`. */
function TourCard() {
  const store = useKerfStore();
  const [tip, setTip] = useState<TourTip>(TOUR[0]);
  const [place, setPlace] = useState<CardPlace | null>(null);
  const [, remeasure] = useReducer((n: number) => n + 1, 0);
  const card = useRef<HTMLDivElement>(null);
  const forward = useRef<HTMLButtonElement>(null);
  const textId = useId();
  const index = TOUR.indexOf(tip);
  const back = TOUR[index - 1];
  const next = TOUR[index + 1];
  const finish = (): void => store.getState().finishTour();

  const show = (shown: TourTip): void => {
    // The sizes are in the Shape step's panel, so their tip needs Shape on screen.
    if (shown.anchor === "sizes" && store.getState().step !== "Shape") {
      store.getState().setStep("Shape");
    }
    setTip(shown);
  };

  // Measured after every drawing of the card, so it follows its anchor; kept when nothing moved.
  useLayoutEffect(() => {
    const box = card.current?.getBoundingClientRect();
    if (!box) return;
    const placed = placeCard(tip, box);
    setPlace((was) => (samePlace(was, placed) ? was : placed));
  });

  // The anchor is described by the tip's words while it shows, so a screen reader ties them up.
  useEffect(() => {
    const target = anchorOf(tip);
    target?.setAttribute("aria-describedby", textId);
    return () => target?.removeAttribute("aria-describedby");
  }, [tip, textId]);

  // The keyboard lands on Next, so Enter walks the tour; the button stays put as it becomes Done.
  useEffect(() => forward.current?.focus(), []);

  // It never blocks the screen (§4): a click elsewhere or Escape ends it; a scroll or resize moves it.
  useEffect(() => {
    const end = (): void => store.getState().finishTour();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") end();
    };
    const onPointer = (e: PointerEvent): void => {
      if (!(e.target instanceof Node && card.current?.contains(e.target))) end();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", remeasure, true);
    window.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", remeasure, true);
      window.removeEventListener("resize", remeasure);
    };
  }, [store]);

  const style = {
    left: place?.left ?? 0,
    top: place?.top ?? 0,
    ...(place?.arrow && { "--arrow": `${place.arrow.at}px` }),
  } as CSSProperties;
  return (
    <div
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-label={`Tour, step ${index + 1} of ${TOUR.length}`}
      aria-describedby={textId}
      className="tour"
      data-arrow={place?.arrow?.side}
      style={style}
    >
      <p className="tour-count" aria-hidden="true">
        {index + 1} of {TOUR.length}
      </p>
      <p id={textId} className="tour-text">
        {tip.text}
      </p>
      <div className="tour-actions">
        <button type="button" className="quiet tour-skip" onClick={finish}>
          Skip tour
        </button>
        {back && (
          <button type="button" onClick={() => show(back)}>
            Back
          </button>
        )}
        <button
          ref={forward}
          type="button"
          className="primary"
          onClick={next ? () => show(next) : finish}
        >
          {next ? "Next" : "Done"}
        </button>
      </div>
    </div>
  );
}
