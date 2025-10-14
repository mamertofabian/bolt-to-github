import type { FileChange } from '../../services/FilePreviewService';

export interface ChangeCounts {
  added: number;
  modified: number;
  deleted: number;
  unchanged: number;
  total: number;
}

/**
 * Counts the number of files in each change status category
 * @param changes Map of file paths to their change status
 * @returns Object containing counts for each status type
 */
export function countChanges(changes: Map<string, FileChange>): ChangeCounts {
  let added = 0,
    modified = 0,
    deleted = 0,
    unchanged = 0;

  changes.forEach((change) => {
    switch (change.status) {
      case 'added':
        added++;
        break;
      case 'modified':
        modified++;
        break;
      case 'deleted':
        deleted++;
        break;
      case 'unchanged':
        unchanged++;
        break;
    }
  });

  return { added, modified, deleted, unchanged, total: changes.size };
}

/**
 * Determines if there are actual changes (added, modified, or deleted files)
 * @param changeCounts Object containing counts for each change status
 * @returns true if there are actual changes, false otherwise
 */
export function hasActualChanges(changeCounts: ChangeCounts): boolean {
  return changeCounts.added > 0 || changeCounts.modified > 0 || changeCounts.deleted > 0;
}

/**
 * Generates a confirmation message for pushing when no changes are detected
 * @param unchangedCount Number of unchanged files
 * @returns Formatted confirmation message
 */
export function generateNoChangesConfirmationMessage(unchangedCount: number): string {
  return `No changes detected (${unchangedCount} unchanged files).

Do you still want to push to GitHub?`;
}

/**
 * Calculates the total number of actual changes (added + modified + deleted)
 * @param changeCounts Object containing counts for each change status
 * @returns Total number of actual changes
 */
export function getTotalActualChanges(changeCounts: ChangeCounts): number {
  return changeCounts.added + changeCounts.modified + changeCounts.deleted;
}

/**
 * Determines if a push action should show a confirmation dialog
 * @param hasChanges Whether there are actual changes
 * @returns true if confirmation should be shown, false otherwise
 */
export function shouldShowPushConfirmation(hasChanges: boolean): boolean {
  return !hasChanges;
}
