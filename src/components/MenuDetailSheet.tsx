"use client";

import { MenuItem } from "@/types/menu";
import BottomSheet from "./BottomSheet";

interface MenuDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onEdit: () => void;
}

export default function MenuDetailSheet({ isOpen, onClose, item, onEdit }: MenuDetailSheetProps) {
  if (!item) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="p-[16px] flex flex-col">
        {/* Image and Price row */}
        <div className="relative">
          <div className="w-[129px] h-[129px] rounded-full overflow-hidden">
            <div
              className="w-full h-full rounded-full"
              style={{
                background: "conic-gradient(from 0deg, #d4956b, #c4854b, #d4a56b, #e8c89b, #d4956b)",
                padding: "12px",
              }}
            >
              <div className="w-full h-full rounded-full bg-[#f5f0eb] flex items-center justify-center overflow-hidden border-2 border-[#e8d8c8]">
                {item.image && (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-[85%] h-[85%] object-cover rounded-full"
                  />
                )}
              </div>
            </div>
          </div>
          <p className="absolute right-0 top-[104px] text-[18px] font-medium text-[#2e2d2a] tracking-[-0.9px]">
            ₹{item.price}
          </p>
        </div>

        {/* Dish name */}
        <p className="font-signifier text-[16px] text-[#2e2d2a] mt-[16px]">
          {item.name}
        </p>

        {/* Description */}
        <p className="text-[14px] text-[#595959] leading-[1.39] mt-[8px]">
          {item.description}
        </p>

        {/* Edit button */}
        <button
          onClick={onEdit}
          className="w-full h-[56px] bg-[#060606] rounded-[17px] flex items-center justify-center mt-[16px]"
        >
          <span className="text-white text-[18px] font-medium">Edit Menu</span>
        </button>
      </div>
    </BottomSheet>
  );
}
