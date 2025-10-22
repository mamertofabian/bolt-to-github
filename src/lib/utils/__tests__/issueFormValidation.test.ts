/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  validateIssueForm,
  sanitizeIssueFormData,
  canSubmitIssueForm,
  createIssuePayload,
} from '../issue-form';

describe('Issue Form Validation Logic', () => {
  describe('validateIssueForm', () => {
    it('should validate empty form data', () => {
      const result = validateIssueForm({ title: '', body: '' });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should validate form with only whitespace title', () => {
      const result = validateIssueForm({ title: '   ', body: '' });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should validate form with valid data', () => {
      const result = validateIssueForm({ title: 'Valid Issue', body: 'Description' });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate form with only title (no description)', () => {
      const result = validateIssueForm({ title: 'Title Only', body: '' });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject title that is too long', () => {
      const longTitle = 'a'.repeat(2001);
      const result = validateIssueForm({ title: longTitle, body: '' });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title must be less than 2000 characters');
    });

    it('should reject description that is too long', () => {
      const longDescription = 'a'.repeat(10001);
      const result = validateIssueForm({ title: 'Valid Title', body: longDescription });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Description must be less than 10000 characters');
    });

    it('should handle multiple validation errors', () => {
      const longTitle = 'a'.repeat(2001);
      const longDescription = 'a'.repeat(10001);
      const result = validateIssueForm({ title: longTitle, body: longDescription });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('Title must be less than 2000 characters');
      expect(result.errors).toContain('Description must be less than 10000 characters');
    });

    it('should handle edge case title length exactly at limit', () => {
      const titleAtLimit = 'a'.repeat(2000);
      const result = validateIssueForm({ title: titleAtLimit, body: '' });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle edge case description length exactly at limit', () => {
      const descriptionAtLimit = 'a'.repeat(10000);
      const result = validateIssueForm({ title: 'Valid Title', body: descriptionAtLimit });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('sanitizeIssueFormData', () => {
    it('should trim whitespace from title and body', () => {
      const result = sanitizeIssueFormData({ title: '  Test Title  ', body: '  Test Body  ' });

      expect(result.title).toBe('Test Title');
      expect(result.body).toBe('Test Body');
    });

    it('should handle empty strings', () => {
      const result = sanitizeIssueFormData({ title: '', body: '' });

      expect(result.title).toBe('');
      expect(result.body).toBe('');
    });

    it('should handle only whitespace', () => {
      const result = sanitizeIssueFormData({ title: '   ', body: '   ' });

      expect(result.title).toBe('');
      expect(result.body).toBe('');
    });

    it('should handle undefined values', () => {
      const result = sanitizeIssueFormData({
        title: undefined as unknown as string,
        body: undefined as unknown as string,
      });

      expect(result.title).toBe('');
      expect(result.body).toBe('');
    });

    it('should preserve content without leading/trailing whitespace', () => {
      const result = sanitizeIssueFormData({ title: 'No Whitespace', body: 'Clean Content' });

      expect(result.title).toBe('No Whitespace');
      expect(result.body).toBe('Clean Content');
    });
  });

  describe('canSubmitIssueForm', () => {
    it('should return false for empty title', () => {
      const result = canSubmitIssueForm({ title: '', body: '' });
      expect(result).toBe(false);
    });

    it('should return false for whitespace-only title', () => {
      const result = canSubmitIssueForm({ title: '   ', body: 'Description' });
      expect(result).toBe(false);
    });

    it('should return true for valid title', () => {
      const result = canSubmitIssueForm({ title: 'Valid Title', body: '' });
      expect(result).toBe(true);
    });

    it('should return true for valid title with description', () => {
      const result = canSubmitIssueForm({ title: 'Valid Title', body: 'Description' });
      expect(result).toBe(true);
    });

    it('should return true for title with only whitespace in body', () => {
      const result = canSubmitIssueForm({ title: 'Valid Title', body: '   ' });
      expect(result).toBe(true);
    });
  });

  describe('createIssuePayload', () => {
    it('should create payload with sanitized data', () => {
      const result = createIssuePayload({ title: '  Test Title  ', body: '  Test Body  ' });

      expect(result).toEqual({
        title: 'Test Title',
        body: 'Test Body',
      });
    });

    it('should handle empty form data', () => {
      const result = createIssuePayload({ title: '', body: '' });

      expect(result).toEqual({
        title: '',
        body: '',
      });
    });

    it('should handle whitespace-only data', () => {
      const result = createIssuePayload({ title: '   ', body: '   ' });

      expect(result).toEqual({
        title: '',
        body: '',
      });
    });

    it('should create payload with only title', () => {
      const result = createIssuePayload({ title: 'Title Only', body: '' });

      expect(result).toEqual({
        title: 'Title Only',
        body: '',
      });
    });

    it('should handle special characters', () => {
      const specialTitle = '<script>alert("test")</script> & "quotes"';
      const specialBody = 'Description with <script> & "quotes"';
      const result = createIssuePayload({ title: specialTitle, body: specialBody });

      expect(result).toEqual({
        title: specialTitle,
        body: specialBody,
      });
    });
  });
});
