// Weekly Hachayol v2. Published at https://yeidelmanth.github.io/resources/v2/
// (set SITE_BASE to change where it lives, e.g. SITE_BASE=/ for a site of its own).
import { defineConfig } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL || "https://yeidelmanth.github.io",
  base: process.env.SITE_BASE || "/resources/v2",
  trailingSlash: "always",
  build: { format: "directory" },
  // keep quotes and dots exactly as typed (no automatic “smart” quotes)
  markdown: { smartypants: false },
});
