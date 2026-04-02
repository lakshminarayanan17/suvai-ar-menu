import { Restaurant } from "@/types/menu";
import { put, list, del } from "@vercel/blob";

export async function getRestaurantById(
  id: string
): Promise<Restaurant | null> {
  try {
    const { blobs } = await list({ prefix: `suvai-restaurant-${id}` });
    if (blobs.length === 0) return null;
    const res = await fetch(blobs[0].url);
    return (await res.json()) as Restaurant;
  } catch (err) {
    console.error("getRestaurantById error:", err);
    return null;
  }
}

export async function saveRestaurant(restaurant: Restaurant): Promise<void> {
  // Delete old blob first
  const { blobs } = await list({
    prefix: `suvai-restaurant-${restaurant.id}`,
  });
  for (const blob of blobs) {
    await del(blob.url);
  }
  // Save new
  await put(
    `suvai-restaurant-${restaurant.id}.json`,
    JSON.stringify(restaurant),
    {
      access: "public",
      contentType: "application/json",
    }
  );
}
