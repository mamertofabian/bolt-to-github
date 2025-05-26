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
  return UPGRADE_MODAL_CONFIGS[type];
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
  const config = getUpgradeModalConfig(type);
  setState(config.feature, config.reason, config.features);
}
