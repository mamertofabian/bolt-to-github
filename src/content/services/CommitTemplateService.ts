export interface CommitTemplate {
  id: string;
  name: string;
  template: string;
  description?: string;
}

export interface CustomTemplate extends CommitTemplate {
  isCustom: true;
  lastUsed: string; // ISO date string
}

export type TemplateType =
  | 'feat'
  | 'fix'
  | 'docs'
  | 'style'
  | 'refactor'
  | 'perf'
  | 'test'
  | 'build'
  | 'ci'
  | 'chore'
  | 'revert';

export class CommitTemplateService {
  private static instance: CommitTemplateService | null = null;

  private defaultTemplates: CommitTemplate[] = [
    {
      id: 'feat',
      name: 'Feature',
      template: 'feat: add [feature name]',
      description: 'A new feature',
    },
    {
      id: 'fix',
      name: 'Bug Fix',
      template: 'fix: resolve issue with [description]',
      description: 'A bug fix',
    },
    {
      id: 'docs',
      name: 'Documentation',
      template: 'docs: update documentation for [component]',
      description: 'Documentation only changes',
    },
    {
      id: 'style',
      name: 'Styling',
      template: 'style: format [component]',
      description: "Changes that don't affect code functionality (whitespace, formatting)",
    },
    {
      id: 'refactor',
      name: 'Refactor',
      template: 'refactor: improve [component] implementation',
      description: 'A code change that neither fixes a bug nor adds a feature',
    },
    {
      id: 'perf',
      name: 'Performance',
      template: 'perf: improve performance of [component]',
      description: 'A code change that improves performance',
    },
    {
      id: 'test',
      name: 'Test',
      template: 'test: add tests for [component]',
      description: 'Adding or correcting tests',
    },
    {
      id: 'chore',
      name: 'Chore',
      template: 'chore: update dependencies',
      description: 'Changes to the build process or auxiliary tools',
    },
    {
      id: 'revert',
      name: 'Revert',
      template: 'revert: revert commit [hash]',
      description: 'Revert a previous commit',
    },
    {
      id: 'initial',
      name: 'Initial Commit',
      template: 'Initial commit: project setup',
      description: 'First commit to a repository',
    },
    {
      id: 'update',
      name: 'Update',
      template: 'update: [file/component] with latest changes',
      description: 'General update to files',
    },
  ];

  private constructor() {}

  public static getInstance(): CommitTemplateService {
    if (!CommitTemplateService.instance) {
      CommitTemplateService.instance = new CommitTemplateService();
    }
    return CommitTemplateService.instance;
  }

  public getDefaultTemplates(): CommitTemplate[] {
    return [...this.defaultTemplates];
  }

  public async getAllTemplates(): Promise<(CommitTemplate | CustomTemplate)[]> {
    const defaultTemplates = this.getDefaultTemplates();
    const customTemplates = await this.getCustomTemplates();

    return [...defaultTemplates, ...customTemplates];
  }

  public async getCustomTemplates(): Promise<CustomTemplate[]> {
    try {
      const result = await chrome.storage.sync.get('commitTemplates');
      return result.commitTemplates || [];
    } catch (error) {
      console.warn('Error loading custom templates:', error);
      return [];
    }
  }

  public async saveCustomTemplate(template: Omit<CustomTemplate, 'lastUsed'>): Promise<void> {
    try {
      const templates = await this.getCustomTemplates();
      const exists = templates.findIndex((t) => t.id === template.id);

      if (exists >= 0) {
        templates[exists] = {
          ...template,
          lastUsed: new Date().toISOString(),
        };
      } else {
        templates.push({
          ...template,
          lastUsed: new Date().toISOString(),
        });
      }

      await chrome.storage.sync.set({ commitTemplates: templates });
    } catch (error) {
      console.error('Error saving custom template:', error);
      throw error;
    }
  }

  public async deleteCustomTemplate(id: string): Promise<void> {
    try {
      const templates = await this.getCustomTemplates();
      const filtered = templates.filter((t) => t.id !== id);

      await chrome.storage.sync.set({ commitTemplates: filtered });
    } catch (error) {
      console.error('Error deleting custom template:', error);
      throw error;
    }
  }

  public async updateLastUsed(id: string): Promise<void> {
    try {
      const templates = await this.getCustomTemplates();
      const index = templates.findIndex((t) => t.id === id);

      if (index >= 0) {
        templates[index].lastUsed = new Date().toISOString();
        await chrome.storage.sync.set({ commitTemplates: templates });
      }
    } catch (error) {
      console.error('Error updating last used:', error);
    }
  }

  public async getTemplateById(
    id: string,
    includeCustom = true
  ): Promise<CommitTemplate | CustomTemplate | undefined> {
    const defaultTemplate = this.defaultTemplates.find((t) => t.id === id);
    if (defaultTemplate) return defaultTemplate;

    if (includeCustom) {
      const customTemplates = await this.getCustomTemplates();
      return customTemplates.find((t) => t.id === id);
    }

    return undefined;
  }

  /**
   * Get template suggestions as simple strings for the enhanced dialog
   * Returns the most commonly used templates for quick access
   */
  public async getTemplateSuggestions(): Promise<string[]> {
    try {
      const customTemplates = await this.getCustomTemplates();

      // Sort custom templates by last used (most recent first)
      const recentCustom = customTemplates
        .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
        .slice(0, 3) // Take top 3 recent custom templates
        .map((t) => t.template);

      // Add most common default templates
      const commonDefaults = ['feat: ', 'fix: ', 'docs: ', 'refactor: ', 'chore: ', 'style: '];

      // Combine recent custom templates with common defaults
      // Remove duplicates and limit to reasonable number
      const suggestions = [...recentCustom, ...commonDefaults]
        .filter((template, index, arr) => arr.indexOf(template) === index)
        .slice(0, 8); // Limit to 8 suggestions to keep UI clean

      return suggestions;
    } catch (error) {
      console.warn('Error getting template suggestions:', error);
      // Return basic default suggestions as fallback
      return ['feat: ', 'fix: ', 'docs: ', 'refactor: ', 'chore: ', 'style: '];
    }
  }

  /**
   * Record template usage for analytics and improving suggestions
   */
  public async recordTemplateUsage(template: string): Promise<void> {
    try {
      // If it's a custom template, update its last used time
      const customTemplates = await this.getCustomTemplates();
      const customTemplate = customTemplates.find((t) => t.template === template);

      if (customTemplate) {
        await this.updateLastUsed(customTemplate.id);
      }

      // Could also track usage analytics here for default templates
      // to improve future suggestions
    } catch (error) {
      console.warn('Error recording template usage:', error);
    }
  }
}
