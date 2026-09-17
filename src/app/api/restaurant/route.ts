import { NextRequest, NextResponse } from "next/server";
import { getRestaurantById, saveRestaurant, mergeRestaurant } from "@/lib/server-store";
import { Restaurant } from "@/types/menu";

const noStore = { "Cache-Control": "no-store" };

// GET /api/restaurant?id=xxx
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const restaurant = await getRestaurantById(id);
  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(restaurant, { headers: noStore });
}

// PUT /api/restaurant — save the owner's copy; model state is merged in server-side
export async function PUT(request: NextRequest) {
  let body: Restaurant;
  try {
    body = (await request.json()) as Restaurant;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body?.id || !body.name || !Array.isArray(body.menuItems)) {
    return NextResponse.json({ error: "Missing id, name or menuItems" }, { status: 400 });
  }
  try {
    const existing = await getRestaurantById(body.id);
    const merged = mergeRestaurant(body, existing);
    await saveRestaurant(merged);
    return NextResponse.json(merged, { headers: noStore });
  } catch (err) {
    console.error("save error:", err);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
