import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Spritesheet Creator | Video to Spritesheet Tool",
  description: "Convert videos to spritesheets with this free, client-side tool. No uploads, no servers - everything runs in your browser.",
  keywords: ["spritesheet", "video", "animation", "game development", "pixel art"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        {children}
      </body>
    </html>
  );
}
