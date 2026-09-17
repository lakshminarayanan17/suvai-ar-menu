"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Restaurant } from "@/types/menu";
import ARViewer from "@/components/ARViewer";

export default function CustomerMenuPage() {
  const params = useParams();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id as string;
    fetch(`/api/restaurant/${id}`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as Restaurant) : null))
      .catch(() => null)
      .then((data) => { setRestaurant(data); setLoading(false); });
  }, [params.id]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black">
        <div className="text-white/80 text-[15px]">Loading menu…</div>
      </div>
    );
  }

  if (!restaurant || restaurant.menuItems.length === 0) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white p-8 text-center">
        <h1 className="text-2xl font-signifier mb-4">Menu Not Available</h1>
        <p className="text-white/70 mb-4">
          {!restaurant ? "Could not load this menu. Please try again." : "This restaurant hasn't added any dishes yet."}
        </p>
        <button onClick={() => window.location.reload()} className="bg-white/10 border border-white/20 rounded-full px-6 py-3 text-white text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full max-w-[390px] mx-auto overflow-hidden">
      <ARViewer menuItems={restaurant.menuItems} restaurantName={restaurant.name} />
    </div>
  );
}
