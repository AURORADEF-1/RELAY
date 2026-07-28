import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ricoeurope.com",
      },
    ],
  },
};

export default nextConfig;
