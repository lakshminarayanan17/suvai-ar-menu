"use client";

import { MenuItem, Restaurant, DishPhotos, PHOTO_VIEWS } from "@/types/menu";

// The server (Vercel Blob) is the source of truth — it's where the 3D generator
// writes model status. localStorage is only a cache so the dashboard paints
// instantly and survives a flaky connection.

const STORAGE_KEY = "suvai_restaurant_v2";
const DEFAULT_ID = "theobroma-001";

export const defaultRestaurant: Restaurant = {
  id: DEFAULT_ID,
  name: "Theobroma",
  menuItems: [],
};

export function readCache(): Restaurant | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Restaurant) : null;
  } catch {
    return null;
  }
}

export function writeCache(restaurant: Restaurant) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurant));
  } catch {
    // quota / private mode — ignore
  }
}

export async function fetchRestaurant(id: string): Promise<Restaurant | null> {
  try {
    const res = await fetch(`/api/restaurant/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Restaurant;
  } catch {
    return null;
  }
}

// PUT the whole restaurant; the server merges model state and returns the result.
export async function saveRestaurant(restaurant: Restaurant): Promise<Restaurant> {
  const res = await fetch("/api/restaurant", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(restaurant),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  const saved = (await res.json()) as Restaurant;
  writeCache(saved);
  return saved;
}

export async function uploadPhoto(restaurantId: string, dataUrl: string): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId, dataUrl }),
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return ((await res.json()) as { url: string }).url;
}

// Kick off 3D generation for one dish. Returns the item with status "queued".
export async function requestModel(restaurantId: string, itemId: string): Promise<MenuItem | null> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ restaurantId, itemId }),
  });
  if (!res.ok) return null;
  return (await res.json()) as MenuItem;
}

export function needsModel(item: MenuItem): boolean {
  return item.model.status === "none" || item.model.status === "failed";
}

export function isGenerating(item: MenuItem): boolean {
  return item.model.status === "queued" || item.model.status === "generating";
}

export function photoList(photos: DishPhotos): string[] {
  return PHOTO_VIEWS.map((v) => photos[v]).filter((p): p is string => !!p);
}

// Downscale + JPEG-encode a picked file so uploads and generator inputs stay small.
export function fileToResizedDataUrl(file: File, maxSize = 1024, quality = 0.88): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
        else { w = Math.round((w * maxSize) / h); h = maxSize; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      // PNG keeps transparency (helps background removal); everything else → JPEG
      const type = file.type === "image/png" ? "image/png" : "image/jpeg";
      resolve(canvas.toDataURL(type, quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image decode failed")); };
    img.src = url;
  });
}
