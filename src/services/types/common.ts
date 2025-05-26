/**
 * Common types used across GitHub services
 */

/**
 * Type for permission check progress callbacks
 */
export type PermissionCheckProgress = {
  permission: 'repos' | 'admin' | 'code';
  isValid: boolean;
};

/**
 * Type for progress callback functions
 */
export type ProgressCallback = (progress: PermissionCheckProgress) => void;
