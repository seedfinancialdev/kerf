// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The router's bits (design spec, §1 "Your shop": "bits, by the shape they cut: roundover, chamfer,
// cove, ogee, straight, rabbeting; sizes tapped on"). The record keeps every bit; the engine reads the
// roundover and straight ones (model/shop-record.ts).

import { formatLength, type Len, type Project } from "@kerf/core";
import { useEffect, useRef, useState } from "react";
import {
  BIT_SHAPES,
  type BitShape,
  type RouterBit,
  USUAL_BIT_SIZES,
} from "../../model/shop-record";
import { ShopLengthField } from "./ShopLengthField";

/** What each shape is called on the card. A chamfer bit is sized by its 45° cut. */
const SHAPE_NAMES: Record<BitShape, string> = {
  roundover: "Roundover",
  chamfer: "Chamfer 45°",
  cove: "Cove",
  ogee: "Ogee",
  straight: "Straight",
  rabbeting: "Rabbeting",
};

const ownedSizes = (bits: readonly RouterBit[], shape: BitShape): Len[] =>
  bits.filter((b) => b.shape === shape).map((b) => b.size);

/** The bits with `bit` added, or taken off if the router has it. */
function toggled(bits: readonly RouterBit[], bit: RouterBit): RouterBit[] {
  const has = (b: RouterBit) => b.shape === bit.shape && b.size === bit.size;
  return bits.some(has) ? bits.filter((b) => !has(b)) : [...bits, bit];
}

/** The usual sizes of one shape and any others the router has, as toggles, then "+ Add a size". */
function ShapeSizes({
  shape,
  bits,
  units,
  onChange,
}: {
  shape: BitShape;
  bits: readonly RouterBit[];
  units: Project["units"];
  onChange: (bits: RouterBit[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const owned = ownedSizes(bits, shape);
  const shown = [...new Set([...USUAL_BIT_SIZES[shape], ...owned])].sort((a, b) => a - b);
  return (
    <fieldset className="bit-shape">
      <legend>{SHAPE_NAMES[shape]}</legend>
      <div className="bit-sizes">
        {shown.map((size) => (
          <button
            key={size}
            type="button"
            className="bit-size"
            aria-pressed={owned.includes(size)}
            onClick={() => onChange(toggled(bits, { shape, size }))}
          >
            {formatLength(size, units)}
          </button>
        ))}
        {!adding && (
          <button type="button" className="link-button" onClick={() => setAdding(true)}>
            + Add a size
          </button>
        )}
      </div>
      {adding && (
        <ShopLengthField
          label={`${SHAPE_NAMES[shape]} size`}
          units={units}
          notPositive="A bit must be bigger than zero."
          onLength={(size) => {
            setAdding(false);
            if (!owned.includes(size)) onChange([...bits, { shape, size }]);
          }}
          onCancel={() => setAdding(false)}
          hideLabel
          focus
        />
      )}
    </fieldset>
  );
}

/** Every shape a bit can cut, each with its sizes to tap on or off; `onChange` gets the new bit list. */
export function RouterBits({
  bits,
  units,
  onChange,
}: {
  bits: readonly RouterBit[];
  units: Project["units"];
  onChange: (bits: RouterBit[]) => void;
}) {
  return (
    <div className="router-bits">
      {BIT_SHAPES.map((shape) => (
        <ShapeSizes key={shape} shape={shape} bits={bits} units={units} onChange={onChange} />
      ))}
    </div>
  );
}

/** The bits in a line, by shape: `1/8" & 1/4" roundover, 1/2" straight`. */
function bitsLine(bits: readonly RouterBit[], units: Project["units"]): string {
  const byShape = BIT_SHAPES.map((shape) => {
    const sizes = ownedSizes(bits, shape).sort((a, b) => a - b);
    const named = sizes.map((s) => formatLength(s, units)).join(" & ");
    return sizes.length === 0 ? "" : `${named} ${shape}`;
  });
  return byShape.filter((line) => line !== "").join(", ");
}

/**
 * The router card's settings: its bits in a line and "Edit bits", which opens the bit list beside the
 * card. Escape, "Done" or a tap elsewhere closes it.
 */
export function RouterSettings({
  bits,
  units,
  onChange,
}: {
  bits: readonly RouterBit[];
  units: Project["units"];
  onChange: (bits: RouterBit[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !opener.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = (): void => {
    setOpen(false);
    opener.current?.focus();
  };
  const line = bitsLine(bits, units);

  return (
    <>
      <p className="bits-line">{line === "" ? "No bits yet" : `Bits: ${line}`}</p>
      <button
        ref={opener}
        type="button"
        className="link-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          // A click leaves the focus here, outside the panel, so Escape is heard here too.
          if (e.key === "Escape" && open) close();
        }}
      >
        Edit bits
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Router bits"
          className="bits-panel"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <RouterBits bits={bits} units={units} onChange={onChange} />
          <button type="button" className="primary" onClick={close}>
            Done
          </button>
        </div>
      )}
    </>
  );
}
