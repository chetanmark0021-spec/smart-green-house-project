import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never forward the server-side key from SUPABASE_PUBLISHABLE_KEY here.
  // The browser receives the separate, intentionally public publishable key.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "https://wclsupskijbczcwocmze.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_TQFVK7KytP0H-x_3yylRjQ_8wMcWO3u",
    NEXT_PUBLIC_DISEASE_API_URL:
      process.env.NEXT_PUBLIC_DISEASE_API_URL ||
      process.env.DISEASE_API_URL ||
      "https://smart-greenhouse-api-fs0j.onrender.com",
    NEXT_PUBLIC_GREENHOUSE_DEVICE_ID:
      process.env.NEXT_PUBLIC_GREENHOUSE_DEVICE_ID ||
      process.env.GREENHOUSE_DEVICE_ID || "greenhouse-esp32-s3-01",
  },
  /* config options here */
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
