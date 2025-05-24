export interface PremiumFeature {
  id: string;
  name: string;
  description: string;
  icon: string;
}

/**
 * Unified premium features definition used across the application
 * This eliminates duplication and ensures consistency
 */
export const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    id: 'view-file-changes',
    name: 'Detailed File Changes',
    description: 'View and compare file changes with GitHub repositories',
    icon: '📁',
  },
  {
    id: 'push-reminders',
    name: 'Smart Push Reminders',
    description: 'Intelligent reminders to push your changes when idle or on schedule',
    icon: '⏰',
  },
  {
    id: 'branch-selector',
    name: 'Import Specific Branches',
    description: 'Choose specific branches when importing private repositories',
    icon: '🌿',
  },
];

/**
 * Common upgrade modal configurations
 */
export const UPGRADE_MODAL_CONFIGS = {
  general: {
    feature: 'premium',
    reason: 'Unlock professional features',
    features: PREMIUM_FEATURES,
  },
  fileChanges: {
    feature: 'file-changes',
    reason:
      'File changes comparison is a Pro feature. Upgrade to view detailed file changes and comparisons!',
    features: PREMIUM_FEATURES,
  },
  pushReminders: {
    feature: 'push-reminders',
    reason: 'Smart push reminders are available for premium users only.',
    features: PREMIUM_FEATURES,
  },
  branchSelector: {
    feature: 'branch-selector',
    reason: 'Branch selection for private repositories is a premium feature.',
    features: PREMIUM_FEATURES,
  },
} as const;
