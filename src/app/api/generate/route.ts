import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getRestaurantById, updateMenuItem, uploadModel } from "@/lib/server-store";
import { getModelProvider } from "@/lib/providers";
import { normalizeGlbForAR } from "@/lib/glb-transform";
import { photoSourceKey, MenuItem } from "@/types/menu";

// Generation runs after the response via after(); this is the ceiling for it.
export const maxDuration = 300;

const PLATE_WIDTH_METRES = 0.28;

async function runGeneration(restaurantId: string, item: MenuItem) {
  const setProgress = (progress: string) =>
    updateMenuItem(restaurantId, item.id, (m) => ({
      ...m,
      model: { ...m.model, status: "generating", progress, updatedAt: new Date().toISOString() },
    })).catch(() => {});

  try {
    const { glb, provider } = await getModelProvider().generate({ photos: item.photos, onProgress: (s) => void setProgress(s) });
    const normalized = normalizeGlbForAR(glb, PLATE_WIDTH_METRES);
    const url = await uploadModel(restaurantId, item.id, normalized);
    await updateMenuItem(restaurantId, item.id, (m) => ({
      ...m,
      model: { status: "ready", url, sourceKey: photoSourceKey(item.photos), updatedAt: new Date().toISOString() },
    }));
    console.log(`[generate] ${item.name}: ready via ${provider}, ${(normalized.byteLength / 1024).toFixed(0)}KB`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[generate] ${item.name} failed:`, error);
    await updateMenuItem(restaurantId, item.id, (m) => ({
      ...m,
      model: { status: "failed", error, updatedAt: new Date().toISOString() },
    }));
  }
}

// POST /api/generate — { restaurantId, itemId } → queues 3D generation, returns the item
export async function POST(request: NextRequest) {
  const { restaurantId, itemId } = (await request.json().catch(() => ({}))) as { restaurantId?: string; itemId?: string };
  if (!restaurantId || !itemId) {
    return NextResponse.json({ error: "Missing restaurantId or itemId" }, { status: 400 });
  }
  const restaurant = await getRestaurantById(restaurantId);
  const item = restaurant?.menuItems.find((m) => m.id === itemId);
  if (!item) return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  if (!item.photos.front) return NextResponse.json({ error: "Dish has no front photo" }, { status: 400 });

  // Ignore double-taps while a job is already in flight (unless it looks stuck)
  const startedAt = item.model.updatedAt ? Date.parse(item.model.updatedAt) : 0;
  const inFlight = (item.model.status === "queued" || item.model.status === "generating") && Date.now() - startedAt < maxDuration * 1000;
  if (inFlight) return NextResponse.json(item, { status: 202 });

  const queued = await updateMenuItem(restaurantId, itemId, (m) => ({
    ...m,
    model: { status: "queued", progress: "Queued", updatedAt: new Date().toISOString() },
  }));

  after(() => runGeneration(restaurantId, item));
  return NextResponse.json(queued, { status: 202 });
}
