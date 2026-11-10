// Picks each feature's shell: src/layouts/features/<feature id>.astro, else the default.
import Default from "../layouts/Spread.astro";
const own = import.meta.glob("../layouts/features/*.astro", { eager: true }) as Record<string, { default: any }>;
const byId = Object.fromEntries(Object.entries(own).map(([p, m]) => [p.split("/").pop()!.replace(/\.astro$/, ""), m.default]));
export const layoutFor = (feature: string) => byId[feature] ?? Default;
export const hasOwnLayout = (feature: string) => feature in byId;
