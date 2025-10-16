import { describe, it, expect } from 'vitest';
import { toBase64 } from '../common';

describe('toBase64', () => {
  describe('Basic ASCII string encoding', () => {
    it('should encode simple ASCII string correctly', () => {
      const input = 'hello world';
      const result = toBase64(input);
      const decoded = atob(result);

      expect(decoded).toBe(input);
    });

    it('should encode empty string', () => {
      const result = toBase64('');

      expect(result).toBe('');
    });

    it('should encode single character', () => {
      const input = 'a';
      const result = toBase64(input);
      const decoded = atob(result);

      expect(decoded).toBe(input);
    });

    it('should encode string with numbers', () => {
      const input = 'test123';
      const result = toBase64(input);
      const decoded = atob(result);

      expect(decoded).toBe(input);
    });

    it('should encode string with special characters', () => {
      const input = 'hello@world.com';
      const result = toBase64(input);
      const decoded = atob(result);

      expect(decoded).toBe(input);
    });
  });

  describe('Unicode character encoding', () => {
    it('should encode emoji correctly', () => {
      const input = 'Hello 👋 World 🌍';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode Chinese characters correctly', () => {
      const input = '你好世界';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode Japanese characters correctly', () => {
      const input = 'こんにちは';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode Arabic characters correctly', () => {
      const input = 'مرحبا بالعالم';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode mixed ASCII and Unicode characters', () => {
      const input = 'Hello 世界 👋';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode accented characters correctly', () => {
      const input = 'café résumé naïve';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode Cyrillic characters correctly', () => {
      const input = 'Привет мир';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });
  });

  describe('Special cases and edge cases', () => {
    it('should encode string with newlines', () => {
      const input = 'line1\nline2\nline3';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode string with tabs', () => {
      const input = 'col1\tcol2\tcol3';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode string with all whitespace types', () => {
      const input = 'space tab\tnewline\ncarriage return\r';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode very long string', () => {
      const input = 'a'.repeat(10000);
      const result = toBase64(input);
      const decoded = atob(result);

      expect(decoded).toBe(input);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should encode string with only spaces', () => {
      const input = '     ';
      const result = toBase64(input);
      const decoded = atob(result);

      expect(decoded).toBe(input);
    });

    it('should encode JSON string correctly', () => {
      const input = '{"name":"test","value":123}';
      const result = toBase64(input);
      const decoded = atob(result);

      expect(decoded).toBe(input);
    });

    it('should encode HTML string correctly', () => {
      const input = '<div class="test">Hello & goodbye</div>';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode string with null character', () => {
      const input = 'before\0after';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });
  });

  describe('Deterministic behavior', () => {
    it('should produce same output for same input', () => {
      const input = 'test string 123';
      const result1 = toBase64(input);
      const result2 = toBase64(input);

      expect(result1).toBe(result2);
    });

    it('should produce same output for same Unicode input', () => {
      const input = 'Hello 👋 世界';
      const result1 = toBase64(input);
      const result2 = toBase64(input);

      expect(result1).toBe(result2);
    });

    it('should produce different output for different input', () => {
      const input1 = 'test1';
      const input2 = 'test2';
      const result1 = toBase64(input1);
      const result2 = toBase64(input2);

      expect(result1).not.toBe(result2);
    });
  });

  describe('Base64 output validation', () => {
    it('should produce valid base64 string', () => {
      const input = 'test string';
      const result = toBase64(input);

      expect(result).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    it('should produce base64 string that can be decoded by atob', () => {
      const input = 'test string 123';
      const result = toBase64(input);

      expect(() => atob(result)).not.toThrow();
    });

    it('should produce non-empty output for non-empty input', () => {
      const input = 'test';
      const result = toBase64(input);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle surrogate pairs correctly', () => {
      const input = '𝕳𝖊𝖑𝖑𝖔';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });
  });

  describe('Real-world use cases', () => {
    it('should encode typical GitHub commit message', () => {
      const input = 'feat: add new feature\n\nThis commit adds a new feature to the project.';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode source code with various characters', () => {
      const input = 'const greeting = "Hello 世界";\nconsole.log(greeting);';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode markdown content', () => {
      const input = '# Title\n\n## Subtitle\n\n- Item 1\n- Item 2 with 🎉';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });

    it('should encode configuration JSON with Unicode', () => {
      const input = '{"message":"Hello 👋","author":"José García"}';
      const result = toBase64(input);

      const binaryString = atob(result);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);

      expect(decoded).toBe(input);
    });
  });
});
