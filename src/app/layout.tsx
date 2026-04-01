import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suvai - AR 3D Menu",
  description: "AR Reality 3D Menu for Restaurants",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#fcfcfc]">{children}</body>
    </html>
  );
}
