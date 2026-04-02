"use client";

import { useEffect, useRef, useState } from "react";
import BottomSheet from "./BottomSheet";
import QRCode from "qrcode";
import { forceSyncToServer } from "@/lib/store";

interface QRSheetProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
}

export default function QRSheet({ isOpen, onClose, restaurantId }: QRSheetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "failed">("idle");

  useEffect(() => {
    if (isOpen) {
      // Force sync to server when QR sheet opens
      setSyncing(true);
      setSyncStatus("idle");
      forceSyncToServer().then((ok) => {
        setSyncing(false);
        setSyncStatus(ok ? "success" : "failed");
      });

      if (canvasRef.current) {
        const menuUrl = `${window.location.origin}/menu/${restaurantId}`;
        QRCode.toCanvas(canvasRef.current, menuUrl, {
          width: 168,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });
        QRCode.toDataURL(menuUrl, {
          width: 400,
          margin: 2,
        }).then((url) => setQrDataUrl(url));
      }
    }
  }, [isOpen, restaurantId]);

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
        {/* Sync status */}
        {syncing && (
          <p className="text-[13px] text-gray-500 mt-2">Syncing menu to server...</p>
        )}
        {syncStatus === "success" && (
          <p className="text-[13px] text-green-600 mt-2">Menu synced! QR is ready to share.</p>
        )}
        {syncStatus === "failed" && (
          <p className="text-[13px] text-red-500 mt-2">Sync failed. Menu may not load on other devices.</p>
        )}

        {/* QR Code */}
        <div className="mt-[24px] mb-[43px]">
          <canvas ref={canvasRef} className="rounded-[8px]" />
        </div>

        {/* Download button */}
        <button
          onClick={handleDownload}
          className="w-full h-[56px] bg-[#060606] rounded-[17px] flex items-center justify-center"
        >
          <span className="text-white text-[18px] font-medium">Download QR</span>
        </button>
      </div>
    </BottomSheet>
  );
}
