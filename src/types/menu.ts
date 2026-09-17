export type ModelStatus = "none" | "queued" | "generating" | "ready" | "failed";

// Photo views the 3D generator understands. "front" is required; the rest improve
// the back/sides of the model when the owner provides them.
export type PhotoView = "front" | "back" | "left" | "right";
export const PHOTO_VIEWS: PhotoView[] = ["front", "back", "left", "right"];

export interface DishPhotos {
  front: string; // public image URL
  back?: string;
  left?: string;
  right?: string;
}

export interface DishModel {
  status: ModelStatus;
  url?: string; // public GLB URL (ready only)
  error?: string; // failed only
  progress?: string; // human-readable stage while generating
  // Photos the current model was built from — lets the server decide when a regen is needed
  sourceKey?: string;
  updatedAt?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  photos: DishPhotos;
  model: DishModel;
}

export interface Restaurant {
  id: string;
  name: string;
  menuItems: MenuItem[];
}

// Legacy shape (base64 data URLs stored inline) — still present in old blobs / localStorage
export interface LegacyMenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string | null;
  images?: string[];
}

export function photoSourceKey(photos: DishPhotos): string {
  return PHOTO_VIEWS.map((v) => photos[v] ?? "").join("|");
}

export function primaryPhoto(item: MenuItem): string {
  return item.photos.front;
}
