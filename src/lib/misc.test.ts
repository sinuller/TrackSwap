import { describe, expect, it } from 'vitest';
import { abxPValue } from './stats';
import { de } from './locales/de';
import { en } from './locales/en';

describe('abxPValue', () => {
  it('matches the binomial distribution', () => {
    expect(abxPValue(12, 16)).toBeCloseTo(0.0384, 4);
    expect(abxPValue(16, 16)).toBeCloseTo(1 / 65536, 10);
    expect(abxPValue(8, 16)).toBeCloseTo(0.5982, 4);
    expect(abxPValue(0, 10)).toBeCloseTo(1, 10);
    expect(abxPValue(0, 0)).toBe(1);
  });
});

describe('translations', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('German and English define the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it('use the same placeholders in both languages', () => {
    for (const key of Object.keys(de) as (keyof typeof de)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(de[key]));
    }
  });
});
