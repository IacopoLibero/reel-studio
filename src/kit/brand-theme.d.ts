/**
 * The brand a render is made for: brand/<slug>/brand.json, picked by remotion.config.ts (REEL_BRAND, else the first brand,
 * else brand/_template). Only the fields the kit reads are typed here; brand.json has more.
 */
declare module "brand-theme" {
  const brand: {
    slug: string;
    name: string;
    website: string;
    colors: { background: string; text: string; accent: string; secondary: string };
    fonts: { headline: string; body: string };
    closing: { A: { label: string; line: string }; B: { label: string; line: string } };
  };
  export default brand;
}
