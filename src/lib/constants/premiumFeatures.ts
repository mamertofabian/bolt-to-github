export interface PremiumFeature {
  id: string;
  name: string;
  description: string;
  benefits?: string[];
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
    benefits: [
      'See exactly what changed in each file',
      'Side-by-side diff comparison',
      'Track modifications across commits',
      'Identify potential conflicts early',
    ],
    icon: '📁',
  },
  {
    id: 'push-reminders',
    name: 'Smart Push Reminders',
    description: 'Intelligent reminders to push your changes when idle or on schedule',
    benefits: [
      'Never lose work with automatic alerts',
      'Customizable reminder intervals',
      'Smart detection of uncommitted changes',
      'Reduce risk of losing progress',
    ],
    icon: '⏰',
  },
  {
    id: 'branch-selector',
    name: 'Import Specific Branches',
    description: 'Choose specific branches when importing private repositories',
    benefits: [
      'Import only the branches you need',
      'Faster sync with targeted imports',
      'Better organization of work streams',
      'Avoid cluttering with unnecessary branches',
    ],
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
