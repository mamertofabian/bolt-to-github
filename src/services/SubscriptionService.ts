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
  private apiEndpoint = 'https://connect.mailerlite.com/api/subscribers'; // MailerLite API endpoint
  private apiKey: string = '';

  constructor() {
    // In a real implementation, you would get this from environment variables
    // or a secure configuration endpoint. For now, this should be configured
    // by the extension developer in their deployment.
    this.apiKey = 'YOUR_MAILERLITE_API_KEY'; // Replace with actual MailerLite API key
  }

  async subscribe(data: SubscriptionData): Promise<SubscriptionResponse> {
    try {
      // Prepare the payload for MailerLite API
      const payload = {
        email: data.email,
        fields: {
          name: data.name || '',
          source: data.metadata?.subscriptionSource || 'extension',
          version: chrome.runtime.getManifest().version,
          subscription_date: new Date().toISOString(),
          preferences: JSON.stringify(data.preferences || {}),
        },
        groups: [], // MailerLite group IDs can be added here if needed
        status: 'active',
        subscribed_at: new Date().toISOString(),
      };

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle MailerLite specific error responses
        if (response.status === 422 && errorData.errors?.email) {
          throw new Error('This email is already subscribed or invalid.');
        }
        if (response.status === 401) {
          throw new Error('Newsletter service configuration error.');
        }

        throw new Error(`Subscription failed: ${errorData.message || response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        message: 'Successfully subscribed to newsletter! You may receive a confirmation email.',
        subscriptionId: result.data?.id || 'unknown',
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
