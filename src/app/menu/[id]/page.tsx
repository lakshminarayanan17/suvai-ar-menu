"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Restaurant } from "@/types/menu";
import dynamic from "next/dynamic";

const ARViewer = dynamic(() => import("@/components/ARViewer"), { ssr: false });

export default function CustomerMenuPage() {
  const params = useParams();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMenu() {
      const id = params.id as string;

      // Try fetching from API first (works across devices)
      try {
        const res = await fetch(`/api/restaurant/${id}`);
        if (res.ok) {
          const data: Restaurant = await res.json();
          setRestaurant(data);
          setLoading(false);
          return;
        }
      } catch {
        // API failed, try localStorage fallback
      }

      // Fallback: localStorage (same device)
      const stored = localStorage.getItem("suvai_restaurant");
      if (stored) {
        try {
          const data: Restaurant = JSON.parse(stored);
          if (data.id === id) {
            setRestaurant(data);
          }
        } catch {
          // ignore
        }
      }
      setLoading(false);
    }

    loadMenu();
  }, [params.id]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <div className="text-white text-lg">Loading menu...</div>
      </div>
    );
  }

  if (!restaurant || restaurant.menuItems.length === 0) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white p-8 text-center">
        <h1 className="text-2xl font-signifier mb-4">Menu Not Available</h1>
        <p className="text-[rgba(255,255,255,0.7)] mb-4">
          {!restaurant
            ? "Could not load the menu. Ask the restaurant to sync their menu."
            : "No menu items with images found. The restaurant needs to add items first."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-white/10 border border-white/20 rounded-full px-6 py-3 text-white text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full max-w-[390px] mx-auto overflow-hidden">
      <ARViewer
        menuItems={restaurant.menuItems}
        restaurantName={restaurant.name}
      />
    </div>
  );
}
