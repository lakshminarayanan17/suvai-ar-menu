"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MenuItem, Restaurant } from "@/types/menu";
import {
  defaultRestaurant, readCache, writeCache, fetchRestaurant, saveRestaurant,
  uploadPhoto, requestModel, needsModel, isGenerating,
} from "@/lib/store";
import PlateSlot from "@/components/PlateSlot";
import MenuDetailSheet from "@/components/MenuDetailSheet";
import MenuFormSheet, { MenuFormData } from "@/components/MenuFormSheet";
import QRSheet from "@/components/QRSheet";

const TOTAL_SLOTS = 6;
const POLL_MS = 5000;

type SheetType = "none" | "detail" | "add" | "edit" | "qr";

export default function OwnerDashboard() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetType>("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const menuItems = restaurant?.menuItems ?? [];
  const selectedItem = menuItems.find((m) => m.id === selectedId) ?? null;

  const apply = useCallback((r: Restaurant) => {
    setRestaurant(r);
    writeCache(r);
  }, []);

  // Initial load: cache first for an instant paint, then the server copy.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = readCache();
      if (cached) {
        await Promise.resolve();
        if (!cancelled) setRestaurant(cached);
      }
      const server = await fetchRestaurant(cached?.id ?? defaultRestaurant.id);
      if (cancelled) return;
      if (server) return apply(server);
      // Nothing on the server yet: seed it with what we have locally
      const seed = cached ?? defaultRestaurant;
      try { apply(await saveRestaurant(seed)); } catch { setRestaurant(seed); }
    })();
    return () => { cancelled = true; };
  }, [apply]);

  // Poll while any dish is generating so status badges update.
  const anyGenerating = menuItems.some(isGenerating);
  useEffect(() => {
    if (!anyGenerating || !restaurant) return;
    const t = setInterval(async () => {
      const server = await fetchRestaurant(restaurant.id);
      if (server) apply(server);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [anyGenerating, restaurant?.id, apply]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (msg: string) => setToast(msg);

  const handleSlotClick = (index: number) => {
    const item = menuItems[index];
    if (item) {
      setSelectedId(item.id);
      setActiveSheet("detail");
    } else {
      setSelectedId(null);
      setActiveSheet("add");
    }
  };

  // Upload any new (data:) photos to Blob storage, keep existing URLs as-is.
  const uploadNewPhotos = async (photos: MenuFormData["photos"]): Promise<MenuFormData["photos"]> => {
    if (!restaurant) throw new Error("Not loaded");
    const entries = await Promise.all(
      (Object.entries(photos) as [keyof MenuFormData["photos"], string | undefined][]).map(async ([view, src]) => {
        if (!src) return [view, undefined] as const;
        const url = src.startsWith("data:") ? await uploadPhoto(restaurant.id, src) : src;
        return [view, url] as const;
      })
    );
    const out = Object.fromEntries(entries.filter(([, v]) => !!v)) as Partial<MenuFormData["photos"]>;
    if (!out.front) throw new Error("Front photo upload failed");
    return out as MenuFormData["photos"];
  };

  const startGeneration = async (itemId: string) => {
    if (!restaurant) return;
    const queued = await requestModel(restaurant.id, itemId);
    if (!queued) return showToast("Couldn't start 3D generation. Try again.");
    setRestaurant((r) => r && { ...r, menuItems: r.menuItems.map((m) => (m.id === itemId ? queued : m)) });
  };

  const handleAddSubmit = async (data: MenuFormData) => {
    if (!restaurant) return;
    const photos = await uploadNewPhotos(data.photos);
    const newItem: MenuItem = {
      id: crypto.randomUUID(),
      name: data.name,
      price: data.price,
      description: data.description,
      photos,
      model: { status: "none" },
    };
    const saved = await saveRestaurant({ ...restaurant, menuItems: [...restaurant.menuItems, newItem] });
    apply(saved);
    setActiveSheet("none");
    await startGeneration(newItem.id);
  };

  const handleEditSubmit = async (data: MenuFormData) => {
    if (!restaurant || !selectedItem) return;
    const photos = await uploadNewPhotos(data.photos);
    const updated: MenuItem = { ...selectedItem, name: data.name, price: data.price, description: data.description, photos };
    const saved = await saveRestaurant({
      ...restaurant,
      menuItems: restaurant.menuItems.map((m) => (m.id === updated.id ? updated : m)),
    });
    apply(saved);
    setActiveSheet("none");
    // The server drops the model when photos change — regenerate in that case
    const after = saved.menuItems.find((m) => m.id === updated.id);
    if (after && needsModel(after)) await startGeneration(after.id);
    setSelectedId(null);
  };

  const handleDelete = async () => {
    if (!restaurant || !selectedItem) return;
    if (!confirm(`Delete "${selectedItem.name}"?`)) return;
    const saved = await saveRestaurant({ ...restaurant, menuItems: restaurant.menuItems.filter((m) => m.id !== selectedItem.id) });
    apply(saved);
    setActiveSheet("none");
    setSelectedId(null);
  };

  const handleCloseSheet = () => {
    setActiveSheet("none");
    setSelectedId(null);
  };

  // Debounced name save so each keystroke doesn't hit the server.
  const handleNameChange = (newName: string) => {
    if (!restaurant) return;
    const next = { ...restaurant, name: newName };
    setRestaurant(next);
    writeCache(next);
    if (nameSaveTimer.current) clearTimeout(nameSaveTimer.current);
    nameSaveTimer.current = setTimeout(() => { saveRestaurant(next).catch(() => showToast("Name not saved — check connection")); }, 800);
  };

  if (!restaurant) return null;

  const slots: (MenuItem | undefined)[] = Array.from({ length: TOTAL_SLOTS }, (_, i) => menuItems[i]);
  const readyCount = menuItems.filter((m) => m.model.status === "ready").length;

  return (
    <div className="relative w-full max-w-[390px] mx-auto h-screen overflow-hidden bg-[#fcfcfc]">
      <div className="h-[48px]" />

      {/* Header */}
      <div className="flex items-center justify-between px-[20px] py-[12px]">
        <input
          type="text"
          value={restaurant.name}
          onChange={(e) => handleNameChange(e.target.value)}
          aria-label="Restaurant name"
          className="font-signifier text-[24px] text-black tracking-[-0.48px] bg-transparent outline-none w-[260px]"
        />
        <button onClick={() => setActiveSheet("qr")} aria-label="Show QR code" className="w-[40px] h-[40px] flex items-center justify-center">
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
        <div className="border-l border-r border-t border-[#e8e8e8]">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex border-b border-[#e8e8e8]">
              {[0, 1].map((col) => {
                const index = row * 2 + col;
                const item = slots[index];
                return (
                  <div key={col} className={`flex-1 py-[16px] flex items-center justify-center ${col === 0 ? "border-r border-[#e8e8e8]" : ""}`}>
                    <PlateSlot item={item} onClick={() => handleSlotClick(index)} showPlus={!item && index === menuItems.length} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[60px] bg-[#1d1d1f] text-white text-[13px] px-[16px] py-[10px] rounded-full shadow-lg z-40">
          {toast}
        </div>
      )}

      {/* Home indicator */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[390px] max-w-full h-[34px] bg-white flex items-end justify-center pb-[8px]">
        <div className="w-[134px] h-[5px] bg-[#1d1d1f] rounded-[100px]" />
      </div>

      <MenuDetailSheet
        isOpen={activeSheet === "detail"}
        onClose={handleCloseSheet}
        item={selectedItem}
        onEdit={() => setActiveSheet("edit")}
        onGenerate={() => selectedItem && startGeneration(selectedItem.id)}
        onDelete={handleDelete}
      />
      <MenuFormSheet isOpen={activeSheet === "add"} onClose={handleCloseSheet} onSubmit={handleAddSubmit} />
      <MenuFormSheet isOpen={activeSheet === "edit"} onClose={handleCloseSheet} onSubmit={handleEditSubmit} editItem={selectedItem} />
      <QRSheet
        isOpen={activeSheet === "qr"}
        onClose={handleCloseSheet}
        restaurantId={restaurant.id}
        readyCount={readyCount}
        totalCount={menuItems.length}
      />
    </div>
  );
}
