/**
 * Business logic utilities for issue form validation and processing
 */

export interface IssueFormData {
  title: string;
  body: string;
}

export interface IssueFormValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates issue form data
 * @param data - The form data to validate
 * @returns Validation result with isValid flag and error messages
 */
export function validateIssueForm(data: IssueFormData): IssueFormValidationResult {
  const errors: string[] = [];

  if (!data.title || !data.title.trim()) {
    errors.push('Title is required');
  }

  if (data.title && data.title.trim().length > 2000) {
    errors.push('Title must be less than 2000 characters');
  }

  if (data.body && data.body.length > 10000) {
    errors.push('Description must be less than 10000 characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitizes and trims form data
 * @param data - The raw form data
 * @returns Sanitized form data
 */
export function sanitizeIssueFormData(data: IssueFormData): IssueFormData {
  return {
    title: data.title?.trim() || '',
    body: data.body?.trim() || '',
  };
}

/**
 * Checks if the form can be submitted (has valid title)
 * @param data - The form data to check
 * @returns True if form can be submitted
 */
export function canSubmitIssueForm(data: IssueFormData): boolean {
  return Boolean(data.title?.trim());
}

/**
 * Creates issue payload from form data
 * @param data - The form data
 * @returns Issue payload for API submission
 */
export function createIssuePayload(data: IssueFormData): { title: string; body: string } {
  const sanitized = sanitizeIssueFormData(data);
  return {
    title: sanitized.title,
    body: sanitized.body,
  };
}
