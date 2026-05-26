import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
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
      <body className={`${inter.variable} ${geist.variable} antialiased`}>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
