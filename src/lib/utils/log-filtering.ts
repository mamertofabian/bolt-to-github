import type { LogEntry } from './logStorage';

export interface LogFilterOptions {
  level?: string;
  context?: string;
  searchTerm?: string;
}

export interface LogStats {
  total: number;
  filtered: number;
}

/**
 * Filters logs based on level, context, and search term
 * @param logs - Array of log entries to filter
 * @param options - Filter options
 * @returns Filtered array of log entries
 */
export function filterLogs(logs: LogEntry[], options: LogFilterOptions = {}): LogEntry[] {
  const { level = 'all', context = 'all', searchTerm = '' } = options;

  return logs
    .filter((log) => {
      // Level filter
      if (level !== 'all' && log.level !== level) {
        return false;
      }

      // Context filter
      if (context !== 'all' && log.context !== context) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          log.message.toLowerCase().includes(searchLower) ||
          log.module.toLowerCase().includes(searchLower) ||
          (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
        );
      }

      return true;
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Calculates log statistics
 * @param logs - Array of all log entries
 * @param filteredLogs - Array of filtered log entries
 * @returns Log statistics
 */
export function calculateLogStats(logs: LogEntry[], filteredLogs: LogEntry[]): LogStats {
  return {
    total: logs.length,
    filtered: filteredLogs.length,
  };
}

/**
 * Formats a log entry for text export
 * @param log - Log entry to format
 * @returns Formatted log string
 */
export function formatLogForText(log: LogEntry): string {
  const dataStr = log.data ? ` | Data: ${JSON.stringify(log.data)}` : '';
  return `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.context}] [${log.module}] ${log.message}${dataStr}`;
}

/**
 * Formats multiple log entries for text export
 * @param logs - Array of log entries to format
 * @returns Formatted text content
 */
export function formatLogsForTextExport(logs: LogEntry[]): string {
  return logs.map(formatLogForText).join('\n');
}

/**
 * Creates export data structure for bug reports
 * @param logs - Array of log entries
 * @param metadata - Optional metadata
 * @returns Export data structure
 */
export function createLogExportData(
  logs: LogEntry[],
  metadata: { timestamp: string; version: string } = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }
) {
  return {
    metadata,
    logs,
  };
}

/**
 * Debounces a search term
 * @param searchTerm - Current search term
 * @param debouncedTerm - Previous debounced term
 * @param delay - Debounce delay in milliseconds
 * @returns Object with debounced term and timeout ID
 */
export function debounceSearchTerm(
  searchTerm: string,
  debouncedTerm: string
): { debouncedTerm: string; timeoutId: number | null } {
  // If search term hasn't changed, return current state
  if (searchTerm === debouncedTerm) {
    return { debouncedTerm, timeoutId: null };
  }

  // If search term is empty, return immediately
  if (!searchTerm) {
    return { debouncedTerm: '', timeoutId: null };
  }

  // Return the search term with a timeout ID for cleanup
  return { debouncedTerm: searchTerm, timeoutId: 1 };
}

/**
 * Checks if user is at the bottom of a scrollable container
 * @param scrollTop - Current scroll position
 * @param scrollHeight - Total scrollable height
 * @param clientHeight - Visible height
 * @param tolerance - Tolerance in pixels (default: 50)
 * @returns True if user is at the bottom
 */
export function isAtScrollBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  tolerance: number = 50
): boolean {
  return scrollHeight - scrollTop - clientHeight < tolerance;
}

/**
 * Generates a filename for log exports
 * @param prefix - Filename prefix
 * @param extension - File extension
 * @param date - Optional date (defaults to current date)
 * @returns Generated filename
 */
export function generateLogFilename(
  prefix: string,
  extension: string,
  date: Date = new Date()
): string {
  const dateStr = date.toISOString().split('T')[0];
  return `${prefix}-${dateStr}.${extension}`;
}
