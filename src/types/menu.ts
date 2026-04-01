export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string | null; // base64 data URL
}

export interface Restaurant {
  id: string;
  name: string;
  menuItems: MenuItem[];
}
