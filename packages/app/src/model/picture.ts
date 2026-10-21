// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The model's picture, for a downloaded file's thumbnail (design spec, "Saving") and a project's
// card on Home (design spec §2, "Keeping projects"). The picture is only a preview: a view that
// cannot draw one, or not in time, never holds back the work it would decorate.

/**
 * How long to wait for the view's picture, in milliseconds. A slow or stuck canvas (software
 * WebGL, a lost context) must never hold a file or a kept project back.
 */
const PICTURE_WAIT_MS = 1000;

/** Calls `take` now; a throw before it returns a promise is a failure like any other. */
function startTaking(take: () => Promise<Uint8Array>): Promise<Uint8Array> {
  try {
    return take();
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * The picture `take` draws, or null when there is no view (`take` is null), it fails, or it gives
 * nothing within `PICTURE_WAIT_MS`. `take` is called at once, so the picture is of what the view
 * shows now even if the view goes before it is ready (Ruling R17). A failure is logged, so work
 * kept without pictures is noticed. Never rejects.
 */
export function pictureInTime(
  take: (() => Promise<Uint8Array>) | null,
): Promise<Uint8Array | null> {
  if (!take) return Promise.resolve(null);
  const taking = startTaking(take);
  return new Promise<Uint8Array>((resolve, reject) => {
    const late = setTimeout(
      () => reject(new Error(`The 3D view gave no picture within ${PICTURE_WAIT_MS} ms.`)),
      PICTURE_WAIT_MS,
    );
    taking.then(
      (picture) => {
        clearTimeout(late);
        resolve(picture);
      },
      (error: unknown) => {
        clearTimeout(late);
        reject(error);
      },
    );
  }).catch((error: unknown) => {
    console.error(error);
    return null;
  });
}
