import { UPGRADE_MODAL_CONFIGS, type PremiumFeature } from '../constants/premiumFeatures';

export type UpgradeModalType = keyof typeof UPGRADE_MODAL_CONFIGS;

export interface UpgradeModalData {
  feature: string;
  reason: string;
  features: PremiumFeature[];
}

/**
 * Get upgrade modal configuration by type
 */
export function getUpgradeModalConfig(type: UpgradeModalType): UpgradeModalData {
  const config = UPGRADE_MODAL_CONFIGS[type];
  if (!config) {
    console.error(
      'Invalid upgrade modal type:',
      type,
      'Available types:',
      Object.keys(UPGRADE_MODAL_CONFIGS)
    );
    // Return a default config to prevent errors
    return {
      feature: 'premium',
      reason: 'Unlock premium features',
      features: [],
    };
  }
  return config;
}

/**
 * Trigger upgrade modal with custom event (for components that use CustomEvent)
 */
export function triggerUpgradeModal(type: UpgradeModalType): void {
  const config = getUpgradeModalConfig(type);

  const event = new CustomEvent('showUpgrade', {
    detail: config,
  });

  window.dispatchEvent(event);
}

/**
 * Set upgrade modal state (for components that manage state directly)
 */
export function setUpgradeModalState(
  type: UpgradeModalType,
  setState: (feature: string, reason: string, features: PremiumFeature[]) => void
): void {
  console.log('setUpgradeModalState called with type:', type);
  const config = getUpgradeModalConfig(type);
  console.log('Retrieved config:', config);
  setState(config.feature, config.reason, config.features);
}
