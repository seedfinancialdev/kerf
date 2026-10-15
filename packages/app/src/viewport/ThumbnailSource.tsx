// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The view's picture, offered to the download as the file's thumbnail (design spec, "Saving").

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useKerfStore } from "../state/useKerf";

/** Lets the view's picture be the saved file's thumbnail (design spec, "Saving"). */
export function ThumbnailSource() {
  const { gl } = useThree();
  const store = useKerfStore();
  useEffect(() => {
    store.getState().setThumbnailSource(
      () =>
        new Promise((resolve, reject) => {
          gl.domElement.toBlob((blob) => {
            // A download leaves the picture out and logs why (ui/save.ts); nothing here is swallowed.
            if (!blob) {
              reject(new Error("The 3D view gave no picture for the thumbnail."));
              return;
            }
            blob.arrayBuffer().then((bytes) => resolve(new Uint8Array(bytes)), reject);
          }, "image/png");
        }),
    );
    return () => store.getState().setThumbnailSource(null);
  }, [gl, store]);
  return null;
}
