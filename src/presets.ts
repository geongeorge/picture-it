import type { PlatformPreset, StylePreset, ColorGrade } from "./types.ts";

export const PLATFORM_PRESETS: Record<string, PlatformPreset> = {
  "blog-featured": {
    width: 1200,
    height: 630,
    safeZone: "10% inset all sides",
    minHeading: 48,
    defaultGrade: "cinematic",
  },
  "blog-inline": {
    width: 800,
    height: 450,
    safeZone: "5% inset",
  },
  "og-image": {
    width: 1200,
    height: 630,
    safeZone: "key content within center 1000x500",
  },
  "twitter-header": {
    width: 1500,
    height: 500,
    safeZone: "center 60% only (sides crop on mobile)",
  },
  "instagram-square": {
    width: 1080,
    height: 1080,
    safeZone: "10% inset, avoid bottom 15%",
  },
  "instagram-story": {
    width: 1080,
    height: 1920,
    safeZone: "avoid top 15% and bottom 20%",
  },
  "linkedin-post": {
    width: 1200,
    height: 627,
    safeZone: "similar to OG",
  },
  "youtube-thumbnail": {
    width: 1280,
    height: 720,
    safeZone: "avoid bottom-right 20% (duration badge)",
    notes: "High contrast required, text readable at small size",
  },
  "shopify-app-listing": {
    width: 1200,
    height: 628,
    safeZone: "10% inset",
  },
};

export const STYLE_PRESETS: Record<string, StylePreset> = {
  "dark-tech": {
    falPromptStyle:
      "deep purple/blue tones, neon accents, particle dust, tech atmosphere",
    font: "Space Grotesk",
    defaultGrade: "cinematic",
    glowDefault: "derive from asset dominant color",
  },
  "minimal-light": {
    falPromptStyle: "clean white/soft gray, subtle shadows, airy, bright",
    font: "Inter",
    defaultGrade: "clean",
  },
  "gradient-mesh": {
    falPromptStyle: "vibrant multi-color mesh gradients, bold saturated",
    font: "Space Grotesk",
    defaultGrade: "vibrant",
  },
  editorial: {
    falPromptStyle: "muted earth tones, textured paper, sophisticated",
    font: "DM Serif Display",
    defaultGrade: "warm-editorial",
  },
  glassmorphism: {
    falPromptStyle: "frosted layers, translucent surfaces, soft blur",
    font: "Inter",
    defaultGrade: "cool-tech",
  },
};

export const DEPTH_ORDER: Record<string, number> = {
  background: 0,
  midground: 1,
  foreground: 2,
  overlay: 3,
  frame: 4,
};

export const AUTO_SHADOW: Record<string, { blur: number; offset: number; opacity: number }> = {
  midground: { blur: 10, offset: 4, opacity: 0.2 },
  foreground: { blur: 20, offset: 8, opacity: 0.3 },
  overlay: { blur: 4, offset: 2, opacity: 0.15 },
};

export const COLOR_GRADES: Record<ColorGrade, string> = {
  cinematic: "Slight teal shadows, warm highlights",
  moody: "Desaturated, crushed blacks",
  vibrant: "Boosted saturation, warmth",
  clean: "Slight sharpening only",
  "warm-editorial": "Golden tones, slight desat",
  "cool-tech": "Blue shift, high contrast",
};
