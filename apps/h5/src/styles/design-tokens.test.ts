import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const stylesDir = path.dirname(fileURLToPath(import.meta.url));

function readStyle(file: string): string {
  return readFileSync(path.join(stylesDir, file), 'utf8');
}

const tokens = readStyle('tokens.css');
const base = readStyle('base.css');
const components = readStyle('components.css');

function tokenValue(name: string): string {
  const match = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) {
    throw new Error(`token --${name} not found`);
  }
  return (match[1] as string).trim();
}

/** WCAG 相对亮度。 */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const raw = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

describe('typography tokens (spec §8.2)', () => {
  test('body text is 16px with a ~1.65 line height', () => {
    expect(tokenValue('font-size-body')).toBe('16px');
    expect(Number.parseFloat(tokenValue('line-height-body'))).toBeCloseTo(1.65, 2);
  });

  test('no body-level token drops below the 12px floor', () => {
    for (const name of [
      'font-size-body',
      'font-size-title',
      'font-size-card-title',
      'font-size-label',
      'font-size-meta',
    ]) {
      expect(Number.parseInt(tokenValue(name), 10)).toBeGreaterThanOrEqual(12);
    }
  });

  test('the font stack leads with the Chinese system faces the spec names', () => {
    expect(tokenValue('font-family-base')).toMatch(/^'PingFang SC'/);
    expect(tokenValue('font-family-base')).toContain('Microsoft YaHei');
    expect(tokenValue('font-family-base')).toContain('Noto Sans SC');
  });
});

describe('colour contrast (spec §8.1, WCAG AA)', () => {
  const surface = tokenValue('color-surface');
  const bg = tokenValue('color-bg');

  test('body text clears 4.5:1 on both surface and page background', () => {
    const text = tokenValue('color-text');
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('muted text clears 4.5:1 on both surface and page background', () => {
    const muted = tokenValue('color-text-muted');
    expect(contrast(muted, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test('text on the brand fill clears 4.5:1', () => {
    expect(
      contrast(tokenValue('brand-on-primary'), tokenValue('brand-primary')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  test('body text on the user bubble tint clears 4.5:1', () => {
    expect(
      contrast(tokenValue('color-text'), tokenValue('brand-primary-tint')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  test('semantic status colours clear 4.5:1 on their surfaces', () => {
    expect(
      contrast(tokenValue('color-danger'), tokenValue('color-danger-surface')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(tokenValue('color-warning'), tokenValue('color-warning-surface')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokenValue('color-success'), surface)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  test('the focus ring clears the 3:1 non-text minimum against both backdrops', () => {
    const focus = tokenValue('color-focus');
    expect(contrast(focus, surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(focus, bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('touch, safe area and motion (spec §8.4, §9)', () => {
  test('the shared touch-target token is at least 44px', () => {
    expect(Number.parseInt(tokenValue('tap-target-min'), 10)).toBeGreaterThanOrEqual(
      44,
    );
  });

  test('safe-area insets are wired to env()', () => {
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(tokenValue(`safe-${side}`)).toContain(`env(safe-area-inset-${side}`);
    }
  });

  test('micro-interaction durations stay within 150–250ms', () => {
    for (const name of ['motion-fast', 'motion-base', 'motion-slow']) {
      const ms = Number.parseInt(tokenValue(name), 10);
      expect(ms).toBeGreaterThanOrEqual(150);
      expect(ms).toBeLessThanOrEqual(250);
    }
  });

  test('reduced motion is honoured globally', () => {
    expect(base).toContain('prefers-reduced-motion: reduce');
    expect(base).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  test('focus is made visible rather than removed', () => {
    expect(base).toContain(':focus-visible');
    expect(base).not.toMatch(/outline:\s*none/);
  });

  test('the fixed composer and header reserve the device safe area', () => {
    expect(components).toContain('calc(var(--space-2) + var(--safe-bottom))');
    expect(components).toContain('calc(var(--space-2) + var(--safe-top))');
  });

  test('the layout uses dynamic viewport height instead of 100vh', () => {
    expect(components).toContain('100dvh');
    expect(components).not.toContain('100vh');
  });
});
