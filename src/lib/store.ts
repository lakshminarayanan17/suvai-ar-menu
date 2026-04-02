"use client";

import { MenuItem, Restaurant } from "@/types/menu";

const STORAGE_KEY = "suvai_restaurant";

const defaultRestaurant: Restaurant = {
  id: "theobroma-001",
  name: "Theobroma",
  menuItems: [],
};

export function getRestaurant(): Restaurant {
  if (typeof window === "undefined") return defaultRestaurant;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaultRestaurant;
  try {
    return JSON.parse(stored);
  } catch {
    return defaultRestaurant;
  }
}

export function saveRestaurant(restaurant: Restaurant) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(restaurant));
  // Sync to server in background
  syncToServer(restaurant);
}

export function addMenuItem(item: MenuItem) {
  const restaurant = getRestaurant();
  restaurant.menuItems.push(item);
  saveRestaurant(restaurant);
  return restaurant;
}

export function updateMenuItem(id: string, updates: Partial<MenuItem>) {
  const restaurant = getRestaurant();
  const index = restaurant.menuItems.findIndex((m) => m.id === id);
  if (index !== -1) {
    restaurant.menuItems[index] = { ...restaurant.menuItems[index], ...updates };
    saveRestaurant(restaurant);
  }
  return restaurant;
}

export function deleteMenuItem(id: string) {
  const restaurant = getRestaurant();
  restaurant.menuItems = restaurant.menuItems.filter((m) => m.id !== id);
  saveRestaurant(restaurant);
  return restaurant;
}

export function getMenuItemById(id: string): MenuItem | undefined {
  const restaurant = getRestaurant();
  return restaurant.menuItems.find((m) => m.id === id);
}

// --- Server sync ---

async function syncToServer(restaurant: Restaurant) {
  try {
    const res = await fetch("/api/restaurant", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restaurant),
    });
    if (!res.ok) {
      console.error("Server sync failed:", res.status);
    }
  } catch (err) {
    console.error("Server sync error:", err);
  }
}

// Force sync — returns true if successful
export async function forceSyncToServer(): Promise<boolean> {
  const restaurant = getRestaurant();
  try {
    const res = await fetch("/api/restaurant", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(restaurant),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRestaurantFromServer(
  id: string
): Promise<Restaurant | null> {
  try {
    const res = await fetch(`/api/restaurant/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as Restaurant;
  } catch {
    return null;
  }
}
