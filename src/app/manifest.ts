import type { MetadataRoute } from 'next'

// Web App Manifest — icon "Add to Home Screen" trên Android Chrome (iOS dùng apple-icon.png)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HAST — Sổ công tác & Kho hàng',
    short_name: 'HAST',
    description: 'Hệ thống quản lý giao việc, kho hàng, bảo trì và giám định',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e3a8a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
