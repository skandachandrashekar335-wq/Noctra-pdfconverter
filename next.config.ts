import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

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
