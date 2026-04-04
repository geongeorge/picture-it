import type { Overlay, CompositionPlan } from "../types.ts";

export interface TemplateResult {
  overlays: Overlay[];
  background: string; // CSS gradient
}

export type TemplateFunction = (
  data: Record<string, unknown>,
  width: number,
  height: number
) => TemplateResult;

export const TEMPLATES: Record<string, TemplateFunction> = {
  "vs-comparison": vsComparison,
  "feature-hero": featureHero,
  "text-hero": textHero,
  "social-card": socialCard,
};

function vsComparison(data: Record<string, unknown>, w: number, h: number): TemplateResult {
  const leftLogo = (data["leftLogo"] || data["left-logo"]) as string;
  const rightLogo = (data["rightLogo"] || data["right-logo"]) as string;
  const vsText = (data["vsText"] as string) || "VS";
  const glowLeft = (data["glowColorLeft"] || data["glow-color"] || "#7c3aed") as string;
  const glowRight = (data["glowColorRight"] || "#ef4444") as string;
  const leftLabel = data["leftLabel"] as string | undefined;
  const rightLabel = data["rightLabel"] as string | undefined;
  const bg = (data["background"] as string) || `linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)`;

  const logoSize = Math.round(Math.min(w, h) * 0.25);
  const overlays: Overlay[] = [];

  // Left logo
  if (leftLogo) {
    overlays.push({
      type: "image",
      src: leftLogo,
      zone: "left-third",
      width: logoSize,
      height: logoSize,
      anchor: "center",
      glow: { color: glowLeft, blur: 30, spread: 10 },
      shadow: "auto",
      depth: "foreground",
    });
  }

  // Right logo
  if (rightLogo) {
    overlays.push({
      type: "image",
      src: rightLogo,
      zone: "right-third",
      width: logoSize,
      height: logoSize,
      anchor: "center",
      glow: { color: glowRight, blur: 30, spread: 10 },
      shadow: "auto",
      depth: "foreground",
    });
  }

  // VS text
  overlays.push({
    type: "satori-text",
    jsx: {
      tag: "div",
      props: {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        },
      },
      children: [
        {
          tag: "span",
          props: {
            style: {
              fontSize: Math.round(h * 0.15),
              fontFamily: "Space Grotesk",
              fontWeight: 700,
              color: "white",
              textShadow: "0 0 40px rgba(255,255,255,0.3)",
              letterSpacing: "0.05em",
            },
          },
          children: [vsText],
        },
      ],
    },
    zone: "hero-center",
    width: Math.round(w * 0.2),
    height: Math.round(h * 0.3),
    anchor: "center",
    depth: "overlay",
  });

  // Labels
  if (leftLabel) {
    overlays.push({
      type: "satori-text",
      jsx: {
        tag: "div",
        props: {
          style: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
        },
        children: [{
          tag: "span",
          props: {
            style: {
              fontSize: Math.round(h * 0.04),
              fontFamily: "Inter",
              fontWeight: 600,
              color: "rgba(255,255,255,0.8)",
              textShadow: "0 2px 4px rgba(0,0,0,0.5)",
            },
          },
          children: [leftLabel],
        }],
      },
      zone: { x: 25, y: 75 },
      width: Math.round(w * 0.3),
      height: Math.round(h * 0.08),
      anchor: "center",
      depth: "overlay",
    });
  }

  if (rightLabel) {
    overlays.push({
      type: "satori-text",
      jsx: {
        tag: "div",
        props: {
          style: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" },
        },
        children: [{
          tag: "span",
          props: {
            style: {
              fontSize: Math.round(h * 0.04),
              fontFamily: "Inter",
              fontWeight: 600,
              color: "rgba(255,255,255,0.8)",
              textShadow: "0 2px 4px rgba(0,0,0,0.5)",
            },
          },
          children: [rightLabel],
        }],
      },
      zone: { x: 75, y: 75 },
      width: Math.round(w * 0.3),
      height: Math.round(h * 0.08),
      anchor: "center",
      depth: "overlay",
    });
  }

  return { overlays, background: bg };
}

function featureHero(data: Record<string, unknown>, w: number, h: number): TemplateResult {
  const logo = data["logo"] as string | undefined;
  const title = (data["title"] as string) || "";
  const subtitle = data["subtitle"] as string | undefined;
  const glowColor = (data["glowColor"] || data["glow-color"] || "#3b82f6") as string;
  const position = (data["position"] as string) || "center";
  const bg = (data["background"] as string) || `linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 100%)`;

  const overlays: Overlay[] = [];

  const xZone = position === "left" ? "center-left" : position === "right" ? "center-right" : "hero-center";

  if (logo) {
    const logoSize = Math.round(Math.min(w, h) * 0.3);
    overlays.push({
      type: "image",
      src: logo,
      zone: xZone as any,
      width: logoSize,
      height: logoSize,
      anchor: "center",
      glow: { color: glowColor, blur: 40, spread: 15 },
      shadow: "auto",
      depth: "foreground",
    });
  }

  // Title + subtitle grouped
  const textChildren: any[] = [
    {
      tag: "span",
      props: {
        style: {
          fontSize: Math.round(h * 0.08),
          fontFamily: "Space Grotesk",
          fontWeight: 700,
          color: "white",
          textShadow: "0 2px 10px rgba(0,0,0,0.5)",
          textAlign: "center",
        },
      },
      children: [title],
    },
  ];

  if (subtitle) {
    textChildren.push({
      tag: "span",
      props: {
        style: {
          fontSize: Math.round(h * 0.04),
          fontFamily: "Inter",
          fontWeight: 400,
          color: "rgba(255,255,255,0.7)",
          textShadow: "0 1px 4px rgba(0,0,0,0.5)",
          textAlign: "center",
          marginTop: 12,
        },
      },
      children: [subtitle],
    });
  }

  overlays.push({
    type: "satori-text",
    jsx: {
      tag: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        },
      },
      children: textChildren,
    },
    zone: "title-area",
    width: Math.round(w * 0.8),
    height: Math.round(h * 0.25),
    anchor: "center",
    depth: "overlay",
  });

  return { overlays, background: bg };
}

function textHero(data: Record<string, unknown>, w: number, h: number): TemplateResult {
  const title = (data["title"] as string) || "";
  const subtitle = data["subtitle"] as string | undefined;
  const badge = data["badge"] as string | undefined;
  const textColor = (data["textColor"] as string) || "white";
  const bg = (data["background"] as string) || `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`;

  const overlays: Overlay[] = [];
  const children: any[] = [];

  if (badge) {
    children.push({
      tag: "div",
      props: {
        style: {
          display: "flex",
          backgroundColor: "rgba(255,255,255,0.15)",
          borderRadius: 20,
          padding: "6px 16px",
          marginBottom: 16,
        },
      },
      children: [{
        tag: "span",
        props: {
          style: {
            fontSize: Math.round(h * 0.03),
            fontFamily: "Inter",
            fontWeight: 600,
            color: textColor,
          },
        },
        children: [badge],
      }],
    });
  }

  children.push({
    tag: "span",
    props: {
      style: {
        fontSize: Math.round(h * 0.1),
        fontFamily: "Space Grotesk",
        fontWeight: 700,
        color: textColor,
        textShadow: "0 2px 10px rgba(0,0,0,0.3)",
        textAlign: "center",
        lineHeight: 1.1,
      },
    },
    children: [title],
  });

  if (subtitle) {
    children.push({
      tag: "span",
      props: {
        style: {
          fontSize: Math.round(h * 0.04),
          fontFamily: "Inter",
          fontWeight: 400,
          color: textColor,
          opacity: 0.8,
          textAlign: "center",
          marginTop: 16,
        },
      },
      children: [subtitle],
    });
  }

  overlays.push({
    type: "satori-text",
    jsx: {
      tag: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
        },
      },
      children,
    },
    zone: "hero-center",
    width: Math.round(w * 0.8),
    height: Math.round(h * 0.7),
    anchor: "center",
    depth: "overlay",
  });

  return { overlays, background: bg };
}

function socialCard(data: Record<string, unknown>, w: number, h: number): TemplateResult {
  const title = (data["title"] as string) || "";
  const description = data["description"] as string | undefined;
  const logo = data["logo"] as string | undefined;
  const siteName = data["siteName"] as string | undefined;
  const authorName = data["authorName"] as string | undefined;
  const bg = (data["background"] as string) || `linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)`;

  const overlays: Overlay[] = [];

  // Logo in top-left
  if (logo) {
    overlays.push({
      type: "image",
      src: logo,
      zone: "top-left-safe",
      width: Math.round(h * 0.08),
      height: Math.round(h * 0.08),
      anchor: "top-left",
      depth: "overlay",
    });
  }

  const children: any[] = [];

  children.push({
    tag: "span",
    props: {
      style: {
        fontSize: Math.round(h * 0.08),
        fontFamily: "Space Grotesk",
        fontWeight: 700,
        color: "white",
        textShadow: "0 2px 8px rgba(0,0,0,0.4)",
        lineHeight: 1.2,
      },
    },
    children: [title],
  });

  if (description) {
    children.push({
      tag: "span",
      props: {
        style: {
          fontSize: Math.round(h * 0.035),
          fontFamily: "Inter",
          fontWeight: 400,
          color: "rgba(255,255,255,0.7)",
          marginTop: 12,
          lineHeight: 1.4,
        },
      },
      children: [description],
    });
  }

  const bottomParts: string[] = [];
  if (siteName) bottomParts.push(siteName);
  if (authorName) bottomParts.push(authorName);

  if (bottomParts.length > 0) {
    children.push({
      tag: "span",
      props: {
        style: {
          fontSize: Math.round(h * 0.03),
          fontFamily: "Inter",
          fontWeight: 600,
          color: "rgba(255,255,255,0.5)",
          marginTop: 24,
        },
      },
      children: [bottomParts.join(" · ")],
    });
  }

  overlays.push({
    type: "satori-text",
    jsx: {
      tag: "div",
      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: Math.round(w * 0.08),
          width: "100%",
          height: "100%",
        },
      },
      children,
    },
    zone: "hero-center",
    width: Math.round(w * 0.9),
    height: Math.round(h * 0.8),
    anchor: "center",
    depth: "overlay",
  });

  return { overlays, background: bg };
}

export function getTemplate(name: string): TemplateFunction | undefined {
  return TEMPLATES[name];
}
