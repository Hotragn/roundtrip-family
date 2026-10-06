# Roundtrip — brand and art direction

**Name:** Roundtrip. **Tagline:** Weekdays out, safely home.

**The idea: one family, many ways to travel.** A family's trips run by sky, rail, sea and road, and every one of them starts and ends at home. Each part of the website lives in one of those landscapes, rendered realistically and with restraint.

**The standard:** a premium travel brand. Think of how the best airline, rail and mapping products look: realistic imagery, calm layouts, precise type, confident whitespace. Nothing cartoonish, no clip-art vehicles, no playful rounded fonts, no flat illustrations of people.

**Voice:** warm, plain, sentence case. Name things the way a parent would ("I'm home", "Show the driver"). Errors give direction and never apologize. Never cute, never clinical, never pitying.

---

## Logo

**The mark: the family loop.** Two halves of one round trip: the parent's half (ink) and the child's half (sky) rise from a marigold home dot and end at two heads side by side, a larger parent and a smaller child. Read one way, it's a route that leaves home and returns; read the other, a parent and child together.

Files in `brand/`: `roundtrip-logo.svg`, `roundtrip-logo-dark.svg`, `roundtrip-mark.svg`, `roundtrip-mark-dark.svg`, `roundtrip-wordmark.svg`, `roundtrip-app-icon.svg`, `roundtrip-favicon.svg`, `roundtrip-travel-lines.svg`.

**Refinement before use:** the logo files are a starting concept. Refine them to a professional finish before building anything with them:
- Keep the concept and colors, but tighten the geometry: optically even stroke weights, precise curves, and balanced head sizes.
- Replace the drawn wordmark with "Roundtrip" set in Hind SemiBold, sentence case, carefully tracked and kerned, then converted to outlines.
- Show the result at 16, 32, 64 and 512 px on the `/design` page.

**Rules:** clear space of at least the parent head's diameter on every side; 28 px minimum height for the logo and 16 px for the favicon. Never swap the parent and child colors, separate the halves, or add effects. Generate the favicon set, PWA icons (192, 512 and maskable), the Apple touch icon and the 1200 × 630 social card from the refined SVGs.

---

## Color

**The story behind the palette: a letter home.** Roundtrip exists for parents far from home, so the colors are the materials of keeping in touch, not a software dashboard's grays. The base is warm cotton paper, like an aerogramme or the printed memory book. The neutrals are sandstone, the warm earth around Guntur, so lines and quiet surfaces feel made rather than generated. Text is indigo ink, the steady parent in the logo. Marigold, the flowers strung at a door, means home: it marks the one action that matters on a screen and nothing else. The journey colors (sky, rail, sea) belong to their page themes, and the two safety colors stay reserved. At night the paper turns to night-sky indigo, never black.

| Token | Hex | Role |
|---|---|---|
| `ink` | `#1F2A44` | Text, the parent in the logo |
| `sky` | `#3E9BE0` | The child in the logo, sky accents |
| `rail` | `#3B3F99` | Rail accents |
| `sea` | `#13A09A` | Sea accents |
| `bus` | `#F2A900` | Home, and the one main action per screen |
| `paper` | `#FAF8F4` | Base background: warm cotton paper |

**Accessible variants** (measured against white):

| Token | Hex | Contrast | Use |
|---|---|---|---|
| `sky-text` | `#1C6CB0` | 5.4:1 | Links and sky-colored text |
| `sky-line` | `#2F8AD2` | 3.6:1 | Sky lines and icons |
| `sea-text` | `#0B716C` | 5.7:1 | Sea-colored text |
| `sea-line` | `#119590` | 3.6:1 | Sea lines and icons |
| `rail` | `#3B3F99` | 8.7:1 | Text and lines |
| `ink` | `#1F2A44` | 13.9:1 | Body text |

- Text on `bus` is always ink (7.1:1). Never put marigold text on white.
- Brand `sky` and `sea` are for the logo and large imagery only, never for text.
- **Safety colors, reserved:** `signal` `#C8102E` for "I'm lost" only; `home-green` `#1E7B4F` for "I'm home" only.
- **Neutral scale** (sandstone): `#F3EFE7`, `#E7E1D6`, `#D2C9B9`, `#8F887B`, `#4F4C5A`, `#1F2A44`. Shadows are warm and diffused: raised `0 1px 2px rgba(41,35,26,.06), 0 8px 24px -6px rgba(41,35,26,.12)`, overlay `0 24px 60px -12px rgba(31,42,68,.24)`.
- **Dark theme:** background `#16203A` (night-sky indigo, never near-black), text `#E8ECF5`.

---

## Type

**Hind** for all Latin text and **Hind Guntur** for Telugu: two members of the same family by the Indian Type Foundry, free on Google Fonts. English and Telugu share one clean, professional voice, and the Telugu face is named after Guntur.

- **Weights:** Regular 400 for body text, Medium 500 for labels, SemiBold 600 for headings and buttons. Use Bold 700 only for the driver card's stop name.
- **Telugu:** a line height of about 1.6, so vowel signs and conjuncts never clip.
- **Scales.** Parents' app: body 22 px, ticket title 32 px, driver card stop name 64 px or larger. Dashboard: body 16 px; scale 13, 16, 20, 25, 31, 39 px. Landing headline: `clamp(44px, 6vw, 84px)`, SemiBold, tight tracking, left-aligned.
- **Other languages:** the matching Noto face for each script.
- **Avoid:** all-caps labels, eyebrow labels above headings, accenting one word in a headline, and arrows appended to button text.

---

## Page themes

Every page belongs to one way of traveling. The landscape is realistic and quiet, and the interface sits on clean white panels in front of it.

| Page | Theme | What you see | Scroll indicator (desktop) |
|---|---|---|---|
| Landing and how it works | **Sky** | A realistic, light morning sky with soft volumetric clouds. Scrolling moves the camera gently up through the clouds | A thin flight path along the top edge, with a small, realistically rendered aircraft as the handle |
| Dashboard (`/plan`) | **Rail** | A clean, light interface. A narrow band at the top shows a realistic railway line at golden hour, and route previews open as realistic maps | A railway track down the right edge, rendered realistically (crushed-stone ballast, steel rails, concrete sleepers), with a rendered train front as the handle |
| Safety and privacy | **Sea** | Calm, realistic open water with soft sun reflections | A slim waterline track with a rendered ferry as the handle |
| Parents' app (`/parents`) | **Road** | Clean white, no imagery, built for speed and clarity, at the polish of a top native app | None. Native scrolling, plus a precise stop countdown showing the route and their stop |
| Diary and memory book | **Home** | Warm, soft daylight tones, with a subtle paper feel in the memory book | None. Native scrolling |
| Style guide (`/design`) | All | Every theme, component and token | Each theme's indicator in its own section |

**How to build the realism (in the build session, not by hand):**
- **Sky:** three.js's physically based sky (the Sky addon) at a low morning sun, plus raymarched volumetric clouds, kept light: whites and pale blues.
- **Sea:** three.js's Water addon with CC0 water normal maps and a matching sky.
- **Rail:** a short procedural track: a ballast bed with a CC0 gravel PBR material, steel rails with a metallic material, and concrete sleepers. Light it with a CC0 HDRI.
- **Vehicles for the scroll handles:** build simple, well-proportioned realistic models (an aircraft, a train front, a ferry) from primitives with PBR materials, or use CC0 glTF models where available. **Bake each into a small transparent WebP** at 1x and 2x, rendered from a fixed angle. The live page uses the image, not live 3D.
- **Bake the scroll tracks too:** render the rail track and waterline once into tall, tileable WebP strips. Live WebGL is only for the landing sky and the dashboard's route previews.
- **Sources:** only CC0 assets, from Poly Haven (HDRIs, textures, models) and ambientCG (PBR materials). Record each asset and its license in `docs/assets.md`.

**Readability rule:** text never sits directly on imagery. It sits on white panels (95% or more opacity, with the raised shadow), so contrast is measured against white.

### Scroll indicators

- **Desktop only.** On devices with a precise pointer, the themed track replaces the visible scrollbar. The handle shows the position, can be dragged, and clicking the track jumps there. Keyboard, mouse-wheel and touch scrolling still work natively.
- **Touch devices** keep native scrolling, with only a thin progress line in the theme's accent color.
- **Accessibility:** the track is decorative (`aria-hidden`); native scrolling stays the accessible way to scroll. Handles move with transforms only, and without easing when reduced motion is on.
- **Back to top:** the theme's vehicle image, small, in the bottom corner.

---

## Travel lines in the interface

Tickets and route previews show each leg of a trip as a thin, precise line in its mode's style, like a professional transit map: sky as a fine dotted arc, rail as a line with subtle ties, sea as a gentle wave, bus as a solid line with stop markers (with a thin ink casing on white), and walking as a fine dotted line. Line weight 2 to 3 px in the interface. These are map glyphs, not illustrations.

---

## Layout

- **Parents' app:** one task per screen, left-aligned, one main action, and a fixed bottom bar: I'm home, Diary, I'm lost. Tap targets at least 56 px. Nothing requires typing. The quality bar is a top-tier native app.
- **Dashboard:** a calm planning board, like a professional productivity tool. The week runs left to right; suggestions show reason chips and their travel lines.
- **Landing page:** the realistic sky fills the hero. The headline "Weekdays out, safely home." sits left on a white panel, with one action: "See a week."

### System tokens

- **Spacing:** a 4 px base: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Radius by hierarchy:** 8 px for inputs and chips, 14 px for cards, 20 px for tickets.
- **Elevation:** two levels, with ink-tinted shadows. Raised: `0 1px 2px rgba(31,42,68,.08), 0 6px 16px rgba(31,42,68,.06)`. Overlay: `0 12px 40px rgba(31,42,68,.18)`.
- **Grid:** the dashboard uses 12 columns, 1200 px maximum, 24 px gutters. The parents' app uses a single 480 px column with 20 px margins.
- **Focus:** a 3 px `sky-text` outline, offset 2 px.

---

## The signature moment: the ticket stub

Each outing is a ticket: a clean card with its travel lines across the top and a perforated stub. When a parent taps **I'm home**, the stub separates along the perforation and settles stamped "Home" in home green, in about 500 ms, with a gentle haptic tap where supported. It should feel physical and precise, like real paper, not bouncy. With reduced motion on, it switches straight to the stamped state.

---

## Motion

- Motion answers an action: opening a ticket, the stub, a phrase playing, approving a suggestion.
- One orchestrated moment per page at most. On the landing page, it's the camera rising through the clouds on first load.
- Use calm, physical easing. No bouncing, no confetti, no wobble.
- Respect `prefers-reduced-motion` everywhere, with a still frame for every scene.

---

## 3D on the landing page and dashboard

- **Landing hero:** the realistic morning sky. On load, the camera rises slowly through the clouds, revealing the coastline of a town far below, with a faint flight path arcing toward it. It plays once, in about 4 seconds, then holds. Scrolling continues the gentle rise.
- **Dashboard route previews:** a realistic map of one outing's route with MapLibre, lazy-loaded when a suggestion opens. Tilt the camera gently to show 3D buildings, restyle the map in muted brand tones, and draw each leg as a clean line in its mode's style and color.

**Performance rules**
- Never any three.js in the parents' app.
- Lazy-load every scene. Cap the device pixel ratio at 1.5, render on demand once the intro finishes, and pause when offscreen.
- Compress textures (KTX2 or WebP) and models (glTF with Draco or Meshopt).
- Budget: the landing scene's assets under 2.5 MB, and the page interactive in under 3 seconds on a mid-range phone.
- Every scene has a still-image fallback for reduced motion, low-power devices and failed WebGL.

---

## Brand in use

**The one-page board:** `brand/brand-board.html`, built from the real logo, fonts, colors and art, rendered to `brand/brand-board.png`. Change a token or a file and re-render it; it never needs redrawing.

- **App icon and splash screen:** the refined family loop on an ink tile; the splash fades to the Today ticket.
- **Social card:** a still of the landing sky, with the logo and headline on a white panel.
- **AgentMail emails:** the logo, plain text, one marigold button, and no images that need loading to make sense.
- **Printed memory book:** white paper, ink, and Hind Guntur, with the mark small in the footer.

---

## Components

Build these as reusable components, and show every one on the living style guide at `/design`:

- **Parents' app:** `Ticket` with `TravelLines` and the `Stub`; `ListenButton`; `DriverCard`; `StopCountdown`; `PhraseCard`; `BottomBar`; `LostCard`; `FeelingChips`; `DiaryEntry`; `MemoryBookPage`.
- **Dashboard:** `WeekBoard` (drag and drop); `SuggestionCard` with `ReasonChips`, the fallback-ladder level and `TravelLines`; `RouteMap` (MapLibre); `PrivacyTable`; `SafetySettings`; `LanguageReadiness`.
- **Shared:** `ThemeShell` (sets a page's theme); `SkyScene`, `SeaScene` and `RailBand`; `Panel`; `ScrollTrack` with a baked vehicle handle; `ProgressLine`; `BackToTop`; `TravelLine`.

---

## Libraries

Use the latest stable version of each, and check its docs before relying on an API. Each library has one job; don't add a second library for the same job.

**Core**
| Need | Library |
|---|---|
| Framework | Next.js (App Router), React and TypeScript |
| Styling | Tailwind CSS, with every design token as a CSS variable |
| Fonts | `next/font` with Hind and Hind Guntur, self-hosted |

**Components**
| Need | Library |
|---|---|
| Component system | shadcn/ui on **Base UI**, the headless library from the Material UI team and shadcn's default since July 2026. Restyle every component to this brand; never ship shadcn's default look |
| Anything shadcn doesn't cover | Base UI directly, or React Aria Components for complex accessible widgets |
| Icons | Lucide, at a consistent 1.75 px stroke |
| Toasts, drawers, command palette | Sonner, Vaul and cmdk |
| Tables | TanStack Table |
| Charts | shadcn's chart components (built on Recharts) |
| Drag and drop | dnd-kit |
| Forms and validation | React Hook Form and Zod |
| Dates | date-fns, with Telugu, English and German locales |

**Don't add** Material UI's styled components, Chakra, Mantine or Ant Design alongside shadcn. A second styled kit brings a second styling engine and a different look, and breaks the brand.

**Motion and 3D**
| Need | Library |
|---|---|
| Interface motion | Motion (formerly Framer Motion), for component transitions and the ticket stub |
| Scroll-driven sequences | GSAP with ScrollTrigger, free including all plugins since 2025, for the landing camera and the scroll indicators |
| 3D | three.js through React Three Fiber and drei |
| Realistic scenes | three.js's Sky and Water addons, and pmndrs postprocessing for soft bloom, tone mapping and depth |
| 3D asset pipeline | glTF-Transform (Draco or Meshopt compression), KTX2 textures, and sharp for baking renders into WebP |

**Maps**
| Need | Library |
|---|---|
| Dashboard route previews | MapLibre GL JS with OpenFreeMap tiles: free, no API key, with 3D building shapes. Restyle the map to the brand palette, and show OpenStreetMap attribution |
| Parents' app | No map library. The stop countdown is a precise SVG diagram, so the app stays light and works offline |

**Data, languages and offline**
| Need | Library |
|---|---|
| Server state | TanStack Query |
| Languages | next-intl, with Telugu, English and German messages |
| Offline and installable | Serwist and a web app manifest |

**Quality**
| Need | Library |
|---|---|
| Tests | Vitest for units, Playwright for end-to-end, offline and visual checks |
| Accessibility checks | axe-core, run through Playwright on every page |
| Performance checks | Lighthouse CI on the parents' app and the landing page |

**Where each one runs**
- **Landing page:** three.js, React Three Fiber, GSAP and postprocessing, all lazy-loaded.
- **Dashboard:** shadcn, MapLibre (lazy-loaded when a route opens), TanStack Table, dnd-kit and cmdk.
- **Parents' app:** shadcn, Motion and Serwist only. No three.js, GSAP or MapLibre in its bundle.

---

## Quality bars

- **It must look like a real, premium product,** not a demo or a children's app. Compare every screen against the standard at the top of this guide, and against the best travel and mapping products you know. Refine anything that falls short.
- `/parents` on a mid-range phone: Lighthouse accessibility and performance of at least 90, with no three.js in its bundle.
- WCAG AA for text in both themes, and 3:1 for every meaningful line and icon.
- Visible keyboard focus and screen-reader labels on every control.
- Every screen in the parents' app works offline once the week is cached.
- Take screenshots of every screen during the build, review them against this guide, and fix what doesn't match.
