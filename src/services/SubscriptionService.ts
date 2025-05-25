export interface SubscriptionData {
  email: string;
  name?: string;
  preferences?: {
    productUpdates?: boolean;
    tips?: boolean;
    communityNews?: boolean;
  };
  metadata?: {
    subscriptionSource: 'extension';
    extensionVersion: string;
    subscriptionDate: string;
  };
}

export interface SubscriptionResponse {
  success: boolean;
  message?: string;
  subscriptionId?: string;
}

export class SubscriptionService {
  private apiEndpoint =
    'https://gapvjcqybzabnrjnxzhg.supabase.co/functions/v1/newsletter-subscription';

  async subscribe(data: SubscriptionData): Promise<SubscriptionResponse> {
    try {
      // Parse name into first and last name if provided
      const nameParts = data.name ? data.name.trim().split(' ') : [];
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Prepare the payload for Supabase function
      const payload = {
        email: data.email,
        firstName,
        lastName,
        customFields: {
          source: data.metadata?.subscriptionSource || 'extension',
          version: chrome.runtime.getManifest().version,
          subscription_date: new Date().toISOString(),
          preferences: JSON.stringify(data.preferences || {}),
        },
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle common error responses
        if (response.status === 422 || response.status === 400) {
          throw new Error(errorData.message || 'This email is already subscribed or invalid.');
        }
        if (response.status === 500) {
          throw new Error('Newsletter service is temporarily unavailable.');
        }

        throw new Error(`Subscription failed: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Subscription failed');
      }

      return {
        success: true,
        message:
          result.message ||
          'Successfully subscribed to newsletter! You may receive a confirmation email.',
        subscriptionId: result.subscriber?.id || 'unknown',
      };
    } catch (error) {
      console.error('Subscription error:', error);

      // Handle network errors gracefully
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return {
          success: false,
          message: 'Network error. Please check your connection and try again.',
        };
      }

      // Handle CORS or other API errors
      if (error instanceof Error && error.message.includes('CORS')) {
        return {
          success: false,
          message: 'Unable to connect to newsletter service. Please try again later.',
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to subscribe to newsletter',
      };
    }
  }

  /**
   * Check subscription status from local storage
   */
  static async getSubscriptionStatus(): Promise<{
    subscribed: boolean;
    email?: string;
    date?: string;
  }> {
    const result = await chrome.storage.sync.get('newsletterSubscription');
    return result.newsletterSubscription || { subscribed: false };
  }

  /**
   * Save subscription status to local storage
   */
  static async saveSubscriptionStatus(email: string): Promise<void> {
    await chrome.storage.sync.set({
      newsletterSubscription: {
        subscribed: true,
        email,
        date: new Date().toISOString(),
      },
    });
  }

  /**
   * Get usage statistics for determining when to show subscription prompts
   */
  static async getUsageStats(): Promise<{
    interactionCount: number;
    lastSubscriptionPrompt?: string;
  }> {
    const result = await chrome.storage.sync.get('usageStats');
    return result.usageStats || { interactionCount: 0 };
  }

  /**
   * Increment interaction count
   */
  static async incrementInteractionCount(): Promise<number> {
    const stats = await this.getUsageStats();
    const newCount = stats.interactionCount + 1;

    await chrome.storage.sync.set({
      usageStats: {
        ...stats,
        interactionCount: newCount,
      },
    });

    return newCount;
  }

  /**
   * Update last subscription prompt date
   */
  static async updateLastPromptDate(): Promise<void> {
    const stats = await this.getUsageStats();
    await chrome.storage.sync.set({
      usageStats: {
        ...stats,
        lastSubscriptionPrompt: new Date().toISOString(),
      },
    });
  }

  /**
   * Check if we should show subscription prompt based on usage patterns
   */
  static async shouldShowSubscriptionPrompt(): Promise<boolean> {
    const subscription = await this.getSubscriptionStatus();
    if (subscription.subscribed) return false;

    const stats = await this.getUsageStats();
    const { interactionCount, lastSubscriptionPrompt } = stats;

    // Only show after 3 successful interactions
    if (interactionCount < 3) return false;

    // Don't show more than once every 30 days
    if (lastSubscriptionPrompt) {
      const lastPrompt = new Date(lastSubscriptionPrompt);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      if (lastPrompt > thirtyDaysAgo) return false;
    }

    // Show on specific interaction counts (3rd, 10th interaction)
    return interactionCount === 3 || interactionCount === 10;
  }
}
