import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // Hide the floating development indicator in `next dev`. Compile and
  // runtime errors still surface normally — this only removes the badge.
  devIndicators: false,

  images: {
    // Google profile photos (Google Sign-In) are served from
    // lh3.googleusercontent.com — allow them for next/image in the dashboard.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // These are Node.js-only native modules — stub them out so the browser
      // bundle doesn't try (and fail) to include them.
      // The pdf-converter.ts already uses OffscreenCanvas in the browser,
      // so the sharp code path is never reached client-side.
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
        sharp: false,
      };
    }
    return config;
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    resolveAlias: {
      // Stub Node-only packages in Turbopack browser bundles
      canvas: "./src/lib/stubs/canvas.ts",
      sharp: "./src/lib/stubs/sharp.ts",
    },
  },
};

export default nextConfig;
