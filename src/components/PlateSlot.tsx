"use client";

import { MenuItem } from "@/types/menu";

interface PlateSlotProps {
  item?: MenuItem;
  onClick: () => void;
  isEmpty?: boolean;
  showPlus?: boolean;
}

export default function PlateSlot({ item, onClick, isEmpty = false, showPlus = false }: PlateSlotProps) {
  const hasImage = item?.image;
  const hasItem = !!item;

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-[8px] w-full"
    >
      {/* Plate container */}
      <div className="relative w-[120px] h-[120px]">
        {/* Outer plate ring */}
        <div
          className={`w-full h-full rounded-full ${
            !hasItem ? "opacity-30" : ""
          }`}
          style={{
            background: hasImage
              ? "conic-gradient(from 0deg, #d4956b, #c4854b, #d4a56b, #e8c89b, #d4956b)"
              : hasItem
              ? "conic-gradient(from 0deg, #d4956b, #c4854b, #d4a56b, #e8c89b, #d4956b)"
              : "conic-gradient(from 0deg, #e0d0c0, #d0c0b0, #e0d0c0, #f0e0d0, #e0d0c0)",
            boxShadow: hasItem ? "0px 3px 2px 0px rgba(0,0,0,0.25)" : "none",
            padding: "12px",
          }}
        >
          {/* Inner plate */}
          <div
            className="w-full h-full rounded-full bg-[#f5f0eb] flex items-center justify-center overflow-hidden"
            style={{
              border: hasItem ? "2px solid #e8d8c8" : "2px solid #e8e0d8",
            }}
          >
            {hasImage ? (
              <img
                src={item.image!}
                alt={item.name}
                className="w-[85%] h-[85%] object-cover rounded-full"
              />
            ) : showPlus ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8e8e8e" strokeWidth="1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            ) : null}
          </div>
        </div>
      </div>
      {/* Label */}
      <p
        className={`text-[14px] font-medium tracking-[-0.7px] text-center leading-[17px] ${
          hasItem ? "text-[#2e2d2a]" : "text-[#8e8e8e]"
        }`}
      >
        {hasItem ? item.name : "Add Menu"}
      </p>
    </button>
  );
}
