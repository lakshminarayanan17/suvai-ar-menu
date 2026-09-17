"use client";

import { useState, useRef } from "react";
import { MenuItem, DishPhotos, PhotoView, PHOTO_VIEWS } from "@/types/menu";
import { fileToResizedDataUrl } from "@/lib/store";
import BottomSheet from "./BottomSheet";

export interface MenuFormData {
  name: string;
  price: number;
  description: string;
  photos: DishPhotos; // data URLs for new photos, https URLs for kept ones
}

interface MenuFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: MenuFormData) => Promise<void>;
  editItem?: MenuItem | null;
}

const VIEW_LABEL: Record<PhotoView, string> = { front: "Front", back: "Back", left: "Left", right: "Right" };

export default function MenuFormSheet({ isOpen, onClose, onSubmit, editItem }: MenuFormSheetProps) {
  // BottomSheet unmounts its children when closed, so the form remounts with
  // fresh state on every open — keyed by the item so edit → add never leaks values.
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <MenuForm key={editItem?.id ?? "new"} editItem={editItem} onSubmit={onSubmit} />
    </BottomSheet>
  );
}

function MenuForm({ editItem, onSubmit }: { editItem?: MenuItem | null; onSubmit: (data: MenuFormData) => Promise<void> }) {
  const [name, setName] = useState(editItem?.name ?? "");
  const [price, setPrice] = useState(editItem ? editItem.price.toString() : "");
  const [description, setDescription] = useState(editItem?.description ?? "");
  const [photos, setPhotos] = useState<Partial<DishPhotos>>(editItem ? { ...editItem.photos } : {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingViewRef = useRef<PhotoView>("front");
  const isEdit = !!editItem;

  const pickPhoto = (view: PhotoView) => {
    pendingViewRef.current = view;
    fileInputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setPhotos((prev) => ({ ...prev, [pendingViewRef.current]: dataUrl }));
    } catch {
      setError("Couldn't read that photo. Try another one.");
    }
  };

  const removePhoto = (view: PhotoView) => {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[view];
      return next;
    });
  };

  const canSubmit = !!photos.front && name.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit || !photos.front) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        price: parseFloat(price) || 0,
        description: description.trim(),
        photos: { front: photos.front, back: photos.back, left: photos.left, right: photos.right },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="p-[16px] flex flex-col gap-[24px]">
      {/* Photos by view — front drives the 3D model, the rest refine its sides */}
      <div className="flex flex-col gap-[10px]">
        <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">Photos</label>
        <p className="text-[12px] text-[#8e8e8e] leading-[1.35] -mt-[4px]">
          Front photo is required. Add back, left and right views of the same plate for a more accurate 3D dish.
        </p>
        <div className="flex gap-[10px]">
          {PHOTO_VIEWS.map((view) => {
            const src = photos[view];
            const required = view === "front";
            return (
              <div key={view} className="flex flex-col items-center gap-[6px] flex-1 min-w-0">
                <div className="relative w-full aspect-square max-w-[76px]">
                  {src ? (
                    <>
                      <button type="button" onClick={() => pickPhoto(view)} className="w-full h-full rounded-[12px] overflow-hidden border border-[#e0e0e0]">
                        <img src={src} alt={`${VIEW_LABEL[view]} view`} className="w-full h-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(view)}
                        aria-label={`Remove ${VIEW_LABEL[view]} photo`}
                        className="absolute -top-[6px] -right-[6px] w-[20px] h-[20px] bg-black rounded-full flex items-center justify-center"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pickPhoto(view)}
                      className={`w-full h-full rounded-[12px] border-2 border-dashed flex items-center justify-center active:bg-[#f5f5f5] ${
                        required ? "border-[#2e2d2a]/40" : "border-[#d0d0d0]"
                      }`}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5V19M5 12H19" stroke={required ? "#2e2d2a" : "#999"} strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
                <span className={`text-[11px] tracking-[-0.2px] ${required ? "text-[#2e2d2a] font-medium" : "text-[#8e8e8e]"}`}>
                  {VIEW_LABEL[view]}{required ? " *" : ""}
                </span>
              </div>
            );
          })}
        </div>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFile} className="hidden" />
      </div>

      {/* Dish Name */}
      <div className="flex flex-col gap-[12px]">
        <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">Dish Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter dish name"
          className="w-full bg-[#f1f1f1] rounded-[9px] p-[10px] text-[14px] text-[#2e2d2a] tracking-[-0.7px] outline-none placeholder:text-[#595959]"
        />
      </div>

      {/* Price */}
      <div className="flex flex-col gap-[12px]">
        <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">Price</label>
        <div className="w-full bg-[#f1f1f1] rounded-[9px] p-[10px] flex items-center">
          <span className="text-[14px] text-[#595959] tracking-[-0.7px]">₹</span>
          <input
            type="number"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="---"
            className="bg-transparent text-[14px] text-[#2e2d2a] tracking-[-0.7px] outline-none w-full placeholder:text-[#595959]"
          />
        </div>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-[12px]">
        <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description for the menu."
          rows={2}
          className="w-full bg-[#f1f1f1] rounded-[11px] p-[10px] text-[14px] text-[#2e2d2a] tracking-[-0.28px] leading-[1.27] outline-none resize-none placeholder:text-[#595959]"
        />
      </div>

      {error && <p className="text-[13px] text-red-600 -mt-[8px]">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full h-[56px] rounded-[17px] flex items-center justify-center ${canSubmit ? "bg-[#060606]" : "bg-[#ccc]"}`}
      >
        <span className="text-white text-[18px] font-medium">{busy ? "Saving photos…" : isEdit ? "Update Menu" : "Add Menu"}</span>
      </button>
    </div>
  );
}
