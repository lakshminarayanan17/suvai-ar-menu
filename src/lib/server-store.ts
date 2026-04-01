import { Restaurant } from "@/types/menu";
import { put, list, del } from "@vercel/blob";

const BLOB_PREFIX = "suvai-restaurant-";

// Fallback in-memory store for local dev without Vercel Blob token
const memoryStore = new Map<string, Restaurant>();

function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function getRestaurantById(
  id: string
): Promise<Restaurant | null> {
  if (hasBlob()) {
    try {
      const { blobs } = await list({ prefix: `${BLOB_PREFIX}${id}` });
      if (blobs.length === 0) return null;
      const res = await fetch(blobs[0].url);
      return (await res.json()) as Restaurant;
    } catch {
      return null;
    }
  }
  return memoryStore.get(id) || null;
}

export async function saveRestaurant(restaurant: Restaurant): Promise<void> {
  if (hasBlob()) {
    // Delete old blob first
    const { blobs } = await list({
      prefix: `${BLOB_PREFIX}${restaurant.id}`,
    });
    for (const blob of blobs) {
      await del(blob.url);
    }
    // Save new
    await put(
      `${BLOB_PREFIX}${restaurant.id}.json`,
      JSON.stringify(restaurant),
      {
        access: "public",
        contentType: "application/json",
      }
    );
  } else {
    memoryStore.set(restaurant.id, restaurant);
  }
}
