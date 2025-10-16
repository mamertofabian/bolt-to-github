import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUpgradeModalConfig,
  triggerUpgradeModal,
  setUpgradeModalState,
  type UpgradeModalType,
  type UpgradeModalData,
} from '../upgradeModal';
import { UPGRADE_MODAL_CONFIGS, PREMIUM_FEATURES } from '../../constants/premiumFeatures';

describe('upgradeModal', () => {
  describe('getUpgradeModalConfig', () => {
    it('should return correct config for general upgrade type', () => {
      const result = getUpgradeModalConfig('general');

      expect(result).toEqual({
        feature: 'premium',
        reason: 'Unlock professional features',
        features: PREMIUM_FEATURES,
      });
    });

    it('should return correct config for fileChanges upgrade type', () => {
      const result = getUpgradeModalConfig('fileChanges');

      expect(result).toEqual({
        feature: 'file-changes',
        reason:
          'File changes comparison is a Pro feature. Upgrade to view detailed file changes and comparisons!',
        features: PREMIUM_FEATURES,
      });
    });

    it('should return correct config for pushReminders upgrade type', () => {
      const result = getUpgradeModalConfig('pushReminders');

      expect(result).toEqual({
        feature: 'push-reminders',
        reason: 'Smart push reminders are available for premium users only.',
        features: PREMIUM_FEATURES,
      });
    });

    it('should return correct config for branchSelector upgrade type', () => {
      const result = getUpgradeModalConfig('branchSelector');

      expect(result).toEqual({
        feature: 'branch-selector',
        reason: 'Branch selection for private repositories is a premium feature.',
        features: PREMIUM_FEATURES,
      });
    });

    it('should return correct config for issues upgrade type', () => {
      const result = getUpgradeModalConfig('issues');

      expect(result).toEqual({
        feature: 'issues',
        reason:
          'GitHub Issues management is a Pro feature. Upgrade to create and manage issues directly from Bolt!',
        features: PREMIUM_FEATURES,
      });
    });

    it('should return default config with empty features for invalid upgrade type', () => {
      const invalidType = 'nonExistentType' as UpgradeModalType;

      const result = getUpgradeModalConfig(invalidType);

      expect(result).toEqual({
        feature: 'premium',
        reason: 'Unlock premium features',
        features: [],
      });
    });

    it('should return config with features array reference from UPGRADE_MODAL_CONFIGS', () => {
      const result = getUpgradeModalConfig('general');

      expect(result.features).toBe(UPGRADE_MODAL_CONFIGS.general.features);
    });
  });

  describe('triggerUpgradeModal', () => {
    let capturedEvent: CustomEvent<UpgradeModalData> | null = null;

    beforeEach(() => {
      capturedEvent = null;
      vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
        capturedEvent = event as CustomEvent<UpgradeModalData>;
        return true;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should dispatch showUpgrade custom event with correct config for general type', () => {
      triggerUpgradeModal('general');

      expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.type).toBe('showUpgrade');
      expect(capturedEvent?.detail).toEqual({
        feature: 'premium',
        reason: 'Unlock professional features',
        features: PREMIUM_FEATURES,
      });
    });

    it('should dispatch showUpgrade custom event with correct config for fileChanges type', () => {
      triggerUpgradeModal('fileChanges');

      expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.type).toBe('showUpgrade');
      expect(capturedEvent?.detail).toEqual({
        feature: 'file-changes',
        reason:
          'File changes comparison is a Pro feature. Upgrade to view detailed file changes and comparisons!',
        features: PREMIUM_FEATURES,
      });
    });

    it('should dispatch showUpgrade custom event with correct config for pushReminders type', () => {
      triggerUpgradeModal('pushReminders');

      expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.type).toBe('showUpgrade');
      expect(capturedEvent?.detail.feature).toBe('push-reminders');
    });

    it('should dispatch showUpgrade custom event with correct config for branchSelector type', () => {
      triggerUpgradeModal('branchSelector');

      expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.type).toBe('showUpgrade');
      expect(capturedEvent?.detail.feature).toBe('branch-selector');
    });

    it('should dispatch showUpgrade custom event with correct config for issues type', () => {
      triggerUpgradeModal('issues');

      expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.type).toBe('showUpgrade');
      expect(capturedEvent?.detail.feature).toBe('issues');
    });

    it('should dispatch event with default config when invalid type is provided', () => {
      const invalidType = 'invalidType' as UpgradeModalType;

      triggerUpgradeModal(invalidType);

      expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent?.type).toBe('showUpgrade');
      expect(capturedEvent?.detail).toEqual({
        feature: 'premium',
        reason: 'Unlock premium features',
        features: [],
      });
    });

    it('should create CustomEvent with detail property containing config', () => {
      triggerUpgradeModal('general');

      expect(capturedEvent).toBeInstanceOf(CustomEvent);
      expect(capturedEvent?.detail).toBeDefined();
      expect(capturedEvent?.detail).toHaveProperty('feature');
      expect(capturedEvent?.detail).toHaveProperty('reason');
      expect(capturedEvent?.detail).toHaveProperty('features');
    });
  });

  describe('setUpgradeModalState', () => {
    it('should call setState with correct parameters for general type', () => {
      const setState = vi.fn();

      setUpgradeModalState('general', setState);

      expect(setState).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith(
        'premium',
        'Unlock professional features',
        PREMIUM_FEATURES
      );
    });

    it('should call setState with correct parameters for fileChanges type', () => {
      const setState = vi.fn();

      setUpgradeModalState('fileChanges', setState);

      expect(setState).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith(
        'file-changes',
        'File changes comparison is a Pro feature. Upgrade to view detailed file changes and comparisons!',
        PREMIUM_FEATURES
      );
    });

    it('should call setState with correct parameters for pushReminders type', () => {
      const setState = vi.fn();

      setUpgradeModalState('pushReminders', setState);

      expect(setState).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith(
        'push-reminders',
        'Smart push reminders are available for premium users only.',
        PREMIUM_FEATURES
      );
    });

    it('should call setState with correct parameters for branchSelector type', () => {
      const setState = vi.fn();

      setUpgradeModalState('branchSelector', setState);

      expect(setState).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith(
        'branch-selector',
        'Branch selection for private repositories is a premium feature.',
        PREMIUM_FEATURES
      );
    });

    it('should call setState with correct parameters for issues type', () => {
      const setState = vi.fn();

      setUpgradeModalState('issues', setState);

      expect(setState).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith(
        'issues',
        'GitHub Issues management is a Pro feature. Upgrade to create and manage issues directly from Bolt!',
        PREMIUM_FEATURES
      );
    });

    it('should call setState with default config when invalid type is provided', () => {
      const setState = vi.fn();
      const invalidType = 'unknown' as UpgradeModalType;

      setUpgradeModalState(invalidType, setState);

      expect(setState).toHaveBeenCalledTimes(1);
      expect(setState).toHaveBeenCalledWith('premium', 'Unlock premium features', []);
    });

    it('should not throw error if setState throws error', () => {
      const setState = vi.fn().mockImplementation(() => {
        throw new Error('setState failed');
      });

      expect(() => setUpgradeModalState('general', setState)).toThrow('setState failed');
    });

    it('should pass features array by reference from config', () => {
      const setState = vi.fn();

      setUpgradeModalState('general', setState);

      const calledFeatures = setState.mock.calls[0][2];
      expect(calledFeatures).toBe(PREMIUM_FEATURES);
    });
  });

  describe('integration between functions', () => {
    it('should use same config data in getUpgradeModalConfig and triggerUpgradeModal', () => {
      const configResult = getUpgradeModalConfig('fileChanges');

      let eventDetail: UpgradeModalData | null = null;
      const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
        eventDetail = (event as CustomEvent<UpgradeModalData>).detail;
        return true;
      });

      triggerUpgradeModal('fileChanges');

      expect(eventDetail).toEqual(configResult);

      dispatchEventSpy.mockRestore();
    });

    it('should use same config data in getUpgradeModalConfig and setUpgradeModalState', () => {
      const configResult = getUpgradeModalConfig('pushReminders');
      const setState = vi.fn();

      setUpgradeModalState('pushReminders', setState);

      expect(setState).toHaveBeenCalledWith(
        configResult.feature,
        configResult.reason,
        configResult.features
      );
    });
  });
});
