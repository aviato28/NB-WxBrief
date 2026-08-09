import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ship DejaVu with the map API so librsvg can render waypoint labels on Vercel.
  outputFileTracingIncludes: {
    "/api/briefing-map": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
