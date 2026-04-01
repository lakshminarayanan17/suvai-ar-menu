"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MenuItem } from "@/types/menu";

interface ARViewerProps {
  menuItems: MenuItem[];
  restaurantName: string;
}

export default function ARViewer({ menuItems, restaurantName }: ARViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [modelViewerLoaded, setModelViewerLoaded] = useState(false);
  const modelViewerRef = useRef<HTMLElement>(null);
  const validItems = menuItems.filter((m) => m.image);
  const currentItem = validItems[currentIndex];

  // Load model-viewer script
  useEffect(() => {
    if (customElements.get("model-viewer")) {
      setModelViewerLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    script.onload = () => {
      setModelViewerLoaded(true);
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove — model-viewer registers a custom element globally
    };
  }, []);

  // Get the restaurant ID from the current URL path
  const getRestaurantId = useCallback(() => {
    const pathParts = window.location.pathname.split("/");
    // URL: /menu/[id]
    const menuIndex = pathParts.indexOf("menu");
    if (menuIndex !== -1 && pathParts[menuIndex + 1]) {
      return pathParts[menuIndex + 1];
    }
    return null;
  }, []);

  const getModelUrl = useCallback(
    (item: MenuItem) => {
      const restaurantId = getRestaurantId();
      if (!restaurantId) return "";
      return `/api/model/${restaurantId}?item=${encodeURIComponent(item.id)}`;
    },
    [getRestaurantId]
  );

  const goNext = () => {
    if (currentIndex < validItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const activateAR = () => {
    if (modelViewerRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (modelViewerRef.current as any).activateAR();
    }
  };

  if (!validItems.length) {
    return (
      <div className="h-full flex items-center justify-center bg-black text-white text-center p-8">
        <p>No menu items available yet.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* model-viewer — handles 3D preview + AR surface placement */}
      {modelViewerLoaded && currentItem?.image && (
        <model-viewer
          ref={modelViewerRef}
          src={getModelUrl(currentItem)}
          alt={currentItem.name}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="auto"
          camera-controls
          auto-rotate
          shadow-intensity="1"
          shadow-softness="1"
          environment-image="neutral"
          exposure="1"
          camera-orbit="0deg 65deg 2m"
          min-camera-orbit="auto auto auto"
          max-camera-orbit="auto auto auto"
          field-of-view="30deg"
          interaction-prompt="auto"
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            inset: 0,
            backgroundColor: "#1a1a1a",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ["--poster-color" as any]: "transparent",
          }}
        >
          {/* AR button styled to match app theme */}
          <button
            slot="ar-button"
            onClick={activateAR}
            style={{
              position: "absolute",
              bottom: "180px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(70, 70, 70, 0.6)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              color: "white",
              border: "none",
              borderRadius: "17px",
              padding: "14px 28px",
              fontSize: "16px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              zIndex: 10,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            View on Table
          </button>
        </model-viewer>
      )}

      {/* Loading state */}
      {!modelViewerLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-white text-lg">Loading AR viewer...</div>
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
          style={{ textDecoration: "underline", textDecorationStyle: "wavy", textUnderlineOffset: "4px" }}
        >
          {restaurantName} Special Menu
        </p>

        {/* Carousel indicators and arrows */}
        <div className="flex items-center justify-between mt-[20px]">
          {/* Left arrow */}
          <button onClick={goPrev} className={currentIndex === 0 ? "opacity-30" : ""}>
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path d="M10 1L2 8.5L10 16M2 8.5H22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Indicators */}
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

          {/* Right arrow */}
          <button onClick={goNext} className={currentIndex === validItems.length - 1 ? "opacity-30" : ""}>
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path d="M14 1L22 8.5L14 16M22 8.5H2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-white rounded-[100px] z-[20]" />
    </div>
  );
}
