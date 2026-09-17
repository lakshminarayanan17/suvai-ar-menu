"use client";

import { forwardRef, useEffect } from "react";
import type { ModelViewerElement } from "@/types/model-viewer";

type Props = React.ComponentProps<"model-viewer">;

// Registers the <model-viewer> custom element on the client, then renders it.
// The element upgrades in place once the module loads, so SSR output is harmless.
const ModelViewer = forwardRef<ModelViewerElement, Props>(function ModelViewer(props, ref) {
  useEffect(() => {
    import("@google/model-viewer");
  }, []);
  return <model-viewer ref={ref} {...props} />;
});

export default ModelViewer;
