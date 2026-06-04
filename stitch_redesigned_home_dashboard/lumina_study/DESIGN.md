---
name: Lumina Study
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#cfc2d6'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#988d9f'
  outline-variant: '#4d4354'
  surface-tint: '#ddb7ff'
  primary: '#ddb7ff'
  on-primary: '#490080'
  primary-container: '#b76dff'
  on-primary-container: '#400071'
  inverse-primary: '#842bd2'
  secondary: '#4fdbc8'
  on-secondary: '#003731'
  secondary-container: '#04b4a2'
  on-secondary-container: '#003f38'
  tertiary: '#ffb0cd'
  on-tertiary: '#640039'
  tertiary-container: '#f751a1'
  on-tertiary-container: '#570032'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#f0dbff'
  primary-fixed-dim: '#ddb7ff'
  on-primary-fixed: '#2c0051'
  on-primary-fixed-variant: '#6900b3'
  secondary-fixed: '#71f8e4'
  secondary-fixed-dim: '#4fdbc8'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005048'
  tertiary-fixed: '#ffd9e4'
  tertiary-fixed-dim: '#ffb0cd'
  on-tertiary-fixed: '#3e0022'
  on-tertiary-fixed-variant: '#8c0053'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  section-gap: 48px
---

## Brand & Style

The design system is centered on a **Premium Glassmorphic** aesthetic, tailored for high-performance students who value focus and digital elegance. The personality is "Intellectual Futurism"—combining the depth of a dark-mode obsidian interface with the vibrant energy of neon accents. 

Visual hierarchy is established through translucency and light. Surfaces should feel like etched glass floating over a deep, atmospheric void. The emotional goal is to reduce cognitive load through a spacious, organized layout while keeping the user motivated through "gamified" neon highlights and glow effects that signify progress and achievement.

## Colors

The palette utilizes a "Deep Space" foundation to minimize eye strain during long study sessions.
- **Primary (Neon Purple):** Used for primary calls-to-action, active navigation states, and brand-critical elements.
- **Secondary (Teal):** Dedicated to success states, completion percentages, and "positive" progress indicators.
- **Tertiary (Pink):** Employed for highlights, streaks, and high-energy notifications to create visual variety.
- **Neutrals:** The background is a mix of absolute obsidian (#020617) and deep navy tints to create environmental depth.

**Glass Effect:** All container surfaces use a low-opacity white fill (5-8%) paired with a heavy backdrop-blur (20px-40px). Borders should be thin (1px) and use a linear gradient from `border_subtle` to a semi-transparent version of the primary or tertiary color.

## Typography

This design system uses **Plus Jakarta Sans** for headlines to provide a friendly yet geometric modern look. **Inter** is used for all functional body and label text due to its exceptional legibility on dark backgrounds at small sizes.

For high-end feel:
- Use `headline-xl` for user greetings or main page titles.
- Use `label-sm` with 5% letter spacing for overlines or small categories.
- Text colors should primarily be White (#FFFFFF) for headers and Slate-400 (#94A3B8) for secondary body text to maintain contrast ratios without being jarring.

## Layout & Spacing

The layout follows a **Fluid Grid** model with generous safe areas to ensure a "spacious" and high-end feel. 
- **Mobile:** 4-column grid with 24px side margins.
- **Desktop:** 12-column grid with a max-width of 1280px.

Spacing relies on a strict 8px base unit. Group related items (like cards in a category) with `stack-md`, while separating distinct sections (like "Today's Focus" vs "Subjects") with `section-gap`. Elements should never feel cramped; when in doubt, increase the vertical padding within cards.

## Elevation & Depth

Depth is not communicated through traditional drop shadows but through **Backdrop Blurs** and **Glow Tints**.

1.  **Level 0 (Base):** The dark obsidian background.
2.  **Level 1 (Cards):** Glassmorphic surfaces with `backdrop-filter: blur(24px)`. A 1px border with 10% white opacity is required to define the edge.
3.  **Level 2 (Modals/Popovers):** Increased blur (40px) and a subtle outer glow using the primary color at 5% opacity to simulate light emission.
4.  **Interactive Glow:** When an element is focused or active, it should emit a soft radial gradient glow of its accent color (e.g., Purple) behind the card surface.

## Shapes

The shape language is consistently "Rounded" to maintain an approachable, modern feel.
- **Default (Cards/Inputs):** 16px (1rem) corner radius.
- **Buttons/Large Containers:** 24px (1.5rem) corner radius for a softer, premium touch.
- **Badges/Chips:** Fully pill-shaped to contrast against the more structured card shapes.

## Components

### Buttons
- **Primary:** Gradient background (Purple to Pink), white text, 24px corner radius. Include a soft purple drop-shadow (blur: 15px, spread: -5px).
- **Secondary/Ghost:** 1px border using the accent color, transparent background with backdrop blur.

### Cards
- Standard containers use the glassmorphic style. 
- **Active State:** Add a 1px solid neon border of the category color and a 10% opacity inner glow.

### Progress Indicators
- **Circular:** Thick strokes (8px+) with rounded caps. Use a gradient for the active segment (Teal to Primary).
- **Linear:** High-contrast background track (rgba 255, 255, 255, 0.1) with a glowing neon fill.

### Input Fields
- Dark, semi-transparent fills. 
- On focus, the border transitions from `border_subtle` to a solid Neon Purple with a 4px outer glow.

### Charts & Analytics
- Use smooth Bezier curves for line charts. 
- Points of data should be "glowing" dots.
- Use gradients under line charts with a fade-to-transparent effect.