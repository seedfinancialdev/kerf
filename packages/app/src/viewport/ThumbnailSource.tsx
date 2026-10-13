// Kerf — free, open-source woodworking design tool
// Copyright (C) 2026 Kerf contributors
// SPDX-License-Identifier: GPL-3.0-only

// The view's picture, offered to Save as the file's thumbnail (design spec, "Saving").

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
        new Promise((resolve) => {
          gl.domElement.toBlob((blob) => {
            if (!blob) {
              resolve(undefined);
              return;
            }
            blob.arrayBuffer().then(
              (bytes) => resolve(new Uint8Array(bytes)),
              () => resolve(undefined),
            );
          }, "image/png");
        }),
    );
    return () => store.getState().setThumbnailSource(null);
  }, [gl, store]);
  return null;
}
