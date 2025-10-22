import { describe, it, expect, vi } from 'vitest';
import {
  getIconComponent,
  getIconColor,
  getConfirmButtonClass,
  handleKeydown,
  handleConfirm,
  handleCancel,
  validateDialogConfig,
  getDefaultDialogConfig,
  mergeDialogConfig,
  type DialogType,
  type DialogConfig,
} from '../confirmation-dialog';

describe('ConfirmationDialog Logic', () => {
  describe('getIconComponent', () => {
    it('should return AlertTriangle for warning type', () => {
      expect(getIconComponent('warning')).toBe('AlertTriangle');
    });

    it('should return AlertTriangle for danger type', () => {
      expect(getIconComponent('danger')).toBe('AlertTriangle');
    });

    it('should return Info for info type', () => {
      expect(getIconComponent('info')).toBe('Info');
    });
  });

  describe('getIconColor', () => {
    it('should return red color for danger type', () => {
      expect(getIconColor('danger')).toBe('text-red-500');
    });

    it('should return yellow color for warning type', () => {
      expect(getIconColor('warning')).toBe('text-yellow-500');
    });

    it('should return blue color for info type', () => {
      expect(getIconColor('info')).toBe('text-blue-500');
    });
  });

  describe('getConfirmButtonClass', () => {
    it('should return red button classes for danger type', () => {
      expect(getConfirmButtonClass('danger')).toBe('bg-red-600 hover:bg-red-700');
    });

    it('should return yellow button classes for warning type', () => {
      expect(getConfirmButtonClass('warning')).toBe('bg-yellow-600 hover:bg-yellow-700');
    });

    it('should return blue button classes for info type', () => {
      expect(getConfirmButtonClass('info')).toBe('bg-blue-600 hover:bg-blue-700');
    });
  });

  describe('handleKeydown', () => {
    it('should call onCancel when Escape key is pressed', () => {
      const mockOnCancel = vi.fn();
      const mockOnConfirm = vi.fn();
      const event = new KeyboardEvent('keydown', { key: 'Escape' });

      handleKeydown(event, mockOnConfirm, mockOnCancel);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('should call onConfirm when Enter key is pressed', () => {
      const mockOnCancel = vi.fn();
      const mockOnConfirm = vi.fn();
      const event = new KeyboardEvent('keydown', { key: 'Enter' });

      handleKeydown(event, mockOnConfirm, mockOnCancel);

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('should not call any handlers for other keys', () => {
      const mockOnCancel = vi.fn();
      const mockOnConfirm = vi.fn();
      const event = new KeyboardEvent('keydown', { key: 'a' });

      handleKeydown(event, mockOnConfirm, mockOnCancel);

      expect(mockOnConfirm).not.toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('should not call any handlers for Space key', () => {
      const mockOnCancel = vi.fn();
      const mockOnConfirm = vi.fn();
      const event = new KeyboardEvent('keydown', { key: ' ' });

      handleKeydown(event, mockOnConfirm, mockOnCancel);

      expect(mockOnConfirm).not.toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });

    it('should not call any handlers for Tab key', () => {
      const mockOnCancel = vi.fn();
      const mockOnConfirm = vi.fn();
      const event = new KeyboardEvent('keydown', { key: 'Tab' });

      handleKeydown(event, mockOnConfirm, mockOnCancel);

      expect(mockOnConfirm).not.toHaveBeenCalled();
      expect(mockOnCancel).not.toHaveBeenCalled();
    });
  });

  describe('handleConfirm', () => {
    it('should call onConfirm and return show: false', () => {
      const mockOnConfirm = vi.fn();

      const result = handleConfirm(mockOnConfirm);

      expect(mockOnConfirm).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ show: false });
    });

    it('should handle multiple calls correctly', () => {
      const mockOnConfirm = vi.fn();

      handleConfirm(mockOnConfirm);
      handleConfirm(mockOnConfirm);
      handleConfirm(mockOnConfirm);

      expect(mockOnConfirm).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleCancel', () => {
    it('should call onCancel and return show: false', () => {
      const mockOnCancel = vi.fn();

      const result = handleCancel(mockOnCancel);

      expect(mockOnCancel).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ show: false });
    });

    it('should handle multiple calls correctly', () => {
      const mockOnCancel = vi.fn();

      handleCancel(mockOnCancel);
      handleCancel(mockOnCancel);
      handleCancel(mockOnCancel);

      expect(mockOnCancel).toHaveBeenCalledTimes(3);
    });
  });

  describe('validateDialogConfig', () => {
    it('should return valid for complete valid config', () => {
      const config: Partial<DialogConfig> = {
        type: 'info',
        title: 'Test Title',
        message: 'Test message',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      };

      const result = validateDialogConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for missing title', () => {
      const config: Partial<DialogConfig> = {
        type: 'info',
        message: 'Test message',
      };

      const result = validateDialogConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should return invalid for empty title', () => {
      const config: Partial<DialogConfig> = {
        type: 'info',
        title: '   ',
        message: 'Test message',
      };

      const result = validateDialogConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should return invalid for missing message', () => {
      const config: Partial<DialogConfig> = {
        type: 'info',
        title: 'Test Title',
      };

      const result = validateDialogConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message is required');
    });

    it('should return invalid for empty message', () => {
      const config: Partial<DialogConfig> = {
        type: 'info',
        title: 'Test Title',
        message: '   ',
      };

      const result = validateDialogConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Message is required');
    });

    it('should return invalid for invalid type', () => {
      const config: Partial<DialogConfig> = {
        type: 'invalid' as DialogType,
        title: 'Test Title',
        message: 'Test message',
      };

      const result = validateDialogConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Type must be one of: warning, info, danger');
    });

    it('should return multiple errors for multiple invalid fields', () => {
      const config: Partial<DialogConfig> = {
        type: 'invalid' as DialogType,
        title: '',
        message: '',
      };

      const result = validateDialogConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain('Title is required');
      expect(result.errors).toContain('Message is required');
      expect(result.errors).toContain('Type must be one of: warning, info, danger');
    });
  });

  describe('getDefaultDialogConfig', () => {
    it('should return default configuration', () => {
      const config = getDefaultDialogConfig();

      expect(config).toEqual({
        type: 'info',
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      });
    });
  });

  describe('mergeDialogConfig', () => {
    it('should merge user config with defaults', () => {
      const userConfig: Partial<DialogConfig> = {
        title: 'Custom Title',
        message: 'Custom message',
        type: 'warning',
      };

      const result = mergeDialogConfig(userConfig);

      expect(result).toEqual({
        type: 'warning',
        title: 'Custom Title',
        message: 'Custom message',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      });
    });

    it('should use defaults for missing properties', () => {
      const userConfig: Partial<DialogConfig> = {
        title: 'Custom Title',
      };

      const result = mergeDialogConfig(userConfig);

      expect(result).toEqual({
        type: 'info',
        title: 'Custom Title',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      });
    });

    it('should handle empty user config', () => {
      const userConfig: Partial<DialogConfig> = {};

      const result = mergeDialogConfig(userConfig);

      expect(result).toEqual({
        type: 'info',
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      });
    });

    it('should override all properties when provided', () => {
      const userConfig: Partial<DialogConfig> = {
        type: 'danger',
        title: 'Danger Title',
        message: 'Danger message',
        confirmText: 'Delete',
        cancelText: 'Keep',
      };

      const result = mergeDialogConfig(userConfig);

      expect(result).toEqual({
        type: 'danger',
        title: 'Danger Title',
        message: 'Danger message',
        confirmText: 'Delete',
        cancelText: 'Keep',
      });
    });
  });
});
