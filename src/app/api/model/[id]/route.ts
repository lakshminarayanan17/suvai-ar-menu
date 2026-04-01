import { NextRequest, NextResponse } from "next/server";
import { getRestaurantById } from "@/lib/server-store";
import { generatePlateGLB } from "@/lib/glb-generator";

// GET /api/model/[id]?item=menuItemId — serves a GLB file for AR
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const itemId = request.nextUrl.searchParams.get("item");

  if (!itemId) {
    return NextResponse.json({ error: "Missing item param" }, { status: 400 });
  }

  const restaurant = await getRestaurantById(id);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const menuItem = restaurant.menuItems.find((m) => m.id === itemId);
  if (!menuItem || !menuItem.image) {
    return NextResponse.json({ error: "Menu item not found or has no image" }, { status: 404 });
  }

  try {
    const glb = generatePlateGLB(menuItem.image);
    const arrayBuffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    return new Response(arrayBuffer, {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Content-Disposition": `inline; filename="${menuItem.name || "dish"}.glb"`,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("GLB generation error:", err);
    return NextResponse.json({ error: "Failed to generate model" }, { status: 500 });
  }
}
