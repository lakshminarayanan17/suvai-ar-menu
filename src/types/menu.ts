export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string | null; // base64 data URL (primary image)
  images?: string[]; // up to 4 images for multi-angle 3D
}

export interface Restaurant {
  id: string;
  name: string;
  menuItems: MenuItem[];
}
