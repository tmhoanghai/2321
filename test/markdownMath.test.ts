import { describe, it, expect } from 'vitest';
import { MATH_TOKEN_REGEX, protectMarkdownMath } from '../src/lib/markdownMath';

describe('protectMarkdownMath', () => {
  it('keeps inline LaTeX inside GFM tables and numbered headings intact without shattering rows', () => {
    const sample = [
      '1. Bảng giá trị mẫu (với $y = x^2$)',
      '| $x$ | -3 | -2 | -1 | 0 | 1 | 2 | 3 |',
      '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
      '| **$y = x^2$** | 9 | 4 | 1 | 0 | 1 | 4 | 9 |',
    ].join('\n');

    const { masked, tokens } = protectMarkdownMath(sample);

    expect(tokens).toEqual([
      { math: 'y = x^2', block: false },
      { math: 'x', block: false },
      { math: 'y = x^2', block: false },
    ]);

    const lines = masked.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^1\. Bảng giá trị mẫu \(với \uE000TMMATH0\uE001\)$/);
    expect(lines[1]).toBe('| \uE000TMMATH1\uE001 | -3 | -2 | -1 | 0 | 1 | 2 | 3 |');
    expect(lines[2]).toBe('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
    expect(lines[3]).toBe('| **\uE000TMMATH2\uE001** | 9 | 4 | 1 | 0 | 1 | 4 | 9 |');

    // Placeholder must contain zero Markdown punctuation (_, *, ~) so emphasis never breaks
    expect(masked).not.toContain('__');
  });

  it('preserves inline code spans, currency amounts, escaped dollars, and block $$...$$ math', () => {
    const input = 'Cost is $5 and $10, escaped \\$9, code `$HOME`, block $$\\int_0^1 x^2 dx$$ and inline $a+b$.';
    const { masked, tokens } = protectMarkdownMath(input);

    expect(masked).toContain('`$HOME`');
    expect(masked).toContain('$5 and $10');
    expect(masked).toContain('\\$9');
    expect(tokens).toEqual([
      { math: '\\int_0^1 x^2 dx', block: true },
      { math: 'a+b', block: false },
    ]);

    MATH_TOKEN_REGEX.lastIndex = 0;
    const matches = [...masked.matchAll(MATH_TOKEN_REGEX)];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe('BLK');
    expect(matches[1][1]).toBeUndefined();

    const mixed = protectMarkdownMath('Price is $5 and $10, while $x = 2$ holds.');
    expect(mixed.masked).toBe('Price is $5 and $10, while \uE000TMMATH0\uE001 holds.');
    expect(mixed.tokens).toEqual([{ math: 'x = 2', block: false }]);
  });
});
