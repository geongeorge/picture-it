import { ZONES, type ZoneName, type AnchorPosition } from "./types.ts";

export function resolvePosition(
  zone: ZoneName | { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
  elementWidth: number,
  elementHeight: number,
  anchor: AnchorPosition = "center"
): { x: number; y: number } {
  let centerX: number;
  let centerY: number;

  if (typeof zone === "string") {
    const z = ZONES[zone];
    if (!z) throw new Error(`Unknown zone: ${zone}`);
    centerX = (z.x / 100) * canvasWidth;
    centerY = (z.y / 100) * canvasHeight;
  } else {
    // Raw percentages or pixels
    centerX = zone.x <= 100 && zone.x >= 0 ? (zone.x / 100) * canvasWidth : zone.x;
    centerY = zone.y <= 100 && zone.y >= 0 ? (zone.y / 100) * canvasHeight : zone.y;
  }

  // Adjust from center point to top-left based on anchor
  switch (anchor) {
    case "center":
      return {
        x: Math.round(centerX - elementWidth / 2),
        y: Math.round(centerY - elementHeight / 2),
      };
    case "top-left":
      return { x: Math.round(centerX), y: Math.round(centerY) };
    case "top-right":
      return {
        x: Math.round(centerX - elementWidth),
        y: Math.round(centerY),
      };
    case "bottom-left":
      return {
        x: Math.round(centerX),
        y: Math.round(centerY - elementHeight),
      };
    case "bottom-right":
      return {
        x: Math.round(centerX - elementWidth),
        y: Math.round(centerY - elementHeight),
      };
  }
}

export function resolveDimension(
  value: number | string | undefined,
  canvasSize: number,
  fallback: number
): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") return value;
  if (value.endsWith("%")) {
    return Math.round((parseFloat(value) / 100) * canvasSize);
  }
  return parseInt(value, 10) || fallback;
}
