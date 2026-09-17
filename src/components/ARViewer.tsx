"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MenuItem } from "@/types/menu";
import ModelViewer from "./ModelViewer";
import type { ModelViewerElement } from "@/types/model-viewer";

interface ARViewerProps {
  menuItems: MenuItem[];
  restaurantName: string;
}

const glass = { background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" } as const;

export default function ARViewer({ menuItems, restaurantName }: ARViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [canAR, setCanAR] = useState<boolean | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [arStatus, setArStatus] = useState<string | null>(null);
  const viewerRef = useRef<ModelViewerElement>(null);

  const items = menuItems.filter((m) => m.photos.front);
  const current = items[currentIndex];
  const hasModel = current?.model.status === "ready" && !!current.model.url;
  const loaded = hasModel && loadedUrl === current.model.url;

  // model-viewer decides AR support once it has upgraded and loaded a model.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const onLoad = () => { setLoadedUrl(el.src); setCanAR(el.canActivateAR); };
    const onArStatus = (e: Event) => {
      const status = (e as CustomEvent<{ status: string }>).detail?.status;
      setArStatus(status === "failed" ? "AR couldn't start on this device. Try Chrome on Android or Safari on iPhone." : null);
    };
    el.addEventListener("load", onLoad);
    el.addEventListener("ar-status", onArStatus);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("ar-status", onArStatus);
    };
  }, [current?.id, hasModel]);

  const viewOnTable = useCallback(async () => {
    const el = viewerRef.current;
    if (!el) return;
    try {
      await el.activateAR();
    } catch (err) {
      setArStatus(err instanceof Error ? err.message : "AR couldn't start.");
    }
  }, []);

  const goNext = () => setCurrentIndex((i) => Math.min(i + 1, items.length - 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  if (!items.length || !current) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-white text-center p-8">
        <p className="text-xl mb-4">No menu items available yet.</p>
        <p className="text-white/50 text-sm">The restaurant hasn&apos;t added dishes yet.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "radial-gradient(120% 80% at 50% 30%, #2b2b2e 0%, #0b0b0c 70%)" }}>
      {/* 3D stage */}
      {hasModel ? (
        <ModelViewer
          key={current.model.url}
          ref={viewerRef}
          src={current.model.url}
          alt={current.name}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="fixed"
          ar-placement="floor"
          camera-controls
          touch-action="pan-y"
          auto-rotate
          rotation-per-second="15deg"
          shadow-intensity="1.2"
          shadow-softness="0.8"
          environment-image="neutral"
          exposure="1.1"
          interaction-prompt="none"
          camera-orbit="0deg 65deg 105%"
          min-camera-orbit="auto 30deg auto"
          max-camera-orbit="auto 90deg auto"
          style={{ width: "100%", height: "100%", backgroundColor: "transparent", position: "absolute", inset: 0 }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <img src={current.photos.front} alt={current.name} className="w-[260px] h-[260px] object-cover rounded-full shadow-[0_30px_60px_rgba(0,0,0,0.6)]" />
        </div>
      )}

      {/* Loading overlay while the GLB streams in */}
      {hasModel && !loaded && (
        <div className="absolute inset-0 z-[20] flex flex-col items-center justify-center pointer-events-none">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-[3px] border-white/20" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-white animate-spin" />
          </div>
          <p className="text-white/80 text-[13px] mt-3">Plating up…</p>
        </div>
      )}

      {/* Top info */}
      <div className="absolute top-[52px] left-[12px] right-[12px] rounded-[17px] p-[16px] z-[30]" style={glass}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-signifier text-[22px] text-white leading-none">{current.name}</h2>
          <span className="text-white text-[16px] font-medium shrink-0">₹{current.price}</span>
        </div>
        {current.description && <p className="text-[14px] text-white/80 leading-[1.3] mt-[8px]">{current.description}</p>}
      </div>

      {/* Bottom: AR button + nav */}
      <div className="absolute bottom-[28px] left-[12px] right-[12px] z-[30] flex flex-col gap-[10px]">
        {hasModel ? (
          <button
            onClick={viewOnTable}
            disabled={!loaded || canAR === false}
            className={`h-[54px] rounded-full flex items-center justify-center gap-2 text-[16px] font-semibold ${
              canAR === false ? "bg-white/20 text-white/60" : "bg-white text-black active:bg-white/80"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
            </svg>
            {canAR === false ? "Open on your phone to view in AR" : "View on your table"}
          </button>
        ) : (
          <div className="h-[54px] rounded-full flex items-center justify-center text-white/70 text-[14px]" style={glass}>
            {current.model.status === "queued" || current.model.status === "generating" ? "3D model is being prepared…" : "3D view coming soon"}
          </div>
        )}
        {arStatus && <p className="text-center text-[12px] text-red-300">{arStatus}</p>}

        <div className="rounded-[17px] p-[16px]" style={glass}>
          <p className="font-signifier text-[18px] text-white text-center leading-none" style={{ textDecoration: "underline", textDecorationStyle: "wavy", textUnderlineOffset: "4px" }}>
            {restaurantName} Special Menu
          </p>
          <div className="flex items-center justify-between mt-[14px]">
            <button onClick={goPrev} aria-label="Previous dish" className={currentIndex === 0 ? "opacity-30" : ""}>
              <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
                <path d="M10 1L2 8.5L10 16M2 8.5H22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex items-center gap-[12px]">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  onClick={() => setCurrentIndex(i)}
                  aria-label={it.name}
                  className={`w-[2px] rounded-full transition-all ${i === currentIndex ? "h-[19px] bg-white" : "h-[11px] bg-white/40"}`}
                />
              ))}
            </div>
            <button onClick={goNext} aria-label="Next dish" className={currentIndex === items.length - 1 ? "opacity-30" : ""}>
              <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
                <path d="M14 1L22 8.5L14 16M22 8.5H2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
