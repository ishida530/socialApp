import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// EPIC 10 TASK-10.3 (Design Critic, 2026-09-15) - a real WCAG AA contrast bug was found by hand
// during the audit: `bg-destructive text-destructive-foreground` (used for the filled "Usuń
// konto"/"Wyłącz 2FA" buttons on app/account/page.tsx) computed to ~2.9:1 in dark mode and ~4.3:1
// in light mode - both below the 4.5:1 AA threshold for normal text. Fixed by darkening
// `--destructive` in :root and darkening `--destructive-foreground` in .dark (see
// styles/theme.css). This test parses the ACTUAL theme.css file (not a hardcoded copy of the
// values) so a future token edit that reintroduces a contrast failure fails CI, not just this
// one-time hand calculation.

const THEME_CSS_PATH = join(__dirname, '../../styles/theme.css');

function parseThemeBlock(css: string, selector: string): Record<string, string> {
  const blockMatch = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  if (!blockMatch) {
    throw new Error(`Could not find ${selector} block in theme.css`);
  }

  const vars: Record<string, string> = {};
  const varPattern = /--([\w-]+):\s*(#[0-9a-fA-F]{6});/g;
  let match: RegExpExecArray | null;
  while ((match = varPattern.exec(blockMatch[1])) !== null) {
    vars[match[1]] = match[2];
  }
  return vars;
}

function hexToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * hexToLinear(r) + 0.7152 * hexToLinear(g) + 0.0722 * hexToLinear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;

// The foreground/background token pairs actually used together as text-on-background in the app
// (e.g. `bg-card text-card-foreground`, `bg-primary text-primary-foreground`).
const TEXT_BACKGROUND_PAIRS: Array<[foreground: string, background: string]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['destructive-foreground', 'destructive'],
  ['sidebar-foreground', 'sidebar'],
];

const themeCss = readFileSync(THEME_CSS_PATH, 'utf-8');
const rootVars = parseThemeBlock(themeCss, ':root');
const darkVars = parseThemeBlock(themeCss, '\\.dark');

describe('theme.css color contrast (WCAG AA, 2026-09-15 audit)', () => {
  describe.each([
    ['light (:root)', rootVars],
    ['dark (.dark)', darkVars],
  ])('%s', (_label, vars) => {
    it.each(TEXT_BACKGROUND_PAIRS)('%s on %s meets 4.5:1', (fgName, bgName) => {
      const fg = vars[fgName];
      const bg = vars[bgName];
      expect(fg, `--${fgName} not found`).toBeDefined();
      expect(bg, `--${bgName} not found`).toBeDefined();

      const ratio = contrastRatio(fg, bg);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  });
});
