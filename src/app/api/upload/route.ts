import { NextRequest, NextResponse } from "next/server";
import { uploadImage, decodeDataUrl } from "@/lib/server-store";

const MAX_BYTES = 4 * 1024 * 1024;

// POST /api/upload — { restaurantId, dataUrl } → { url }
// Photos are resized client-side before upload; this just moves them to Blob
// storage so the menu JSON stays small and the generator can fetch them by URL.
export async function POST(request: NextRequest) {
  try {
    const { restaurantId, dataUrl } = (await request.json()) as { restaurantId?: string; dataUrl?: string };
    if (!restaurantId || !dataUrl) {
      return NextResponse.json({ error: "Missing restaurantId or dataUrl" }, { status: 400 });
    }
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    if (decoded.bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    const url = await uploadImage(restaurantId, decoded.bytes, decoded.contentType);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
