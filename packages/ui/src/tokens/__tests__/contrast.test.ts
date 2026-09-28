import tokens from '../tokens.json';
import { contrastRatio } from '../contrast';

type Scheme = keyof typeof tokens.semantic;
type Name = keyof typeof tokens.semantic.light;

const AA_PAIRS: [Name, Name][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['textMuted', 'surface'],
  ['textMuted', 'background'],
  ['onPrimary', 'primary'],
  ['onAccent', 'accent'],
  ['onDanger', 'danger'],
  ['onSuccess', 'success'],
  ['onWarning', 'warning'],
  ['primary', 'surface'],
  ['danger', 'surface'],
];

describe('design tokens', () => {
  it('uses the brand colours', () => {
    expect(tokens.palette.navy['600']).toBe(tokens.semantic.light.primary);
    expect(tokens.palette.gold['400']).toBe(tokens.semantic.light.accent);
  });

  it('defines the same semantic names in light and dark', () => {
    expect(Object.keys(tokens.semantic.dark).sort()).toEqual(Object.keys(tokens.semantic.light).sort());
  });

  it('computes ratio 1 for identical colours', () => {
    expect(contrastRatio(tokens.semantic.light.surface, tokens.semantic.light.surface)).toBeCloseTo(1);
  });

  for (const scheme of ['light', 'dark'] as Scheme[]) {
    for (const [fg, bg] of AA_PAIRS) {
      it(`${scheme}: ${fg} on ${bg} meets WCAG AA (>= 4.5)`, () => {
        const c = tokens.semantic[scheme];
        expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('rejects non #RRGGBB input', () => {
    expect(() => contrastRatio('red', 'blue')).toThrow(/RRGGBB/);
  });
});
