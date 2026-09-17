"use client";

import { useEffect, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import QRCode from "qrcode";

interface QRSheetProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  readyCount: number;
  totalCount: number;
}

export default function QRSheet({ isOpen, onClose, restaurantId, readyCount, totalCount }: QRSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const menuUrl = typeof window !== "undefined" ? `${window.location.origin}/menu/${restaurantId}` : "";

  useEffect(() => {
    if (!isOpen || !canvasRef.current || !menuUrl) return;
    QRCode.toCanvas(canvasRef.current, menuUrl, { width: 168, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
    QRCode.toDataURL(menuUrl, { width: 400, margin: 2 }).then(setQrDataUrl);
  }, [isOpen, menuUrl]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.download = `suvai-qr-${restaurantId}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="p-[16px] flex flex-col items-center">
        <p className="text-[13px] text-gray-500 mt-2 text-center">
          {totalCount === 0
            ? "Add dishes first — the QR will show them as they're ready."
            : `${readyCount} of ${totalCount} dishes have a 3D model.`}
        </p>
        <div className="mt-[20px] mb-[12px]">
          <canvas ref={canvasRef} className="rounded-[8px]" />
        </div>
        <a href={menuUrl} target="_blank" rel="noreferrer" className="text-[12px] text-[#595959] underline mb-[28px] break-all text-center">
          {menuUrl}
        </a>
        <button onClick={handleDownload} className="w-full h-[56px] bg-[#060606] rounded-[17px] flex items-center justify-center">
          <span className="text-white text-[18px] font-medium">Download QR</span>
        </button>
      </div>
    </BottomSheet>
  );
}
