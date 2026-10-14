// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The shop checklist (Interaction spec, "4. Joinery from your shop": table saw kerf, dado stack
// max width, router with straight bits and roundover bits, hand tools for dovetails). Every change
// is checked by the engine (`shopProblem`) before it is kept.

import {
  ExpressionError,
  formatLength,
  type Len,
  parseLength,
  type ShopProfile,
  shopProblem,
} from "@kerf/core";
import { STARTER_DADO_WIDTH } from "../model/starter";
import { useKerf, useKerfStore } from "../state/useKerf";
import { NumberField } from "./NumberField";

type Tool = ShopProfile["tools"][number];

/**
 * A length typed into the card, in inches (ADR 015, rule 11: the shop card shows inches), or why
 * it is not one. Only the engine's reading errors are a reason; anything else is a fault in Kerf.
 */
function readShopLength(text: string): Len | string {
  try {
    return parseLength(text, "imperial");
  } catch (error) {
    if (error instanceof ExpressionError) return error.message;
    throw error;
  }
}

/** "1/8\", 1/4\"" → lengths, or why the first entry that is not a length was refused. */
function readBits(text: string): Len[] | string {
  const parts = text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  const out: Len[] = [];
  for (const part of parts) {
    const bit = readShopLength(part);
    if (typeof bit === "string") return `"${part}" is not a bit size; write sizes like 1/4", 1/2".`;
    out.push(bit);
  }
  return out;
}

const showBits = (bits: Len[]): string => bits.map((b) => formatLength(b, "imperial")).join(", ");

/**
 * The user's shop: blade kerf, dado stack, router bits and dovetails by hand. A change is kept
 * only when the engine accepts the whole shop; a typed value it refuses stays in its box with the
 * reason, and a refused tick is explained on the notice line.
 */
export function ShopCard() {
  const store = useKerfStore();
  const shop = useKerf((s) => s.shop);
  const tool = <T extends Tool["type"]>(type: T) =>
    shop.tools.find((t): t is Extract<Tool, { type: T }> => t.type === type);
  const dado = tool("dadoStack");
  const router = tool("router");
  const hand = tool("handTools");

  /** Keeps the shop when the engine accepts it; otherwise returns the engine's reason. */
  const save = (next: ShopProfile): string | null => {
    const problem = shopProblem(next);
    if (problem) return problem.message;
    store.getState().setShop(next);
    return null;
  };
  /** A tick has no box to show a reason under, so a refusal goes to the notice line. */
  const tick = (next: ShopProfile): void => {
    const refusal = save(next);
    if (refusal !== null) store.getState().say(refusal);
  };
  /** Saves the shop `withLength` makes from a typed length, or says why the text is not one. */
  const saveLength = (text: string, withLength: (length: Len) => ShopProfile): string | null => {
    const length = readShopLength(text);
    return typeof length === "string" ? length : save(withLength(length));
  };
  const withTool = (type: Tool["type"], replacement: Tool | undefined): ShopProfile => ({
    ...shop,
    tools: [...shop.tools.filter((t) => t.type !== type), ...(replacement ? [replacement] : [])],
  });

  return (
    <div className="shop-card">
      <NumberField
        label="Blade kerf"
        display={formatLength(shop.kerf, "imperial")}
        onSubmit={(text) => saveLength(text, (kerf) => ({ ...shop, kerf }))}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={dado !== undefined}
          onChange={(e) =>
            tick(
              withTool(
                "dadoStack",
                e.target.checked ? { type: "dadoStack", maxWidth: STARTER_DADO_WIDTH } : undefined,
              ),
            )
          }
        />
        Dado stack
      </label>
      {dado && (
        <NumberField
          label="Widest dado"
          display={formatLength(dado.maxWidth, "imperial")}
          onSubmit={(text) =>
            saveLength(text, (maxWidth) => withTool("dadoStack", { type: "dadoStack", maxWidth }))
          }
        />
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={router !== undefined}
          onChange={(e) =>
            tick(
              withTool(
                "router",
                e.target.checked
                  ? { type: "router", straightBits: [], roundoverBits: [] }
                  : undefined,
              ),
            )
          }
        />
        Router
      </label>
      {router && (
        <>
          <NumberField
            label="Straight bits"
            display={showBits(router.straightBits)}
            onSubmit={(text) => {
              const bits = readBits(text);
              return typeof bits === "string"
                ? bits
                : save(withTool("router", { ...router, straightBits: bits }));
            }}
          />
          <NumberField
            label="Roundover bits"
            display={showBits(router.roundoverBits)}
            onSubmit={(text) => {
              const bits = readBits(text);
              return typeof bits === "string"
                ? bits
                : save(withTool("router", { ...router, roundoverBits: bits }));
            }}
          />
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={hand?.dovetails === true}
          onChange={(e) =>
            tick(
              withTool(
                "handTools",
                e.target.checked ? { type: "handTools", dovetails: true } : undefined,
              ),
            )
          }
        />
        Dovetails by hand
      </label>
    </div>
  );
}
