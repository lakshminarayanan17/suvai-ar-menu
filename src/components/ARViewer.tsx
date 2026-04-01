"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MenuItem } from "@/types/menu";
import { generatePlateGLBFromUrl } from "@/lib/glb-generator-client";

interface ARViewerProps {
  menuItems: MenuItem[];
  restaurantName: string;
}

export default function ARViewer({ menuItems, restaurantName }: ARViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modelViewerReady, setModelViewerReady] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mvRef = useRef<HTMLElement | null>(null);
  const validItems = menuItems.filter((m) => m.image);
  const currentItem = validItems[currentIndex];

  // Load model-viewer script from CDN
  useEffect(() => {
    if (customElements.get("model-viewer")) {
      setModelViewerReady(true);
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src =
      "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    script.onload = () => {
      // Wait for custom element to register
      customElements.whenDefined("model-viewer").then(() => {
        setModelViewerReady(true);
      });
    };
    document.head.appendChild(script);
  }, []);

  // Create model-viewer element imperatively (avoids React custom element issues)
  useEffect(() => {
    if (!modelViewerReady || !containerRef.current) return;

    // Only create once
    if (mvRef.current) return;

    const mv = document.createElement("model-viewer");
    mv.setAttribute("camera-controls", "");
    mv.setAttribute("auto-rotate", "");
    mv.setAttribute("ar", "");
    mv.setAttribute("ar-modes", "webxr scene-viewer quick-look");
    mv.setAttribute("ar-scale", "auto");
    mv.setAttribute("shadow-intensity", "1.2");
    mv.setAttribute("shadow-softness", "0.8");
    mv.setAttribute("environment-image", "neutral");
    mv.setAttribute("exposure", "1.1");
    mv.setAttribute("camera-orbit", "0deg 65deg auto");
    mv.setAttribute("min-camera-orbit", "auto auto auto");
    mv.setAttribute("max-camera-orbit", "auto auto auto");
    mv.setAttribute("field-of-view", "auto");
    mv.setAttribute("interaction-prompt", "none");
    mv.setAttribute("loading", "eager");
    mv.setAttribute("reveal", "auto");
    mv.style.cssText =
      "width:100%;height:100%;position:absolute;inset:0;background:#1a1a1a;z-index:10;";

    containerRef.current.insertBefore(
      mv,
      containerRef.current.firstChild
    );
    mvRef.current = mv;

    return () => {
      if (mv.parentNode) mv.parentNode.removeChild(mv);
      mvRef.current = null;
    };
  }, [modelViewerReady]);

  // Update model-viewer src when modelUrl changes or element is created
  useEffect(() => {
    if (mvRef.current && modelUrl) {
      mvRef.current.setAttribute("src", modelUrl);
      mvRef.current.setAttribute("alt", currentItem?.name || "Dish");
    }
  }, [modelUrl, currentItem?.name, modelViewerReady]);

  // Generate GLB client-side whenever the current item changes
  const generateModel = useCallback(async (item: MenuItem) => {
    if (!item.image) return;
    setGenerating(true);
    try {
      const url = await generatePlateGLBFromUrl(item.image);
      setModelUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      console.error("GLB generation failed:", err);
    } finally {
      setGenerating(false);
    }
  }, []);

  useEffect(() => {
    if (currentItem) {
      generateModel(currentItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, currentItem?.id]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      setModelUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const goNext = () => {
    if (currentIndex < validItems.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  if (!validItems.length) {
    return (
      <div className="h-full flex items-center justify-center bg-black text-white text-center p-8">
        <p>No menu items available yet.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#1a1a1a] overflow-hidden"
    >
      {/* model-viewer is inserted here imperatively */}

      {/* Loading state */}
      {(!modelViewerReady || generating || !modelUrl) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1a] z-[5]">
          <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin mb-4" />
          <p className="text-white/70 text-sm">
            {generating ? "Generating 3D model..." : "Loading viewer..."}
          </p>
        </div>
      )}

      {/* Top info card */}
      <div
        className="absolute top-[87px] left-[12px] right-[12px] rounded-[17px] overflow-hidden p-[16px] z-[20]"
        style={{
          background: "rgba(70, 70, 70, 0.36)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <h2 className="font-signifier text-[24px] text-[#f5f5f5] leading-none">
          {currentItem?.name}
        </h2>
        <p className="text-[16px] text-[rgba(255,255,255,0.91)] leading-[1.27] tracking-[-0.32px] mt-[12px]">
          {currentItem?.description}
        </p>
      </div>

      {/* Bottom navigation card */}
      <div
        className="absolute bottom-[51px] left-[12px] right-[12px] rounded-[17px] overflow-hidden p-[18px] z-[20]"
        style={{
          background: "rgba(70, 70, 70, 0.36)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <p
          className="font-signifier text-[24px] text-[#f5f5f5] text-center tracking-[-0.48px] leading-none"
          style={{
            textDecoration: "underline",
            textDecorationStyle: "wavy",
            textUnderlineOffset: "4px",
          }}
        >
          {restaurantName} Special Menu
        </p>

        <div className="flex items-center justify-between mt-[20px]">
          <button
            onClick={goPrev}
            className={currentIndex === 0 ? "opacity-30" : ""}
          >
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path
                d="M10 1L2 8.5L10 16M2 8.5H22"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="flex items-center gap-[15px]">
            {validItems.map((_, i) => (
              <div
                key={i}
                className={`w-[2px] rounded-full transition-all ${
                  i === currentIndex
                    ? "h-[19px] bg-white shadow-[0px_4px_4px_rgba(0,0,0,0.25)]"
                    : "h-[11px] bg-[rgba(255,255,255,0.37)]"
                }`}
              />
            ))}
          </div>

          <button
            onClick={goNext}
            className={
              currentIndex === validItems.length - 1 ? "opacity-30" : ""
            }
          >
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path
                d="M14 1L22 8.5L14 16M22 8.5H2"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-white rounded-[100px] z-[20]" />
    </div>
  );
}
