import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Đảm bảo template báo cáo được đóng gói khi deploy (Vercel serverless)
  outputFileTracingIncludes: {
    '/api/admin/bao-cao': ['./src/lib/report/template.docx'],
    '/api/admin/cong-no': ['./src/lib/report/bao-gia-template.docx'],
  },
};

export default nextConfig;
