"use client";

import { MenuItem } from "@/types/menu";

interface PlateSlotProps {
  item?: MenuItem;
  onClick: () => void;
  showPlus?: boolean;
}

function ModelBadge({ item }: { item: MenuItem }) {
  const { status } = item.model;
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-[4px] text-[11px] text-[#2e7d32]">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5.5L4 8L8.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        3D ready
      </span>
    );
  }
  if (status === "queued" || status === "generating") {
    return (
      <span className="inline-flex items-center gap-[5px] text-[11px] text-[#8e6a1f]">
        <span className="w-[6px] h-[6px] rounded-full bg-[#e0a52e] animate-pulse" />
        Making 3D…
      </span>
    );
  }
  if (status === "failed") {
    return <span className="text-[11px] text-[#c62828]">3D failed · tap to retry</span>;
  }
  return <span className="text-[11px] text-[#8e8e8e]">No 3D yet</span>;
}

export default function PlateSlot({ item, onClick, showPlus = false }: PlateSlotProps) {
  const hasItem = !!item;
  const photo = item?.photos.front;

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-[8px] w-full">
      {/* Plate */}
      <div className="relative w-[120px] h-[120px]">
        <div
          className={`w-full h-full rounded-full ${!hasItem ? "opacity-30" : ""}`}
          style={{
            background: hasItem
              ? "conic-gradient(from 0deg, #d4956b, #c4854b, #d4a56b, #e8c89b, #d4956b)"
              : "conic-gradient(from 0deg, #e0d0c0, #d0c0b0, #e0d0c0, #f0e0d0, #e0d0c0)",
            boxShadow: hasItem ? "0px 3px 2px 0px rgba(0,0,0,0.25)" : "none",
            padding: "12px",
          }}
        >
          <div
            className="w-full h-full rounded-full bg-[#f5f0eb] flex items-center justify-center overflow-hidden"
            style={{ border: hasItem ? "2px solid #e8d8c8" : "2px solid #e8e0d8" }}
          >
            {photo ? (
              <img src={photo} alt={item.name} className="w-[85%] h-[85%] object-cover rounded-full" />
            ) : showPlus ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8e8e8e" strokeWidth="1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            ) : null}
          </div>
        </div>
      </div>
      {/* Label + 3D status */}
      <div className="flex flex-col items-center gap-[2px]">
        <p className={`text-[14px] font-medium tracking-[-0.7px] text-center leading-[17px] ${hasItem ? "text-[#2e2d2a]" : "text-[#8e8e8e]"}`}>
          {hasItem ? item.name : "Add Menu"}
        </p>
        {item && <ModelBadge item={item} />}
      </div>
    </button>
  );
}
