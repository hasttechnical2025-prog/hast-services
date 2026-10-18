import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono, Tinos } from "next/font/google";
import "./globals.css";
import UpdateChecker from "@/components/UpdateChecker";
import NoPinchZoom from "@/components/NoPinchZoom";
import NoKeyShortcuts from "@/components/NoKeyShortcuts";
import MaintenanceGate from "@/components/MaintenanceGate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Font cho v2 (chỉ áp qua .v2-shell trong globals.css); admin vẫn Inter.
// Tinos = bản web-safe của Times New Roman (metric-compatible), hỗ trợ tiếng Việt. Chỉ có 400/700.
const tinos = Tinos({
  variable: "--font-tinos",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HAST - Quản lý dịch vụ",
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
      className={`${inter.variable} ${geistMono.variable} ${tinos.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <NoPinchZoom />
        <NoKeyShortcuts />
        <MaintenanceGate />
        <UpdateChecker />
      </body>
    </html>
  );
}
