"use client";

import { useState, useEffect, useCallback } from "react";
import { MenuItem } from "@/types/menu";
import { getRestaurant, addMenuItem, updateMenuItem, saveRestaurant } from "@/lib/store";
import PlateSlot from "@/components/PlateSlot";
import MenuDetailSheet from "@/components/MenuDetailSheet";
import MenuFormSheet from "@/components/MenuFormSheet";
import QRSheet from "@/components/QRSheet";
import { v4 as uuidv4 } from "uuid";

const TOTAL_SLOTS = 6;

type SheetType = "none" | "detail" | "add" | "edit" | "qr";

export default function OwnerDashboard() {
  const [restaurantName, setRestaurantName] = useState("Theobroma");
  const [restaurantId, setRestaurantId] = useState("theobroma-001");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeSheet, setActiveSheet] = useState<SheetType>("none");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [mounted, setMounted] = useState(false);

  const loadData = useCallback(() => {
    const restaurant = getRestaurant();
    setRestaurantName(restaurant.name);
    setRestaurantId(restaurant.id);
    setMenuItems(restaurant.menuItems);
  }, []);

  useEffect(() => {
    setMounted(true);
    loadData();
  }, [loadData]);

  const handleSlotClick = (index: number) => {
    const item = menuItems[index];
    if (item) {
      setSelectedItem(item);
      setActiveSheet("detail");
    } else {
      setSelectedItem(null);
      setActiveSheet("add");
    }
  };

  const handleEditFromDetail = () => {
    setActiveSheet("edit");
  };

  const handleAddSubmit = (data: { name: string; price: number; description: string; image: string | null; images: string[] }) => {
    const newItem: MenuItem = {
      id: uuidv4(),
      name: data.name,
      price: data.price,
      description: data.description,
      image: data.image,
      images: data.images,
    };
    const restaurant = addMenuItem(newItem);
    setMenuItems([...restaurant.menuItems]);
    setActiveSheet("none");
  };

  const handleEditSubmit = (data: { name: string; price: number; description: string; image: string | null; images: string[] }) => {
    if (!selectedItem) return;
    const restaurant = updateMenuItem(selectedItem.id, {
      name: data.name,
      price: data.price,
      description: data.description,
      image: data.image,
      images: data.images,
    });
    setMenuItems([...restaurant.menuItems]);
    setSelectedItem(null);
    setActiveSheet("none");
  };

  const handleQRClick = () => {
    setActiveSheet("qr");
  };

  const handleCloseSheet = () => {
    setActiveSheet("none");
    setSelectedItem(null);
  };

  const handleNameChange = (newName: string) => {
    setRestaurantName(newName);
    const restaurant = getRestaurant();
    restaurant.name = newName;
    saveRestaurant(restaurant);
  };

  if (!mounted) return null;

  // Build slot data: fill with menu items, pad with empty slots
  const slots: (MenuItem | undefined)[] = [];
  for (let i = 0; i < TOTAL_SLOTS; i++) {
    slots.push(menuItems[i] || undefined);
  }

  return (
    <div className="relative w-full max-w-[390px] mx-auto h-screen overflow-hidden bg-[#fcfcfc]">
      {/* Status bar spacer */}
      <div className="h-[48px]" />

      {/* Header */}
      <div className="flex items-center justify-between px-[20px] py-[12px]">
        <input
          type="text"
          value={restaurantName}
          onChange={(e) => handleNameChange(e.target.value)}
          className="font-signifier text-[24px] text-black tracking-[-0.48px] bg-transparent outline-none w-[260px]"
        />
        <button onClick={handleQRClick} className="w-[40px] h-[40px] flex items-center justify-center">
          <svg width="33" height="33" viewBox="0 0 33 33" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2" stroke="#2e2d2a" strokeWidth="1.5" />
            <rect x="19" y="2" width="12" height="12" rx="2" stroke="#2e2d2a" strokeWidth="1.5" />
            <rect x="2" y="19" width="12" height="12" rx="2" stroke="#2e2d2a" strokeWidth="1.5" />
            <rect x="5" y="5" width="6" height="6" rx="1" fill="#2e2d2a" />
            <rect x="22" y="5" width="6" height="6" rx="1" fill="#2e2d2a" />
            <rect x="5" y="22" width="6" height="6" rx="1" fill="#2e2d2a" />
            <rect x="19" y="19" width="4" height="4" fill="#2e2d2a" />
            <rect x="25" y="19" width="4" height="4" fill="#2e2d2a" />
            <rect x="19" y="25" width="4" height="4" fill="#2e2d2a" />
            <rect x="27" y="27" width="4" height="4" fill="#2e2d2a" />
          </svg>
        </button>
      </div>

      {/* Grid */}
      <div className="px-[12px] mt-[4px]">
        <div className="relative">
          <div className="border-l border-r border-t border-[#e8e8e8]">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex border-b border-[#e8e8e8]">
                {[0, 1].map((col) => {
                  const index = row * 2 + col;
                  const item = slots[index];
                  const isFirstEmpty = !item && index === menuItems.length;
                  return (
                    <div
                      key={col}
                      className={`flex-1 py-[16px] flex items-center justify-center ${
                        col === 0 ? "border-r border-[#e8e8e8]" : ""
                      }`}
                    >
                      <PlateSlot
                        item={item}
                        onClick={() => handleSlotClick(index)}
                        isEmpty={!item}
                        showPlus={isFirstEmpty}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Home indicator */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[390px] max-w-full h-[34px] bg-white flex items-end justify-center pb-[8px]">
        <div className="w-[134px] h-[5px] bg-[#1d1d1f] rounded-[100px]" />
      </div>

      {/* Bottom Sheets */}
      <MenuDetailSheet
        isOpen={activeSheet === "detail"}
        onClose={handleCloseSheet}
        item={selectedItem}
        onEdit={handleEditFromDetail}
      />

      <MenuFormSheet
        isOpen={activeSheet === "add"}
        onClose={handleCloseSheet}
        onSubmit={handleAddSubmit}
      />

      <MenuFormSheet
        isOpen={activeSheet === "edit"}
        onClose={handleCloseSheet}
        onSubmit={handleEditSubmit}
        editItem={selectedItem}
      />

      <QRSheet
        isOpen={activeSheet === "qr"}
        onClose={handleCloseSheet}
        restaurantId={restaurantId}
      />
    </div>
  );
}
