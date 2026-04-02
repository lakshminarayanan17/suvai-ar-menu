import { Restaurant } from "@/types/menu";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = "/tmp/suvai-data";

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(id: string): string {
  // Sanitize id to prevent path traversal
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(DATA_DIR, `${safe}.json`);
}

export async function getRestaurantById(
  id: string
): Promise<Restaurant | null> {
  ensureDir();
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    const data = fs.readFileSync(fp, "utf-8");
    return JSON.parse(data) as Restaurant;
  } catch {
    return null;
  }
}

export async function saveRestaurant(restaurant: Restaurant): Promise<void> {
  ensureDir();
  const fp = filePath(restaurant.id);
  fs.writeFileSync(fp, JSON.stringify(restaurant), "utf-8");
}
