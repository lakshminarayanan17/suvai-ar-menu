"use client";

import { useState, useRef, useEffect } from "react";
import { MenuItem } from "@/types/menu";
import BottomSheet from "./BottomSheet";

interface MenuFormSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; price: number; description: string; image: string | null }) => void;
  editItem?: MenuItem | null;
}

export default function MenuFormSheet({ isOpen, onClose, onSubmit, editItem }: MenuFormSheetProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!editItem;

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setPrice(editItem.price.toString());
      setDescription(editItem.description);
      setImage(editItem.image);
    } else {
      setName("");
      setPrice("");
      setDescription("");
      setImage(null);
    }
  }, [editItem, isOpen]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      price: parseFloat(price) || 0,
      description: description.trim(),
      image,
    });
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="p-[16px] flex flex-col gap-[24px]">
        {/* Image upload */}
        <div className="flex flex-col gap-[14px]">
          <div
            className="w-[129px] h-[129px] rounded-[14px] border border-dashed border-[#dadada] overflow-hidden flex items-center justify-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {image ? (
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: "conic-gradient(from 0deg, #d4956b, #c4854b, #d4a56b, #e8c89b, #d4956b)",
                  padding: "10px",
                }}
              >
                <div className="w-full h-full rounded-full bg-[#f5f0eb] flex items-center justify-center overflow-hidden border-2 border-[#e8d8c8]">
                  <img
                    src={image}
                    alt="Dish"
                    className="w-[85%] h-[85%] object-cover rounded-full"
                  />
                </div>
              </div>
            ) : (
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: "conic-gradient(from 0deg, #e0d0c0, #d0c0b0, #e0d0c0, #f0e0d0, #e0d0c0)",
                  padding: "10px",
                }}
              >
                <div className="w-full h-full rounded-full bg-[#f5f0eb] border-2 border-[#e8e0d8]" />
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
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-[129px] bg-[#f1f1f1] rounded-[7px] p-[10px] text-center text-[14px] text-[#595959] tracking-[-0.28px]"
          >
            {isEdit ? "Edit image" : "Add image"}
          </button>
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
          className="w-full h-[56px] bg-[#060606] rounded-[17px] flex items-center justify-center"
        >
          <span className="text-white text-[18px] font-medium">
            {isEdit ? "Update Menu" : "Add Menu"}
          </span>
        </button>
      </div>
    </BottomSheet>
  );
}
