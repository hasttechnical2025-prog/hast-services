import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import "./globals.css";
import UpdateChecker from "@/components/UpdateChecker";
import NoPinchZoom from "@/components/NoPinchZoom";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-geist-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HAST — Sổ công tác & Kho hàng",
  description: "Hệ thống quản lý giao việc, kho hàng, bảo trì và giám định",
  // iOS: khi "Add to Home Screen" — chạy toàn màn hình, tên ngắn "HAST"
  appleWebApp: { capable: true, title: "HAST", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1e3a8a",
  // Chặn vuốt 2 ngón phóng to/thu nhỏ (Android + PWA iOS tôn trọng các cờ này)
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${beVietnam.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <NoPinchZoom />
        <UpdateChecker />
      </body>
    </html>
  );
}
