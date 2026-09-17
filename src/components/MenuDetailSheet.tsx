"use client";

import { MenuItem } from "@/types/menu";
import BottomSheet from "./BottomSheet";
import ModelViewer from "./ModelViewer";

interface MenuDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onEdit: () => void;
  onGenerate: () => void;
  onDelete: () => void;
}

export default function MenuDetailSheet({ isOpen, onClose, item, onEdit, onGenerate, onDelete }: MenuDetailSheetProps) {
  if (!item) return null;
  const { model } = item;
  const busy = model.status === "queued" || model.status === "generating";

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="p-[16px] flex flex-col">
        {/* 3D preview when ready, photo otherwise */}
        <div className="relative w-full h-[240px] rounded-[20px] overflow-hidden bg-[#efece8]">
          {model.status === "ready" && model.url ? (
            <ModelViewer
              src={model.url}
              alt={item.name}
              camera-controls
              auto-rotate
              rotation-per-second="20deg"
              shadow-intensity="1"
              environment-image="neutral"
              interaction-prompt="none"
              touch-action="pan-y"
              style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
            />
          ) : (
            <img src={item.photos.front} alt={item.name} className="w-full h-full object-cover" />
          )}
          <p className="absolute right-[12px] top-[12px] bg-white/90 rounded-full px-[10px] py-[4px] text-[15px] font-medium text-[#2e2d2a] tracking-[-0.6px]">
            ₹{item.price}
          </p>
        </div>

        <p className="font-signifier text-[18px] text-[#2e2d2a] mt-[16px]">{item.name}</p>
        <p className="text-[14px] text-[#595959] leading-[1.39] mt-[6px]">{item.description}</p>

        {/* 3D status */}
        <div className="mt-[14px] rounded-[12px] bg-white border border-[#ececec] px-[12px] py-[10px] text-[13px] leading-[1.35]">
          {model.status === "ready" && <p className="text-[#2e7d32]">3D model ready — customers can place this dish on their table.</p>}
          {busy && (
            <p className="text-[#8e6a1f]">
              <span className="inline-block w-[7px] h-[7px] rounded-full bg-[#e0a52e] animate-pulse mr-[6px] align-middle" />
              {model.progress || "Generating 3D model"}… usually 1–4 minutes. You can close this.
            </p>
          )}
          {model.status === "failed" && (
            <p className="text-[#c62828]">3D generation failed{model.error ? `: ${model.error}` : ""}. Try again in a few minutes.</p>
          )}
          {model.status === "none" && <p className="text-[#595959]">No 3D model yet. Generate one from the dish photos.</p>}
        </div>

        <div className="flex gap-[10px] mt-[14px]">
          <button onClick={onEdit} className="flex-1 h-[56px] bg-white border border-[#dcdcdc] rounded-[17px] flex items-center justify-center">
            <span className="text-[#2e2d2a] text-[17px] font-medium">Edit</span>
          </button>
          <button
            onClick={onGenerate}
            disabled={busy}
            className={`flex-1 h-[56px] rounded-[17px] flex items-center justify-center ${busy ? "bg-[#ccc]" : "bg-[#060606]"}`}
          >
            <span className="text-white text-[17px] font-medium">
              {busy ? "Generating…" : model.status === "ready" ? "Regenerate 3D" : model.status === "failed" ? "Retry 3D" : "Generate 3D"}
            </span>
          </button>
        </div>
        <button onClick={onDelete} className="mt-[12px] text-[13px] text-[#c62828] self-center">Delete dish</button>
      </div>
    </BottomSheet>
  );
}
