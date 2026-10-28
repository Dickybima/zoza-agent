import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `npm run build` emits a plain HTML/CSS/JS site in `out/`
  output: "export",
  // emit /explore/index.html etc. so every menu page works on any static host
  trailingSlash: true,
  // cacheComponents/PPR is not supported together with `output: "export"`
  images: { unoptimized: true },
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
