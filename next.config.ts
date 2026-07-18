import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
