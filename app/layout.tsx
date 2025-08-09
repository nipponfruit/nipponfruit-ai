// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// 端末のダークモードでも背景は白に固定
export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

const TITLE = "AIフルーツコンシェルジュ | NipponFruit";
const DESCRIPTION = "果物の食べ頃と保存をAIがかんたん提案。受取日・保存環境・気温帯から、最適な食べ頃と実践Tipsをお届けします。";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s | NipponFruit",
  },
  description: DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192" },
      { url: "/icon-512x512.png", sizes: "512x512" },
    ],
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nipponfruit-ai.vercel.app/",
    siteName: "NipponFruit",
    locale: "ja_JP",
    type: "website",
    images: [
      { url: "/ai-fruit-concierge.png", width: 1200, height: 630, alt: "AIフルーツコンシェルジュ" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/ai-fruit-concierge.png"],
  },
  applicationName: "AIフルーツコンシェルジュ",
  category: "utilities",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" style={{ colorScheme: "light" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white text-black min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}