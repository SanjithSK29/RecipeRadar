import type { NextConfig } from "next";
const config: NextConfig = {
  // Allow production verification without replacing a running dev server's output.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default config;
