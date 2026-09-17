import { put, list, del } from "@vercel/blob";
import {
  Restaurant,
  MenuItem,
  LegacyMenuItem,
  photoSourceKey,
  PHOTO_VIEWS,
} from "@/types/menu";

// Deterministic blob paths so overwrites replace in place (no orphaned copies).
const restaurantPath = (id: string) => `suvai/restaurants/${id}.json`;
const legacyPrefix = (id: string) => `suvai-restaurant-${id}`;

// Short edge cache: the owner dashboard polls this while models generate.
const JSON_CACHE_SECONDS = 60;

async function readJsonBlob<T>(url: string): Promise<T | null> {
  // Bust the CDN cache — blob URLs are otherwise cached for cacheControlMaxAge.
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function isLegacyItem(item: unknown): item is LegacyMenuItem {
  return typeof item === "object" && item !== null && "image" in item && !("photos" in item);
}

// Old blobs stored base64 data URLs inline. Keep them readable: the data URL still
// works as an <img>/generator source, and the item just needs a model generated.
export function migrateItem(raw: MenuItem | LegacyMenuItem): MenuItem {
  if (!isLegacyItem(raw)) {
    return { ...raw, model: raw.model ?? { status: "none" } };
  }
  const imgs = raw.images?.length ? raw.images : raw.image ? [raw.image] : [];
  return {
    id: raw.id,
    name: raw.name,
    price: raw.price,
    description: raw.description,
    photos: { front: imgs[0] ?? "", back: imgs[1], left: imgs[2], right: imgs[3] },
    model: { status: "none" },
  };
}

export function migrateRestaurant(raw: Restaurant): Restaurant {
  return {
    ...raw,
    menuItems: (raw.menuItems ?? []).map((m) => migrateItem(m as MenuItem | LegacyMenuItem)),
  };
}

export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  try {
    const { blobs } = await list({ prefix: restaurantPath(id), limit: 1 });
    let url = blobs[0]?.url;
    if (!url) {
      // Fall back to the pre-migration path
      const legacy = await list({ prefix: legacyPrefix(id), limit: 1 });
      url = legacy.blobs[0]?.url;
    }
    if (!url) return null;
    const data = await readJsonBlob<Restaurant>(url);
    if (!data) return null;
    const restaurant = migrateRestaurant(data);
    return (await externalizeInlinePhotos(restaurant)) ?? restaurant;
  } catch (err) {
    console.error("getRestaurantById error:", err);
    return null;
  }
}

// One-time migration on read: old records embed base64 photos in the JSON (hundreds of
// KB per dish). Move them to Blob storage so the menu payload shrinks to a few KB.
async function externalizeInlinePhotos(restaurant: Restaurant): Promise<Restaurant | null> {
  const hasInline = restaurant.menuItems.some((m) => PHOTO_VIEWS.some((v) => m.photos[v]?.startsWith("data:")));
  if (!hasInline) return null;
  try {
    const menuItems = await Promise.all(
      restaurant.menuItems.map(async (m) => {
        const photos = { ...m.photos };
        for (const view of PHOTO_VIEWS) {
          const src = photos[view];
          if (!src?.startsWith("data:")) continue;
          const decoded = decodeDataUrl(src);
          if (!decoded) { delete photos[view]; continue; }
          photos[view] = await uploadImage(restaurant.id, decoded.bytes, decoded.contentType);
        }
        return { ...m, photos };
      })
    );
    const migrated = { ...restaurant, menuItems };
    await saveRestaurant(migrated);
    return migrated;
  } catch (err) {
    console.error("photo migration failed (serving inline photos):", err);
    return null;
  }
}

export async function saveRestaurant(restaurant: Restaurant): Promise<void> {
  await put(restaurantPath(restaurant.id), JSON.stringify(restaurant), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: JSON_CACHE_SECONDS,
  });
  // Clean up the old-format blob once the new one exists
  try {
    const legacy = await list({ prefix: legacyPrefix(restaurant.id) });
    if (legacy.blobs.length) await del(legacy.blobs.map((b) => b.url));
  } catch {
    // best effort
  }
}

/**
 * Merge an owner's save with what the server already has: the client never
 * owns `model` (the generator writes it), so carry it over unless the photos
 * changed, in which case the model is stale and must be regenerated.
 */
export function mergeRestaurant(incoming: Restaurant, existing: Restaurant | null): Restaurant {
  const prev = new Map((existing?.menuItems ?? []).map((m) => [m.id, m]));
  return {
    id: incoming.id,
    name: incoming.name,
    menuItems: incoming.menuItems.map((raw) => {
      const item = migrateItem(raw as MenuItem | LegacyMenuItem);
      const old = prev.get(item.id);
      if (!old) return { ...item, model: { status: "none" } };
      const samePhotos = photoSourceKey(item.photos) === (old.model.sourceKey ?? photoSourceKey(old.photos));
      return { ...item, model: samePhotos ? old.model : { status: "none" } };
    }),
  };
}

export async function updateMenuItem(
  restaurantId: string,
  itemId: string,
  patch: (item: MenuItem) => MenuItem
): Promise<MenuItem | null> {
  const restaurant = await getRestaurantById(restaurantId);
  if (!restaurant) return null;
  const idx = restaurant.menuItems.findIndex((m) => m.id === itemId);
  if (idx === -1) return null;
  restaurant.menuItems[idx] = patch(restaurant.menuItems[idx]);
  await saveRestaurant(restaurant);
  return restaurant.menuItems[idx];
}

// --- Binary assets ---

export async function uploadImage(restaurantId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = contentType === "image/png" ? "png" : "jpg";
  const { url } = await put(`suvai/${restaurantId}/photos/${crypto.randomUUID()}.${ext}`, Buffer.from(bytes), {
    access: "public",
    contentType,
    addRandomSuffix: false,
  });
  return url;
}

export async function uploadModel(restaurantId: string, itemId: string, glb: ArrayBuffer): Promise<string> {
  // New path per generation so model-viewer / CDN caches never serve a stale mesh
  const { url } = await put(`suvai/${restaurantId}/models/${itemId}-${Date.now()}.glb`, Buffer.from(glb), {
    access: "public",
    contentType: "model/gltf-binary",
    addRandomSuffix: false,
  });
  return url;
}

// Decode a data: URL (legacy inline photo) into bytes
export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; contentType: string } | null {
  const m = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) return null;
  return { bytes: new Uint8Array(Buffer.from(m[2], "base64")), contentType: m[1] };
}
