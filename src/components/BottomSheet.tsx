"use client";

import { ReactNode, useEffect } from "react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  height?: string;
}

export default function BottomSheet({ isOpen, onClose, children, height = "auto" }: BottomSheetProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="absolute inset-0 overlay-enter"
        style={{
          background: "rgba(86, 86, 86, 0.58)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="absolute bottom-[30px] left-[12px] right-[12px] bg-[#f7f7f7] rounded-[28px] overflow-y-auto bottom-sheet-enter no-scrollbar"
        style={{ maxHeight: "calc(100vh - 60px)" }}
      >
        {children}
      </div>
    </div>
  );
}
