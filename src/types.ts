// Core types for picture-it

export type TextRenderer = "satori-to-fal" | "fal-direct" | "satori-overlay";

export type FalModel =
  | "seedream"
  | "banana2"
  | "banana-pro"
  | "flux-dev"
  | "flux-schnell";

export type ColorGrade =
  | "cinematic"
  | "moody"
  | "vibrant"
  | "clean"
  | "warm-editorial"
  | "cool-tech";

export type DepthLayer =
  | "background"
  | "midground"
  | "foreground"
  | "overlay"
  | "frame";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay";

export type MaskShape =
  | "circle"
  | "rounded"
  | "hexagon"
  | "diamond"
  | "blob"
  | string; // custom SVG path

export type DeviceFrame = "iphone" | "macbook" | "browser" | "ipad";

export type AnchorPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type CropPosition =
  | "attention"
  | "entropy"
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | { left: number; top: number };

export type ZoneName =
  | "hero-center"
  | "title-area"
  | "top-bar"
  | "bottom-bar"
  | "left-third"
  | "right-third"
  | "top-left-safe"
  | "top-right-safe"
  | "bottom-left-safe"
  | "bottom-right-safe"
  | "center-left"
  | "center-right";

export interface Zone {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
}

export const ZONES: Record<ZoneName, Zone> = {
  "hero-center": { x: 50, y: 45 },
  "title-area": { x: 50, y: 75 },
  "top-bar": { x: 50, y: 8 },
  "bottom-bar": { x: 50, y: 92 },
  "left-third": { x: 25, y: 50 },
  "right-third": { x: 75, y: 50 },
  "top-left-safe": { x: 15, y: 12 },
  "top-right-safe": { x: 85, y: 12 },
  "bottom-left-safe": { x: 15, y: 88 },
  "bottom-right-safe": { x: 85, y: 88 },
  "center-left": { x: 30, y: 50 },
  "center-right": { x: 70, y: 50 },
};

// Overlay types

export interface ShadowConfig {
  blur: number;
  color: string;
  offsetX: number;
  offsetY: number;
  opacity?: number;
}

export interface GlowConfig {
  color: string;
  blur: number;
  spread: number;
}

export interface ReflectionConfig {
  opacity: number;
  fadeHeight: number; // percentage 0-100
}

export interface ImageOverlay {
  type: "image";
  src: string;
  zone?: ZoneName | { x: number; y: number };
  width?: number | string; // pixels or "50%"
  height?: number | string;
  anchor?: AnchorPosition;
  opacity?: number;
  borderRadius?: number;
  shadow?: ShadowConfig | "auto";
  glow?: GlowConfig;
  reflection?: ReflectionConfig;
  rotation?: number;
  mask?: MaskShape;
  deviceFrame?: DeviceFrame;
  depth?: DepthLayer;
}

export interface SatoriTextOverlay {
  type: "satori-text";
  jsx: SatoriJSX;
  zone?: ZoneName | { x: number; y: number };
  width?: number;
  height?: number;
  anchor?: AnchorPosition;
  opacity?: number;
  depth?: DepthLayer;
}

export interface ShapeOverlay {
  type: "shape";
  shape: "rect" | "circle" | "line" | "arrow";
  zone?: ZoneName | { x: number; y: number };
  width?: number;
  height?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  opacity?: number;
  // Arrow-specific
  from?: { x: number; y: number };
  to?: { x: number; y: number };
  headSize?: number;
  curve?: number;
  depth?: DepthLayer;
}

export interface GradientOverlay {
  type: "gradient-overlay";
  gradient: string; // CSS gradient string
  opacity?: number;
  blend?: BlendMode;
  depth?: DepthLayer;
}

export interface WatermarkOverlay {
  type: "watermark";
  src: string;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  margin?: number;
  opacity?: number;
  size?: number;
  depth?: DepthLayer;
}

export type Overlay =
  | ImageOverlay
  | SatoriTextOverlay
  | ShapeOverlay
  | GradientOverlay
  | WatermarkOverlay;

// Satori JSX tree (simplified representation for JSON plans)
export interface SatoriJSX {
  tag: string;
  props?: Record<string, unknown>;
  children?: (SatoriJSX | string)[];
}

// FAL step in the plan
export interface FalStep {
  model: FalModel;
  prompt: string;
  inputImages?: string[];
  textInScene?: string[];
  removeBackgrounds?: string[];
  resolution?: "0.5K" | "1K" | "2K" | "4K";
  sizeStrategy:
    | { width: number; height: number }
    | { aspectRatio: string; resolution: string };
  focalPoint?: CropPosition;
  skip?: boolean;
  fallbackBg?: string;
  estimatedCost?: string;
  reasoning?: string;
  thinkingLevel?: "minimal" | "high";
  webSearch?: boolean;
}

export interface BlendLayer {
  prompt: string;
  aspectRatio?: string;
  opacity: number;
  blend: BlendMode;
}

// The full composition plan (output of planner)
export interface CompositionPlan {
  width: number;
  height: number;
  falStep: FalStep;
  blendLayers?: BlendLayer[];
  overlays: Overlay[];
  colorGrade?: ColorGrade;
  grain?: boolean;
  vignette?: boolean;
  satoriPreRenders?: SatoriPreRender[];
}

export interface SatoriPreRender {
  id: string;
  jsx: SatoriJSX;
  width: number;
  height: number;
  figureNumber: number;
}

// Asset analysis result
export interface AssetAnalysis {
  path: string;
  filename: string;
  width: number;
  height: number;
  aspectRatio: number;
  hasTransparency: boolean;
  dominantColors: string[];
  contentType: "icon" | "logo" | "screenshot" | "avatar" | "cutout" | "photo";
}

// Platform presets
export interface PlatformPreset {
  width: number;
  height: number;
  safeZone: string;
  minHeading?: number;
  defaultGrade?: ColorGrade;
  notes?: string;
}

// Style presets
export interface StylePreset {
  falPromptStyle: string;
  font: string;
  defaultGrade: ColorGrade;
  glowDefault?: string;
}

// Config
export interface PictureItConfig {
  fal_key?: string;
  anthropic_api_key?: string;
  default_model?: FalModel;
  default_platform?: string;
  default_grade?: ColorGrade;
}

// Review result
export interface ReviewResult {
  score: number;
  composition: number;
  textReadability: number;
  assetPlacement: number;
  colorHarmony: number;
  overallQuality: number;
  falTextAccuracy: number;
  corrections?: {
    correctedOverlays?: Overlay[];
    retryFal?: boolean;
    correctedFalPrompt?: string;
    modelUpgrade?: FalModel;
  };
}

// Batch spec entry
export interface BatchEntry {
  id: string;
  mode: "create" | "template" | "compose";
  prompt?: string;
  assets?: string[];
  platform?: string;
  style?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  bg?: string;
  overlays?: Overlay[];
  size?: string;
  output?: string;
}
