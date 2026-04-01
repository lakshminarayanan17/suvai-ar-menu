import { NextRequest, NextResponse } from "next/server";
import { getRestaurantById } from "@/lib/server-store";

// GET /api/restaurant/[id] — public endpoint for customers
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const restaurant = await getRestaurantById(id);
  if (!restaurant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(restaurant);
}
