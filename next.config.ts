import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.metacritic.com",
        pathname: "/a/img/**",
      },
    ],
  },
};

export default nextConfig;
