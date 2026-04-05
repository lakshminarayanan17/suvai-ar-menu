"use client";

import { useState, useRef, useEffect } from "react";
import { MenuItem } from "@/types/menu";
import BottomSheet from "./BottomSheet";

interface MenuFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; price: number; description: string; image: string | null; images: string[] }) => void;
  editItem?: MenuItem | null;
}

const MAX_IMAGES = 4;

export default function MenuFormSheet({ isOpen, onClose, onSubmit, editItem }: MenuFormSheetProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!editItem;

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setPrice(editItem.price.toString());
      setDescription(editItem.description);
      // Load from images array or fall back to single image
      if (editItem.images && editItem.images.length > 0) {
        setImages(editItem.images);
      } else if (editItem.image) {
        setImages([editItem.image]);
      } else {
        setImages([]);
      }
    } else {
      setName("");
      setPrice("");
      setDescription("");
      setImages([]);
    }
  }, [editItem, isOpen]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImages((prev) => {
        if (prev.length >= MAX_IMAGES) return prev;
        return [...prev, dataUrl];
      });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      price: parseFloat(price) || 0,
      description: description.trim(),
      image: images[0] || null, // primary image for backward compat
      images,
    });
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="p-[16px] flex flex-col gap-[24px]">
        {/* Image upload — up to 4 */}
        <div className="flex flex-col gap-[10px]">
          <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">
            Photos <span className="text-[13px] font-normal text-[#999]">({images.length}/{MAX_IMAGES})</span>
          </label>
          <div className="flex gap-[10px] flex-wrap">
            {/* Existing images */}
            {images.map((img, i) => (
              <div key={i} className="relative w-[72px] h-[72px]">
                <div
                  className="w-full h-full rounded-[12px] overflow-hidden border border-[#e0e0e0]"
                >
                  <img src={img} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
                {/* Remove button */}
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-[6px] -right-[6px] w-[20px] h-[20px] bg-black rounded-full flex items-center justify-center"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1L9 9M9 1L1 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Add button (if less than max) */}
            {images.length < MAX_IMAGES && (
              <div
                className="w-[72px] h-[72px] rounded-[12px] border-2 border-dashed border-[#d0d0d0] flex items-center justify-center cursor-pointer active:bg-[#f5f5f5]"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5V19M5 12H19" stroke="#999" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>

        {/* Dish Name */}
        <div className="flex flex-col gap-[12px]">
          <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">
            Dish Name
          </label>
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
          <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">
            Price
          </label>
          <div className="w-full bg-[#f1f1f1] rounded-[9px] p-[10px] flex items-center">
            <span className="text-[14px] text-[#595959] tracking-[-0.7px]">₹</span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="---"
              className="bg-transparent text-[14px] text-[#2e2d2a] tracking-[-0.7px] outline-none w-full placeholder:text-[#595959]"
            />
          </div>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-[12px]">
          <label className="text-[16px] font-medium text-[#595959] tracking-[-0.32px]">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description for the menu."
            rows={2}
            className="w-full bg-[#f1f1f1] rounded-[11px] p-[10px] text-[14px] text-[#2e2d2a] tracking-[-0.28px] leading-[1.27] outline-none resize-none placeholder:text-[#595959]"
          />
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={images.length === 0}
          className={`w-full h-[56px] rounded-[17px] flex items-center justify-center ${
            images.length > 0 ? "bg-[#060606]" : "bg-[#ccc]"
          }`}
        >
          <span className="text-white text-[18px] font-medium">
            {isEdit ? "Update Menu" : "Add Menu"}
          </span>
        </button>
      </div>
    </BottomSheet>
  );
}
