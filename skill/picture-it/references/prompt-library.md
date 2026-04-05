# Prompt Library

Tested prompts that produce professional results. Copy and adapt these — don't start from scratch.

## Table of Contents

1. Generation Prompts (flux-dev / flux-schnell)
2. Text-Behind-Subject Prompts (seedream)
3. Background Replacement Prompts (banana-pro)
4. Atmosphere & Post-Edit Prompts (seedream)
5. Anti-Patterns — Prompts That Don't Work

---

## 1. Generation Prompts

These go with `picture-it generate --model flux-dev`. Use flux-dev ($0.03) when quality matters, flux-schnell ($0.003) for backgrounds and drafts.

### Sports / Action Photography

```
Dramatic sports magazine cover photography. A [athlete type] [action pose], wearing [clothing]. Shot from low angle looking up making them look powerful. Intense facial expression of determination. Background is a [venue] with dramatic [color] and [color] stadium lights creating lens flares and bokeh. Motion blur on the background, subject is tack sharp. Dust particles visible in the lights. Shot on Canon R5 70-200mm f2.8, sports photography, high speed flash freezing the action.
```

### Editorial Portrait

```
High fashion editorial portrait photograph. A striking [person description] wearing [clothing], looking directly at camera with intense gaze. Shot against a solid deep [color] background. Studio lighting with strong key light from upper right creating dramatic shadows on the face. Shot on medium format Hasselblad, shallow depth of field, sharp on the eyes. Vogue magazine cover style, high contrast, editorial beauty photography.
```

### Sci-Fi / Epic Scene

```
Epic Christopher Nolan style science fiction scene. A lone astronaut standing on [surface description], looking up at [massive celestial object] in the sky. [Describe the object in detail — size, color, light effects]. The planet surface is [terrain description]. In the far distance, [dramatic structure or feature]. The astronaut is small against the cosmic scale. [Atmospheric effects — dust, fog, particles]. Color palette: [3-4 specific colors]. Shot like IMAX 70mm film, extreme wide angle showing the vast scale.
```

### Product Photography Background

```
Premium product photography background, [gradient description — e.g. "smooth dark gradient from cool deep blue on left to warm amber orange on right"], subtle glossy reflective surface at the bottom creating mirror reflections, no objects, just the background and reflective floor, premium Apple keynote style, clean minimal [light/dark] environment.
```

### Baroque / Classical Art

```
[Style] oil painting in the style of [artist]. A dramatic [scene type] of [subjects]. [Describe figures, their poses, clothing, and interactions]. Rich [color] and [color] fabric draping. [Props and objects]. Dramatic Caravaggio chiaroscuro lighting from [direction]. The figures are spread across a [wide/vertical] frame in a dynamic composition. Oil painting, museum masterpiece quality, warm rich earth tones.
```

### Abstract / Modern

```
[Object type — e.g. "Single hyper-detailed impossible chrome sculpture"] floating in dark void. [Material description — e.g. "simultaneously liquid mercury and polished chrome"]. Surface is mirror-reflective, catching iridescent [colors] light from unseen sources. [Shape description]. Subtle caustic light patterns cast onto the dark background. Minimal composition, single object centered, lots of dark negative space. Octane render, 8K, photorealistic [material] shader, dark charcoal background.
```

---

## 2. Text-Behind-Subject Prompts

The most impactful technique. Use with `picture-it edit --model seedream`. The key phrase is **"BEHIND the [subject] — the [subject's] body overlaps and partially covers the letters."**

### Large Title Behind Person

```
Add the word '[TEXT]' in very large bold [color] block capital letters BEHIND the [subject description]. The [subject's] body overlaps and partially covers the letters, proving the text is behind [them]. The text spans the full width of the image, very large, filling [portion of frame]. Bold condensed sans-serif font, solid [color]. Keep the [subject], [key elements], and [lighting] exactly the same. The text-behind-subject creates cinematic depth.
```

### Split Text (Word on Each Side)

```
Add large bold text to this photo. The word '[WORD1]' in massive bold [color] block letters on the LEFT side of the image, BEHIND the [subject] — the [subject's] body overlaps and partially covers the text, proving the text is behind [them]. The word '[WORD2]' in the same massive bold [color] block letters on the RIGHT side, also BEHIND the [subject]. The letters should be very large, filling most of the vertical space. Bold condensed sans-serif font, solid [color] with slight texture. Keep the [subject], lighting, and scene exactly the same.
```

### Sci-Fi / Movie Title

```
Add the movie title '[TITLE]' in very large bold futuristic sci-fi capital letters positioned in the lower third of the image, BEHIND the [subject] — the [subject's] body overlaps and partially covers some letters. The font should be wide, thin, futuristic — like Interstellar or Arrival movie titles. Clean [color] letters with subtle glow from the [light source] hitting the edges of the text. The text spans nearly the full width. Keep everything else exactly the same.
```

### Product Text Behind Object

```
Add '[TEXT]' as large bold text behind the [product] so the [product] overlaps it, creating a 3D depth illusion.
```

---

## 3. Background Replacement Prompts

Use with `picture-it edit --model banana-pro` ($0.15). Banana-pro preserves subjects best.

### Realistic Location Change

```
Take Figure 1 and replace ONLY the background. Keep the [subject description] PERFECTLY identical — same pose, clothing, face, [key details].

New background: [Describe realistic location in detail — specific place type, time of day, lighting conditions]. Natural [warm/cool] [time of day] light matching realistic conditions — [describe lighting]. Clean [ground surface type]. The setting should look COMPLETELY NATURAL and REALISTIC like the photo was actually taken there. No dramatic effects. Photorealistic.
```

**Critical:** Be specific about the location being realistic and matching the original lighting. Vague prompts like "nice background" produce obviously fake results.

### What works vs what doesn't for background replacement:

- "modern upscale Indian mall entrance during daytime, natural warm daylight" → Looks real
- "downtown city at golden hour sunset, glass skyscrapers" → Looks fake, over-dramatic  
- "city at night with neon reflections on wet roads" → Looks very fake, like bad Photoshop

---

## 4. Atmosphere & Post-Edit Prompts

Use with `picture-it edit --model seedream` ($0.04). Add these AFTER the base scene is generated.

### Volumetric Fog

```
Add thick volumetric fog and mist rolling across the ground at the [bottom third / floor level] of the scene. The fog catches the [color] light from [light source] and the [color] light from [other source], creating beautiful color mixing in the mist. [Subject's] legs are partially obscured by the fog. Keep everything else exactly the same — [list key elements to preserve]. Just add atmospheric ground fog.
```

### Volumetric Light Shafts

```
Add thick volumetric golden light shafts [streaming through windows / pouring from above]. Visible god rays with dust particles dancing in them. Add low atmospheric fog at [floor/ground] level. Deepen all shadows to near black in the corners. Keep all [figures/objects] and [architecture/scene] identical, only add atmosphere and dramatic lighting.
```

### Key phrase to preserve the scene:

Always end atmosphere edits with: **"Keep everything else exactly the same — [list specific things]. Only add [what you're adding]."**

---

## 5. Anti-Patterns — Prompts That Don't Work

### Too vague
- "Make it look cool" → AI makes random changes
- "Improve the lighting" → Unpredictable results
- "Add some text" → Wrong font, wrong size, wrong placement

### Missing preservation instruction
- Forgetting "keep everything else identical" → AI changes things you wanted preserved
- Not listing specific elements to keep → Key details get altered

### Wrong model for the job
- Using `edit` for product photos → Details get altered. Use `remove-bg` + `compose` instead
- Using `flux-schnell` for hero images → Quality is noticeably worse. Use `flux-dev`
- Using `banana-pro` when `seedream` works → Wasting money ($0.15 vs $0.04)

### Over-dramatic backgrounds for "realistic" edits
- Night city with neon for a casual photo → Looks fake
- Golden hour with skyscrapers → Over-processed feel
- Any dramatic lighting change on a daytime photo → Lighting mismatch gives it away

### Text prompts that fail
- "Add text saying..." without specifying BEHIND vs ON TOP → Random placement
- Not specifying font style → AI picks randomly
- Not specifying the text should be "large" or "bold" → Tiny unreadable text
