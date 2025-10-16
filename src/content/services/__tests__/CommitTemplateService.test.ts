import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitTemplateService } from '../CommitTemplateService';
import type { CustomTemplate } from '../CommitTemplateService';

vi.mock('../../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('CommitTemplateService', () => {
  let service: CommitTemplateService;
  let mockChrome: typeof chrome;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00.000Z') });

    mockChrome = {
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as typeof chrome;

    vi.stubGlobal('chrome', mockChrome);

    (CommitTemplateService as unknown as { instance: CommitTemplateService | null }).instance =
      null;
    service = CommitTemplateService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('Singleton Pattern', () => {
    it('returns the same instance across multiple calls', () => {
      const instance1 = CommitTemplateService.getInstance();
      const instance2 = CommitTemplateService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('creates only one instance even when called multiple times', () => {
      const instance1 = CommitTemplateService.getInstance();
      const instance2 = CommitTemplateService.getInstance();
      const instance3 = CommitTemplateService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('getDefaultTemplates', () => {
    it('returns an array of default templates', () => {
      const templates = service.getDefaultTemplates();

      expect(templates).toBeInstanceOf(Array);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('includes standard conventional commit types', () => {
      const templates = service.getDefaultTemplates();
      const templateIds = templates.map((t) => t.id);

      expect(templateIds).toContain('feat');
      expect(templateIds).toContain('fix');
      expect(templateIds).toContain('docs');
      expect(templateIds).toContain('style');
      expect(templateIds).toContain('refactor');
      expect(templateIds).toContain('perf');
      expect(templateIds).toContain('test');
      expect(templateIds).toContain('chore');
      expect(templateIds).toContain('revert');
    });

    it('includes additional useful templates', () => {
      const templates = service.getDefaultTemplates();
      const templateIds = templates.map((t) => t.id);

      expect(templateIds).toContain('initial');
      expect(templateIds).toContain('update');
    });

    it('each template has required properties', () => {
      const templates = service.getDefaultTemplates();

      templates.forEach((template) => {
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('template');
        expect(typeof template.id).toBe('string');
        expect(typeof template.name).toBe('string');
        expect(typeof template.template).toBe('string');
      });
    });

    it('returns a new array each time to prevent mutations', () => {
      const templates1 = service.getDefaultTemplates();
      const templates2 = service.getDefaultTemplates();

      expect(templates1).not.toBe(templates2);
      expect(templates1).toEqual(templates2);
    });
  });

  describe('getCustomTemplates', () => {
    it('returns empty array when no custom templates exist', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      const templates = await service.getCustomTemplates();

      expect(templates).toEqual([]);
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith('commitTemplates');
    });

    it('returns custom templates from storage', async () => {
      const customTemplates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Custom Template',
          template: 'custom: my template',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: customTemplates,
      });

      const templates = await service.getCustomTemplates();

      expect(templates).toEqual(customTemplates);
    });

    it('returns empty array and logs warning when storage errors', async () => {
      mockChrome.storage.sync.get = vi.fn().mockRejectedValue(new Error('Storage error'));

      const templates = await service.getCustomTemplates();

      expect(templates).toEqual([]);
    });
  });

  describe('getAllTemplates', () => {
    it('returns both default and custom templates', async () => {
      const customTemplates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Custom',
          template: 'custom: template',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: customTemplates,
      });

      const templates = await service.getAllTemplates();
      const defaultCount = service.getDefaultTemplates().length;

      expect(templates).toHaveLength(defaultCount + 1);
      expect(templates[templates.length - 1]).toEqual(customTemplates[0]);
    });

    it('returns only default templates when no custom templates exist', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      const templates = await service.getAllTemplates();
      const defaultTemplates = service.getDefaultTemplates();

      expect(templates).toHaveLength(defaultTemplates.length);
      expect(templates).toEqual(defaultTemplates);
    });
  });

  describe('saveCustomTemplate', () => {
    it('saves a new custom template with lastUsed timestamp', async () => {
      const newTemplate = {
        id: 'custom-1',
        name: 'My Template',
        template: 'custom: my changes',
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      await service.saveCustomTemplate(newTemplate);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          {
            ...newTemplate,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('updates existing template when id matches', async () => {
      const existingTemplate: CustomTemplate = {
        id: 'custom-1',
        name: 'Old Name',
        template: 'old: template',
        isCustom: true,
        lastUsed: '2023-12-01T00:00:00.000Z',
      };

      const updatedTemplate = {
        id: 'custom-1',
        name: 'New Name',
        template: 'new: template',
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [existingTemplate],
      });

      await service.saveCustomTemplate(updatedTemplate);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          {
            ...updatedTemplate,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('preserves other templates when updating one', async () => {
      const template1: CustomTemplate = {
        id: 'custom-1',
        name: 'Template 1',
        template: 'temp1: content',
        isCustom: true,
        lastUsed: '2023-12-01T00:00:00.000Z',
      };

      const template2: CustomTemplate = {
        id: 'custom-2',
        name: 'Template 2',
        template: 'temp2: content',
        isCustom: true,
        lastUsed: '2023-12-15T00:00:00.000Z',
      };

      const updatedTemplate1 = {
        id: 'custom-1',
        name: 'Updated Template 1',
        template: 'updated1: content',
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [template1, template2],
      });

      await service.saveCustomTemplate(updatedTemplate1);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          {
            ...updatedTemplate1,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
          template2,
        ],
      });
    });

    it('adds new template to existing templates', async () => {
      const existingTemplate: CustomTemplate = {
        id: 'custom-1',
        name: 'Existing',
        template: 'existing: template',
        isCustom: true,
        lastUsed: '2023-12-01T00:00:00.000Z',
      };

      const newTemplate = {
        id: 'custom-2',
        name: 'New',
        template: 'new: template',
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [existingTemplate],
      });

      await service.saveCustomTemplate(newTemplate);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          existingTemplate,
          {
            ...newTemplate,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('throws error when storage fails', async () => {
      const template = {
        id: 'custom-1',
        name: 'Test',
        template: 'test: template',
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});
      mockChrome.storage.sync.set = vi.fn().mockRejectedValue(new Error('Storage full'));

      await expect(service.saveCustomTemplate(template)).rejects.toThrow('Storage full');
    });
  });

  describe('deleteCustomTemplate', () => {
    it('removes template with matching id', async () => {
      const templates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Template 1',
          template: 'temp1: content',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'custom-2',
          name: 'Template 2',
          template: 'temp2: content',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: templates,
      });

      await service.deleteCustomTemplate('custom-1');

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [templates[1]],
      });
    });

    it('does nothing when template id does not exist', async () => {
      const templates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Template 1',
          template: 'temp1: content',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: templates,
      });

      await service.deleteCustomTemplate('non-existent');

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: templates,
      });
    });

    it('results in empty array when deleting last template', async () => {
      const templates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Template 1',
          template: 'temp1: content',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: templates,
      });

      await service.deleteCustomTemplate('custom-1');

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [],
      });
    });

    it('throws error when storage fails', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [],
      });
      mockChrome.storage.sync.set = vi.fn().mockRejectedValue(new Error('Storage error'));

      await expect(service.deleteCustomTemplate('custom-1')).rejects.toThrow('Storage error');
    });
  });

  describe('updateLastUsed', () => {
    it('updates lastUsed timestamp for existing template', async () => {
      const template: CustomTemplate = {
        id: 'custom-1',
        name: 'Template',
        template: 'custom: template',
        isCustom: true,
        lastUsed: '2023-01-01T00:00:00.000Z',
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [template],
      });

      await service.updateLastUsed('custom-1');

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          {
            ...template,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('does nothing when template id does not exist', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [],
      });

      await service.updateLastUsed('non-existent');

      expect(mockChrome.storage.sync.set).not.toHaveBeenCalled();
    });

    it('updates only the specified template among multiple', async () => {
      const template1: CustomTemplate = {
        id: 'custom-1',
        name: 'Template 1',
        template: 'temp1: content',
        isCustom: true,
        lastUsed: '2023-01-01T00:00:00.000Z',
      };

      const template2: CustomTemplate = {
        id: 'custom-2',
        name: 'Template 2',
        template: 'temp2: content',
        isCustom: true,
        lastUsed: '2023-06-01T00:00:00.000Z',
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [template1, template2],
      });

      await service.updateLastUsed('custom-2');

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          template1,
          {
            ...template2,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('does not throw when storage fails', async () => {
      mockChrome.storage.sync.get = vi.fn().mockRejectedValue(new Error('Storage error'));

      await expect(service.updateLastUsed('custom-1')).resolves.not.toThrow();
    });
  });

  describe('getTemplateById', () => {
    it('returns default template when found', async () => {
      const template = await service.getTemplateById('feat');

      expect(template).toBeDefined();
      expect(template?.id).toBe('feat');
      expect(template?.name).toBe('Feature');
    });

    it('returns undefined when default template not found and custom search disabled', async () => {
      const template = await service.getTemplateById('non-existent', false);

      expect(template).toBeUndefined();
    });

    it('returns custom template when default not found', async () => {
      const customTemplate: CustomTemplate = {
        id: 'custom-1',
        name: 'Custom',
        template: 'custom: template',
        isCustom: true,
        lastUsed: '2024-01-01T00:00:00.000Z',
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [customTemplate],
      });

      const template = await service.getTemplateById('custom-1');

      expect(template).toEqual(customTemplate);
    });

    it('prioritizes default template over custom with same id', async () => {
      const customTemplate: CustomTemplate = {
        id: 'feat',
        name: 'Custom Feature',
        template: 'custom feat: template',
        isCustom: true,
        lastUsed: '2024-01-01T00:00:00.000Z',
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [customTemplate],
      });

      const template = await service.getTemplateById('feat');

      expect(template?.name).toBe('Feature');
      expect(template).not.toHaveProperty('isCustom');
    });

    it('returns undefined when template not found anywhere', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      const template = await service.getTemplateById('non-existent');

      expect(template).toBeUndefined();
    });
  });

  describe('getTemplateSuggestions', () => {
    it('returns basic default suggestions when no custom templates exist', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      const suggestions = await service.getTemplateSuggestions();

      expect(suggestions).toContain('feat: ');
      expect(suggestions).toContain('fix: ');
      expect(suggestions).toContain('docs: ');
      expect(suggestions).toContain('refactor: ');
      expect(suggestions).toContain('chore: ');
      expect(suggestions).toContain('style: ');
    });

    it('includes recent custom templates in suggestions', async () => {
      const customTemplates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Recent',
          template: 'custom-recent: template',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: customTemplates,
      });

      const suggestions = await service.getTemplateSuggestions();

      expect(suggestions).toContain('custom-recent: template');
    });

    it('sorts custom templates by most recently used', async () => {
      const customTemplates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Older',
          template: 'older: template',
          isCustom: true,
          lastUsed: '2023-01-01T00:00:00.000Z',
        },
        {
          id: 'custom-2',
          name: 'Newer',
          template: 'newer: template',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'custom-3',
          name: 'Newest',
          template: 'newest: template',
          isCustom: true,
          lastUsed: '2024-06-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: customTemplates,
      });

      const suggestions = await service.getTemplateSuggestions();

      const newestIndex = suggestions.indexOf('newest: template');
      const newerIndex = suggestions.indexOf('newer: template');
      const olderIndex = suggestions.indexOf('older: template');

      expect(newestIndex).toBeLessThan(newerIndex);
      expect(newerIndex).toBeLessThan(olderIndex);
    });

    it('limits custom templates to top 3 most recent', async () => {
      const customTemplates: CustomTemplate[] = Array.from({ length: 5 }, (_, i) => ({
        id: `custom-${i}`,
        name: `Template ${i}`,
        template: `template-${i}: content`,
        isCustom: true,
        lastUsed: new Date(2024, 0, i + 1).toISOString(),
      }));

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: customTemplates,
      });

      const suggestions = await service.getTemplateSuggestions();

      const customSuggestions = suggestions.filter((s) => s.startsWith('template-'));
      expect(customSuggestions.length).toBeLessThanOrEqual(3);
    });

    it('removes duplicate suggestions', async () => {
      const customTemplates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'Custom',
          template: 'feat: ',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: customTemplates,
      });

      const suggestions = await service.getTemplateSuggestions();

      const featCount = suggestions.filter((s) => s === 'feat: ').length;
      expect(featCount).toBe(1);
    });

    it('limits suggestions to 8 items', async () => {
      const customTemplates: CustomTemplate[] = Array.from({ length: 10 }, (_, i) => ({
        id: `custom-${i}`,
        name: `Template ${i}`,
        template: `unique-${i}: content`,
        isCustom: true,
        lastUsed: new Date(2024, 0, i + 1).toISOString(),
      }));

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: customTemplates,
      });

      const suggestions = await service.getTemplateSuggestions();

      expect(suggestions.length).toBeLessThanOrEqual(8);
    });

    it('returns fallback suggestions when storage fails', async () => {
      mockChrome.storage.sync.get = vi.fn().mockRejectedValue(new Error('Storage error'));

      const suggestions = await service.getTemplateSuggestions();

      expect(suggestions).toEqual([
        'feat: ',
        'fix: ',
        'docs: ',
        'refactor: ',
        'chore: ',
        'style: ',
      ]);
    });
  });

  describe('recordTemplateUsage', () => {
    it('updates lastUsed for matching custom template', async () => {
      const customTemplate: CustomTemplate = {
        id: 'custom-1',
        name: 'Custom',
        template: 'custom: my template',
        isCustom: true,
        lastUsed: '2023-01-01T00:00:00.000Z',
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [customTemplate],
      });

      await service.recordTemplateUsage('custom: my template');

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          {
            ...customTemplate,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('does nothing when template is not a custom template', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      await service.recordTemplateUsage('feat: some feature');

      expect(mockChrome.storage.sync.set).not.toHaveBeenCalled();
    });

    it('does not throw when storage fails', async () => {
      mockChrome.storage.sync.get = vi.fn().mockRejectedValue(new Error('Storage error'));

      await expect(service.recordTemplateUsage('custom: template')).resolves.not.toThrow();
    });

    it('handles partial matches correctly', async () => {
      const customTemplate: CustomTemplate = {
        id: 'custom-1',
        name: 'Custom',
        template: 'custom: template',
        isCustom: true,
        lastUsed: '2023-01-01T00:00:00.000Z',
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [customTemplate],
      });

      await service.recordTemplateUsage('custom: different content');

      expect(mockChrome.storage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles empty custom template array', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: [],
      });

      const templates = await service.getCustomTemplates();
      expect(templates).toEqual([]);
    });

    it('handles malformed storage data gracefully', async () => {
      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: null,
      });

      const templates = await service.getCustomTemplates();
      expect(templates).toEqual([]);
    });

    it('handles concurrent save operations', async () => {
      const template1 = {
        id: 'custom-1',
        name: 'Template 1',
        template: 'temp1: content',
        isCustom: true as const,
      };

      const template2 = {
        id: 'custom-2',
        name: 'Template 2',
        template: 'temp2: content',
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      await Promise.all([
        service.saveCustomTemplate(template1),
        service.saveCustomTemplate(template2),
      ]);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledTimes(2);
    });

    it('handles template with special characters', async () => {
      const template = {
        id: 'special-chars',
        name: 'Special "Chars" Template',
        template: 'feat: add \n\t special chars [test]',
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      await service.saveCustomTemplate(template);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          {
            ...template,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('handles very long template strings', async () => {
      const longTemplate = 'a'.repeat(1000);
      const template = {
        id: 'long-template',
        name: 'Long',
        template: longTemplate,
        isCustom: true as const,
      };

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({});

      await service.saveCustomTemplate(template);

      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        commitTemplates: [
          {
            ...template,
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      });
    });

    it('maintains template order when not explicitly modified', async () => {
      const templates: CustomTemplate[] = [
        {
          id: 'custom-1',
          name: 'First',
          template: 'first: template',
          isCustom: true,
          lastUsed: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'custom-2',
          name: 'Second',
          template: 'second: template',
          isCustom: true,
          lastUsed: '2024-01-02T00:00:00.000Z',
        },
        {
          id: 'custom-3',
          name: 'Third',
          template: 'third: template',
          isCustom: true,
          lastUsed: '2024-01-03T00:00:00.000Z',
        },
      ];

      mockChrome.storage.sync.get = vi.fn().mockResolvedValue({
        commitTemplates: templates,
      });

      await service.deleteCustomTemplate('custom-2');

      const savedTemplates = (mockChrome.storage.sync.set as ReturnType<typeof vi.fn>).mock
        .calls[0][0].commitTemplates;

      expect(savedTemplates[0].id).toBe('custom-1');
      expect(savedTemplates[1].id).toBe('custom-3');
    });
  });
});
