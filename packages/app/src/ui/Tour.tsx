// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The tour (design spec §4): four tips, one at a time, each a small card by the part of the Workshop
// it is about, shown the first time the Workshop opens and again from Learn. A card never covers its
// own part, another tip's part, or a control a tip names (Ruling R29); it sits on the model as a note
// sits on a drawing. It never blocks the screen: Escape, or a press outside both the card and the
// part it is about, ends it (Ruling R30), so the model can be orbited during its own tip.

import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { NOTHING } from "../model/selection";
import { useKerf, useKerfStore } from "../state/useKerf";
import { keptInside, placeTip, type TipPlacement } from "./Tip";

/** Where a card sits: on a side of its anchor, or inside the anchor's top-left corner. */
type CardPlacement = TipPlacement | "inside";

/** One tip: the part of the Workshop it points at (its `data-tour` name), its words, and its place. */
interface TourTip {
  anchor: "steps" | "sizes" | "model" | "drawer";
  text: string;
  placement: CardPlacement;
  /**
   * A selector for something next to the anchor the card must also stay clear of: the card is
   * placed past it, as if the anchor reached across it toward the card's side.
   */
  clear?: string;
}

/**
 * The four tips in the design spec's words (§4), placed by Ruling R29: under the steps and past the
 * hint line; left of the inspector the sizes are in; inside the model's top-left corner, clear of
 * the sizes; and in the model's bottom-left corner above the tool row, pointing down at the drawer.
 */
const TOUR: readonly [TourTip, ...TourTip[]] = [
  {
    anchor: "steps",
    text: "These four steps take your piece from shape to cut list.",
    placement: "below",
    clear: ".hint",
  },
  {
    anchor: "sizes",
    text: "Type a size, or drag its label to adjust it. Any unit works.",
    placement: "left",
    clear: ".panel-right",
  },
  {
    anchor: "model",
    text: "Orbit with the middle mouse button or two fingers. The tools work like SketchUp's: P to push or pull, M to move, T to measure.",
    placement: "inside",
  },
  {
    anchor: "drawer",
    text: "Your shopping list, cut list, sheets and assembly steps live here, always up to date.",
    placement: "above",
    clear: ".tool-row",
  },
];

/**
 * How far in a card sits from its anchor's start when above or below it, and from the anchor's
 * corner when inside it, in pixels.
 */
const INSET = 16;
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

/** `target` reaching across `clear` along the axis a card placed `placement` is laid out on. */
function reaching(target: DOMRect, clear: DOMRect | undefined, placement: TipPlacement) {
  const box = { left: target.left, right: target.right, top: target.top, bottom: target.bottom };
  if (!clear) return box;
  if (placement === "left" || placement === "right") {
    return {
      ...box,
      left: Math.min(box.left, clear.left),
      right: Math.max(box.right, clear.right),
    };
  }
  return { ...box, top: Math.min(box.top, clear.top), bottom: Math.max(box.bottom, clear.bottom) };
}

/**
 * Where a card of size `card` (pixels) goes for `tip`: by its anchor, with the arrow pointing a
 * little way into it; inside the anchor, with no arrow; or, when the anchor is not on screen, in
 * the middle of the window.
 */
function placeCard(tip: TourTip, card: DOMRect): CardPlace {
  const target = anchorOf(tip)?.getBoundingClientRect();
  if (!target) {
    return {
      left: (window.innerWidth - card.width) / 2,
      top: (window.innerHeight - card.height) / 2,
      arrow: null,
    };
  }
  if (tip.placement === "inside") {
    return {
      left: keptInside(target.left + INSET, card.width, window.innerWidth),
      top: keptInside(target.top + INSET, card.height, window.innerHeight),
      arrow: null,
    };
  }
  const clear = tip.clear ? document.querySelector(tip.clear)?.getBoundingClientRect() : undefined;
  const box = reaching(target, clear, tip.placement);
  const stacked = tip.placement === "below" || tip.placement === "above";
  const { left, top, side } = placeTip(
    stacked ? { ...box, left: box.left + INSET } : box,
    card,
    tip.placement,
  );
  const level = side === "below" || side === "above";
  const at = level ? target.left + ARROW_INSET - left : target.top + ARROW_INSET - top;
  const room = (level ? card.width : card.height) - ARROW_CLEAR;
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

/**
 * Puts the overall sizes on screen for their tip (Ruling R31): they are in the Shape step's panel,
 * which picked boards replace, under a Size section that may have been closed.
 */
function useBringOutSizes(): () => void {
  const store = useKerfStore();
  return () => {
    const { step, selection, sections, setStep, select, toggleSection } = store.getState();
    if (step !== "Shape") setStep("Shape");
    if (selection.kind === "boards") select(NOTHING);
    if (sections.Size === false) toggleSection("Size");
  };
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
  const bringOutSizes = useBringOutSizes();

  const show = (shown: TourTip): void => {
    if (shown.anchor === "sizes") bringOutSizes();
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
  // At the end it goes back where it was (Settings, when started there), unless a press on the page
  // has since put it somewhere else.
  useEffect(() => {
    const before = document.activeElement;
    forward.current?.focus();
    return () => {
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && before instanceof HTMLElement && before !== document.body && before.isConnected) {
        before.focus();
      }
    };
  }, []);

  // It never blocks the screen (§4): Escape or a press outside the card and the tip's own part ends
  // it (Ruling R30); a scroll or resize moves it.
  useEffect(() => {
    const end = (): void => store.getState().finishTour();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") end();
    };
    const onPointer = (e: PointerEvent): void => {
      const on = e.target instanceof Node ? e.target : null;
      if (!(card.current?.contains(on) || anchorOf(tip)?.contains(on))) end();
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
  }, [store, tip]);

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
