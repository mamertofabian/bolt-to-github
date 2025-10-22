import { describe, it, expect } from 'vitest';
import { cn, flyAndScale } from '../utils';

describe('cn', () => {
  it('should merge class names correctly', () => {
    const result = cn('foo', 'bar');
    expect(result).toBe('foo bar');
  });

  it('should handle conditional class names with true values', () => {
    const result = cn('foo', true && 'bar', 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('should handle empty inputs', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('should handle string inputs', () => {
    const result = cn('text-center', 'font-bold');
    expect(result).toBe('text-center font-bold');
  });

  it('should handle Tailwind responsive variants', () => {
    const result = cn('text-sm md:text-lg', 'lg:text-xl');
    expect(result).toBe('text-sm md:text-lg lg:text-xl');
  });

  it('should work with ternary expressions', () => {
    const isDark = true;
    const result = cn('button', isDark ? 'dark' : 'light');
    expect(result).toBe('button dark');
  });

  it('should work with ternary expressions false case', () => {
    const isDark = false;
    const result = cn('button', isDark ? 'dark' : 'light');
    expect(result).toBe('button light');
  });

  it('should merge Tailwind utilities with twMerge', () => {
    const result = cn('px-2 py-1', 'px-4');
    expect(result).toContain('px-4');
    expect(result).toContain('py-1');
  });

  it('should handle multiple class strings', () => {
    const result = cn('text-sm', 'font-bold', 'text-center');
    expect(result).toContain('text-sm');
    expect(result).toContain('font-bold');
    expect(result).toContain('text-center');
  });

  it('should handle complex tailwind class combinations', () => {
    const result = cn('hover:bg-blue-500', 'focus:ring-2', 'active:scale-95');
    expect(result).toContain('hover:bg-blue-500');
    expect(result).toContain('focus:ring-2');
    expect(result).toContain('active:scale-95');
  });
});

describe('flyAndScale', () => {
  it('should be a function that returns a Svelte transition config', () => {
    expect(typeof flyAndScale).toBe('function');
  });

  it('should accept an Element and optional parameters without throwing', () => {
    const mockElement = document.createElement('div');

    expect(() => flyAndScale(mockElement)).not.toThrow();
  });

  it('should accept custom parameters', () => {
    const mockElement = document.createElement('div');
    const params = { y: -10, x: 5, start: 0.9, duration: 200 };

    expect(() => flyAndScale(mockElement, params)).not.toThrow();
  });

  it('should work with empty parameters object', () => {
    const mockElement = document.createElement('div');

    expect(() => flyAndScale(mockElement, {})).not.toThrow();
  });

  it('should accept partial parameter objects', () => {
    const mockElement = document.createElement('div');

    expect(() => flyAndScale(mockElement, { duration: 300 })).not.toThrow();
    expect(() => flyAndScale(mockElement, { y: -15 })).not.toThrow();
    expect(() => flyAndScale(mockElement, { x: 10 })).not.toThrow();
    expect(() => flyAndScale(mockElement, { start: 0.8 })).not.toThrow();
  });

  it('should accept all parameters together', () => {
    const mockElement = document.createElement('div');
    const params = { y: -15, x: 10, start: 0.9, duration: 250 };

    expect(() => flyAndScale(mockElement, params)).not.toThrow();
  });
});
