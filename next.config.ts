import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    turbopackUseSystemTlsCerts: true,
  },
  // Existing video-editor bookmarks still work, including ?project= IDs.
  async redirects() {
    return [
      {
        source: '/tools/video-to-spritesheet',
        destination: '/tools/sprite-editor',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
