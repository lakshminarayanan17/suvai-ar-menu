import { NextRequest, NextResponse } from "next/server";
import {
  getRestaurantById,
  saveRestaurant,
} from "@/lib/server-store";
import { Restaurant } from "@/types/menu";

// GET /api/restaurant?id=xxx
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const restaurant = await getRestaurantById(id);
  if (!restaurant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(restaurant);
}

// PUT /api/restaurant — save full restaurant data
export async function PUT(request: NextRequest) {
  try {
    const body: Restaurant = await request.json();
    if (!body.id || !body.name) {
      return NextResponse.json(
        { error: "Missing id or name" },
        { status: 400 }
      );
    }
    await saveRestaurant(body);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
}
