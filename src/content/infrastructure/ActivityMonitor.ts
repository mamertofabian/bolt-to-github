/**
 * ActivityMonitor detects user and Bolt AI activity to determine when it's appropriate
 * to show push reminders without interrupting active work.
 */
export class ActivityMonitor {
  private lastUserActivity: number = Date.now();
  private lastBoltActivity: number = Date.now();
  private isMonitoring: boolean = false;
  private listeners: (() => void)[] = [];

  // Activity thresholds (in milliseconds)
  private readonly USER_IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  private readonly BOLT_IDLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

  // DOM selectors for Bolt activity detection
  private readonly BOLT_ACTIVITY_SELECTORS = [
    '[data-testid="chat-input"]', // Chat input area
    '.animate-pulse', // Loading animations
    '.animate-spin', // Spinning indicators
    '[class*="loading"]', // Loading elements
    '[class*="generating"]', // AI generating content
    '[class*="streaming"]', // Streaming responses
  ];

  constructor() {
    this.setupUserActivityListeners();
    this.setupBoltActivityMonitoring();
  }

  /**
   * Set up listeners for user activity (mouse, keyboard, scroll, etc.)
   */
  private setupUserActivityListeners(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const updateUserActivity = () => {
      this.lastUserActivity = Date.now();
      this.notifyActivityChange();
    };

    events.forEach((event) => {
      document.addEventListener(event, updateUserActivity, { passive: true });
    });
  }

  /**
   * Set up monitoring for Bolt AI activity indicators
   */
  private setupBoltActivityMonitoring(): void {
    // Monitor for DOM changes that indicate Bolt activity
    const observer = new MutationObserver((mutations) => {
      let boltActivityDetected = false;

      mutations.forEach((mutation) => {
        // Check for new nodes being added that indicate Bolt activity
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;

              // Check if the added element or its children match Bolt activity patterns
              if (this.containsBoltActivity(element)) {
                boltActivityDetected = true;
              }
            }
          });
        }

        // Check for attribute changes that might indicate activity
        if (mutation.type === 'attributes') {
          const target = mutation.target as Element;
          if (this.containsBoltActivity(target)) {
            boltActivityDetected = true;
          }
        }
      });

      if (boltActivityDetected) {
        this.lastBoltActivity = Date.now();
        this.notifyActivityChange();
      }
    });

    // Start observing the document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-testid'],
    });
  }

  /**
   * Check if an element contains indicators of Bolt activity
   */
  private containsBoltActivity(element: Element): boolean {
    // Check if element itself matches activity selectors
    for (const selector of this.BOLT_ACTIVITY_SELECTORS) {
      if (element.matches(selector)) {
        return true;
      }
    }

    // Check if element contains child elements that match activity selectors
    for (const selector of this.BOLT_ACTIVITY_SELECTORS) {
      if (element.querySelector(selector)) {
        return true;
      }
    }

    // Check for specific text content that indicates AI activity
    const textContent = element.textContent?.toLowerCase() || '';
    const activityKeywords = [
      'generating',
      'thinking',
      'processing',
      'analyzing',
      'loading',
      'please wait',
    ];

    return activityKeywords.some((keyword) => textContent.includes(keyword));
  }

  /**
   * Check if user has been idle for the threshold period
   */
  public isUserIdle(): boolean {
    const timeSinceLastActivity = Date.now() - this.lastUserActivity;
    return timeSinceLastActivity >= this.USER_IDLE_THRESHOLD;
  }

  /**
   * Check if Bolt has been idle for the threshold period
   */
  public isBoltIdle(): boolean {
    const timeSinceLastActivity = Date.now() - this.lastBoltActivity;
    return timeSinceLastActivity >= this.BOLT_IDLE_THRESHOLD;
  }

  /**
   * Check if both user and Bolt are idle (safe time for reminders)
   */
  public isSystemIdle(): boolean {
    return this.isUserIdle() && this.isBoltIdle();
  }

  /**
   * Get time since last user activity in milliseconds
   */
  public getTimeSinceUserActivity(): number {
    return Date.now() - this.lastUserActivity;
  }

  /**
   * Get time since last Bolt activity in milliseconds
   */
  public getTimeSinceBoltActivity(): number {
    return Date.now() - this.lastBoltActivity;
  }

  /**
   * Add listener for activity changes
   */
  public addActivityListener(listener: () => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove activity listener
   */
  public removeActivityListener(listener: () => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of activity changes
   */
  private notifyActivityChange(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Error in activity listener:', error);
      }
    });
  }

  /**
   * Start monitoring (called automatically in constructor)
   */
  public start(): void {
    this.isMonitoring = true;
    console.log(
      '🔊 Activity monitor started - thresholds: user',
      this.USER_IDLE_THRESHOLD / 60000,
      'min, bolt',
      this.BOLT_IDLE_THRESHOLD / 60000,
      'min'
    );
  }

  /**
   * Stop monitoring and cleanup
   */
  public stop(): void {
    this.isMonitoring = false;
    this.listeners = [];
    console.log('🔊 Activity monitor stopped');
  }

  /**
   * Get debug information about current activity state
   */
  public getDebugInfo(): object {
    return {
      isMonitoring: this.isMonitoring,
      userIdleFor: this.getTimeSinceUserActivity(),
      boltIdleFor: this.getTimeSinceBoltActivity(),
      isUserIdle: this.isUserIdle(),
      isBoltIdle: this.isBoltIdle(),
      isSystemIdle: this.isSystemIdle(),
      listenerCount: this.listeners.length,
    };
  }
}
