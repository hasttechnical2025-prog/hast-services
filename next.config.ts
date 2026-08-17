import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist (bóc tách PDF phiếu công tác) chạy ở Node runtime, KHÔNG cho bundler
  // đụng vào — nếu không turbopack/webpack sẽ vướng file worker .mjs. Để external ->
  // Next tải thẳng từ node_modules lúc chạy (và trace vào bundle serverless của Vercel).
  serverExternalPackages: ['pdfjs-dist'],
  // Đảm bảo template .docx được đóng gói cho từng serverless route đọc nó (Vercel).
  // Route đọc template bằng fs.readFileSync -> phải khai ở đây, nếu không Vercel không
  // bundle file và route sẽ lỗi "file not found" trên production.
  outputFileTracingIncludes: {
    '/api/admin/bao-cao': ['./src/lib/report/template.docx'],
    '/api/admin/bao-cao-ktv': ['./src/lib/report/bao-cao-ktv-template.docx'],
    '/api/admin/bao-gia': ['./src/lib/report/bao-gia-template.docx'],
    '/api/admin/thue-cpc/bang-ke/export': ['./src/lib/report/bang-ke-don-may.docx', './src/lib/report/bang-ke-da-may.docx'],
  },
};

export default nextConfig;
