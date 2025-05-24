# File Change Detection Improvements

## Problem Statement

The file change detection system was showing false positives where files appeared to be modified when they were actually unchanged. The main issues were:

1. **Missing GitHub content fetching**: When files were detected as "modified" based on hash comparison, the actual GitHub content wasn't fetched for proper comparison
2. **DiffViewer showing everything as "added"**: Due to missing `previousContent`, the DiffViewer treated all lines as new
3. **Content normalization issues**: Differences in line endings, encoding, or whitespace caused false positives
4. **Character encoding issues**: UTF-8 vs Latin-1 encoding mismatches (e.g., `Â©` vs `©`)
5. **Poor error handling**: Limited debugging information when comparison failed

## Changes Made

### 1. Enhanced GitHubComparisonService (`src/services/GitHubComparisonService.ts`)

**Key Improvements:**

- **Fetch actual GitHub content**: When hash comparison shows differences, now fetches the actual file content from GitHub
- **Content normalization**: Added proper normalization for line endings and whitespace
- **UTF-8 decoding**: Properly decode GitHub base64 content as UTF-8 instead of Latin-1
- **Double verification**: Compares normalized content directly after hash mismatch to catch false positives
- **Better progress reporting**: More detailed progress updates during comparison
- **Populate previousContent**: Now provides actual GitHub content in `FileChange.previousContent`

**New Logic Flow:**

1. Calculate hash of normalized local content
2. If hash differs from GitHub SHA:
   - Fetch actual GitHub content
   - Decode as proper UTF-8
   - Normalize GitHub content
   - Compare normalized contents directly
   - If they match: mark as "unchanged" (was false positive)
   - If they differ: mark as "modified" with proper `previousContent`

### 2. Improved DiffViewer (`src/lib/components/DiffViewer.svelte`)

**Key Improvements:**

- **Better content detection**: Checks for identical content after normalization before showing diff
- **Enhanced debugging**: More detailed debug information for troubleshooting
- **Better diff algorithm**: Uses FilePreviewService's LCS-based diff for accurate line-by-line comparison
- **Fallback handling**: Graceful fallback to basic diff if advanced algorithm fails
- **Uses shared normalization**: Now uses `normalizeContentForComparison()` for consistency

### 3. Enhanced FilePreviewService (`src/services/FilePreviewService.ts`)

**Key Improvements:**

- **Public diff method**: Added `calculateLineDiff()` for external use
- **Handle unchanged files**: Now properly shows unchanged files in diff viewer
- **Better error handling**: More robust error handling in diff calculation

### 4. Shared Content Utilities (`src/lib/fileUtils.ts`)

**New Functions:**

- **`normalizeContentForComparison()`**: Centralized content normalization ensuring consistency across all comparison points
- **`decodeBase64ToUtf8()`**: Proper UTF-8 decoding for GitHub API base64 content (fixes character encoding issues like `Â©` vs `©`)

### 5. Enhanced Store (`src/lib/stores/fileChanges.ts`)

**New Feature:**

- **`debugFileChanges()`**: Debug helper to log detailed file change information

## Character Encoding Fix

**Issue:** Files showing differences like `Â©` vs `©` due to UTF-8/Latin-1 encoding problems.

**Root Cause:** GitHub API returns base64 content, and `atob()` assumes Latin-1 encoding, not UTF-8.

**Solution:** Added `decodeBase64ToUtf8()` function that properly decodes base64 → bytes → UTF-8 string.

**Files Updated:**

- `src/services/GitHubComparisonService.ts` - Now uses proper UTF-8 decoding
- `src/services/FileService.ts` - Now uses proper UTF-8 decoding
- `src/lib/fileUtils.ts` - Added shared `decodeBase64ToUtf8()` function

## Testing the Improvements

### Before Testing

1. Make sure you have a GitHub token configured
2. Have a Bolt.new project with some files
3. Ensure the files exist in your connected GitHub repository

### Test Scenarios

#### 1. Test False Positive Detection

1. Open file changes detection
2. Look for files marked as "modified"
3. Check the diff viewer - should now show actual line-by-line changes
4. Files with only line ending differences should now show as "unchanged"

#### 2. Test Character Encoding

1. Look for files with special characters (like © symbols)
2. Should now correctly compare without showing encoding artifacts
3. No more `Â©` vs `©` differences

#### 3. Test Debug Information

```javascript
// In browser console
import { fileChangesActions } from './src/lib/stores/fileChanges.ts';
fileChangesActions.debugFileChanges();
```

#### 4. Test Content Normalization

1. Create a file with different line endings (CRLF vs LF)
2. Run file change detection
3. Should now correctly identify as unchanged if content is the same

### Expected Behaviors After Fix

✅ **Files with only line ending differences**: Should show as "unchanged"  
✅ **Files with only encoding differences**: Should show as "unchanged"  
✅ **Modified files**: Should show actual line-by-line differences in DiffViewer  
✅ **Added files**: Should show all lines as "added" (green)  
✅ **Deleted files**: Should show all lines as "deleted" (red)  
✅ **Special characters**: Should display correctly without encoding artifacts  
✅ **Debug information**: Should provide detailed debugging info when issues occur

### Debug Commands

```javascript
// Check current file changes state
fileChangesActions.debugFileChanges();

// Check normalization of content
import { normalizeContentForComparison } from '$lib/fileUtils';
const normalized = normalizeContentForComparison(yourContent);
console.log('Normalized:', normalized);

// Test UTF-8 decoding
import { decodeBase64ToUtf8 } from '$lib/fileUtils';
const decoded = decodeBase64ToUtf8(base64Content);
console.log('Decoded UTF-8:', decoded);
```

## Performance Considerations

- **Additional API calls**: Now fetches GitHub content for files with hash mismatches
- **Progress reporting**: Better visibility into potentially slower operations
- **Caching**: Consider adding caching for GitHub content in future improvements

## Future Enhancements

1. **Content caching**: Cache fetched GitHub content to avoid repeated API calls
2. **Binary file handling**: Better detection and handling of binary files
3. **Partial file updates**: Support for showing partial file changes in large files
4. **Smart comparison**: More intelligent comparison algorithms for specific file types

## Testing

### FileService Test Fix

Fixed a broken test in `FileService.test.ts` that was failing after introducing the `decodeBase64ToUtf8` function:

- **Issue**: Test was expecting `global.atob` to be called, but `FileService` now uses `decodeBase64ToUtf8`
- **Solution**: Added proper mock for `$lib/fileUtils` module and updated test assertions
- **Files Updated**: `src/services/__tests__/FileService.test.ts`

### New FileUtils Tests

Created comprehensive unit tests for `src/lib/fileUtils.ts`:

- **File**: `src/lib/__tests__/fileUtils.test.ts`
- **Coverage**: Tests for `processFilesWithGitignore`, `decodeBase64ToUtf8`, and `normalizeContentForComparison`
- **Key Features**:
  - Tests gitignore processing with various scenarios
  - Tests content normalization edge cases
  - Tests UTF-8 decoding (basic scenarios due to Jest environment limitations)
  - Validates actual behavior vs expected behavior
- **Notes**:
  - `calculateGitBlobHash` tests skipped due to complexity of mocking `crypto.subtle` in Jest
  - UTF-8 encoding tests are limited in Jest but work properly in browser environment

## Debugging Tips

If you still see false positives:

1. Check browser console for detailed debug information
2. Use `fileChangesActions.debugFileChanges()` to inspect file change data
3. Look for normalization differences in the debug output
4. Check network tab for GitHub API calls and responses
5. Check for character encoding issues in the debug output

## Latest Improvements

### 1. Contextual Diff View in DiffViewer

**Enhancement:** Shows only changed lines with surrounding context instead of entire files.

**Features:**

- Toggle between "Context" and "Full" view
- Configurable context lines (default: 3 lines around changes)
- Visual indicators for skipped lines (`... (X lines skipped) ...`)
- Contextual view information in header
- Improved performance for large files

**Files Updated:**

- `src/services/FilePreviewService.ts` - Added contextual diff algorithm
- `src/lib/components/DiffViewer.svelte` - Added view toggle and contextual display

### 2. Enhanced Loading States

**Enhancement:** Better user feedback during file comparison process.

**Features:**

- Extended loading notification duration (10 seconds)
- Progressive loading messages:
  - "Loading project files..." (initial)
  - "Comparing files with GitHub repository..." (during comparison)
- Better visibility into potentially slower operations

**Files Updated:**

- `src/content/handlers/FileChangeHandler.ts` - Enhanced loading notifications

### 3. Smart GitHub Push Confirmation

**Enhancement:** Context-aware confirmation dialog that shows file change summary.

**Features:**

- **With Changes**: Shows count of added/modified/deleted files
- **No Changes**: Warning dialog asking if user still wants to push
- Repository and branch information display
- Different button text based on change status:
  - "Push Changes" vs "Push Anyway"
- Change detection runs before showing confirmation

**Files Updated:**

- `src/content/handlers/GitHubUploadHandler.ts` - Enhanced push confirmation

### 4. Optimized Push from File Changes View

**Enhancement:** Eliminates redundant file comparison when pushing from file changes view.

**Problem:** When users clicked Push from the file changes view, the system was doing another full file comparison even though it had just done one to populate the view.

**Solution:**

- **Smart Change Detection**: `GitHubUploadHandler.handleGitHubPush()` now accepts `useStoredChanges` parameter
- **Stored Changes Reuse**: Checks local storage for recently computed file changes for the current project
- **Fallback to Fresh Comparison**: If no stored changes found, performs fresh comparison as before
- **Context-Aware Methods**:
  - `handleGitHubPush(true)` - Uses stored changes (default, for file changes view)
  - `handleGitHubPushWithFreshComparison()` - Forces fresh comparison (for main interface)

**Performance Impact:**

- **File Changes View → Push**: No redundant comparison, instant confirmation dialog
- **Main Interface → Push**: Still does comparison as before
- **Wrong Project Detection**: Ignores stored changes if project ID doesn't match

**Files Updated:**

- `src/content/handlers/GitHubUploadHandler.ts` - Added stored changes logic and optimized workflow

### 5. File Changes Refresh Button

**Enhancement:** Added refresh button to manually trigger file comparison with rate limiting protection.

**Problem:** Users had no way to manually refresh file changes after making modifications or when wanting to get the latest comparison.

**Solution:**

- **Refresh Button**: Added refresh button with spinning icon animation during refresh
- **Rate Limiting Aware**: Uses existing `GitHubApiClient` with built-in `RateLimitHandler`
- **Error Handling**: Displays rate limiting warnings and error messages
- **UI Feedback**:
  - Button shows "Refreshing..." with spinning icon during operation
  - Error display area with rate limiting guidance
  - Disabled button prevents multiple concurrent refreshes
- **Reuses Infrastructure**: Leverages existing comparison pipeline with all optimizations

**Message Flow:**

1. **Popup → Content Script**: `REFRESH_FILE_CHANGES` tab message
2. **Content Script**: Calls `uiManager.handleShowChangedFiles()` (force refresh)
3. **FileChangeHandler**: Uses `GitHubComparisonService` with rate limiting
4. **Content Script → Popup**: Updated changes via `OPEN_FILE_CHANGES` message

**Files Updated:**

- `src/popup/components/FileChangesModal.svelte` - Added refresh button and error handling
- `src/content/ContentManager.ts` - Added `REFRESH_FILE_CHANGES` message handler

### 6. Enhanced Push Button UX

**Enhancement:** Improved push button behavior with change detection and confirmation.

**Features:**

- **Change Count Display**: Button shows count of changes, e.g., "Push (3)" or "Push (No changes)"
- **Visual Feedback**: Button becomes semi-transparent when no changes detected
- **Smart Confirmation**: Shows confirmation dialog when pushing with 0 changes
- **Disabled During Refresh**: Push button disabled while file changes are refreshing
- **Detailed Header**: Shows breakdown of added/modified/deleted/unchanged files
- **Informative Tooltips**: Button tooltip explains what will happen

**User Experience:**

- **With Changes**: "Push (5)" → Direct push
- **No Changes**: "Push (No changes)" → Confirmation dialog → Push anyway or cancel
- **During Refresh**: Push button disabled to prevent conflicts

**Message Examples:**

- Header: "3 added, 2 modified, 1 deleted • 45 unchanged"
- No changes: "All 51 files are up to date"
- Confirmation: "No changes detected (51 unchanged files). Do you still want to push to GitHub?"

**Files Updated:**

- `src/popup/components/FileChangesModal.svelte` - Enhanced push button and change detection

### 7. Custom Confirmation Dialog

**Enhancement:** Replaced native browser confirm dialog with custom modal component.

**Problem:** Native `confirm()` dialog was jarring and didn't match the app's design system.

**Solution:**

- **Custom Component**: Created `ConfirmationDialog.svelte` with consistent design
- **Icon Support**: Warning, info, and danger icons with appropriate colors
- **Keyboard Support**: ESC to cancel, Enter to confirm
- **HTML Content**: Supports HTML formatting in messages (line breaks, emphasis)
- **Themed Design**: Matches existing dark theme and color scheme
- **Button Variants**: Contextual button colors (warning = yellow, danger = red, info = blue)

**Features:**

- **Visual Appeal**: Clean modal with icon, title, and formatted message
- **Accessibility**: Keyboard navigation and focus management
- **Customizable**: Different types (warning/info/danger) with appropriate styling
- **Responsive**: Works on mobile and desktop
- **Consistent**: Uses same Button and styling components as rest of app

**Example Usage:**

```svelte
<ConfirmationDialog
  bind:show={showConfirmationDialog}
  title="No Changes Detected"
  message="No changes detected (51 unchanged files).<br><br>Do you still want to push?"
  type="warning"
  confirmText="Push Anyway"
  cancelText="Cancel"
  onConfirm={handleConfirmPush}
  onCancel={handleCancelPush}
/>
```

**Files Updated:**

- `src/lib/components/ui/dialog/ConfirmationDialog.svelte` - New reusable confirmation dialog
- `src/popup/components/FileChangesModal.svelte` - Replaced native confirm with custom dialog

### Rate Limiting Protection

**Existing Infrastructure Used:**

- `GitHubApiClient` → `RateLimitHandler` → Handles all GitHub API calls
- **Burst Limit**: 10 requests before rate limiting kicks in
- **Request Spacing**: 1 second minimum between mutative requests
- **Retry Logic**: Exponential backoff with max 5 retries
- **Rate Limit Headers**: Respects `x-ratelimit-remaining` and `x-ratelimit-reset`
- **Sleep Logic**: Waits for rate limit reset when needed

**GitHubComparisonService Rate Limit Behavior:**

- Initial calls: Repository tree fetch (2-3 API calls)
- Content fetching: Only for files with hash mismatches (variable API calls)
- All requests go through `GitHubApiClient` with built-in rate limiting

### Benefits

1. **Better UX**: Users see only relevant changes in diff viewer
2. **Faster Review**: Context view focuses attention on actual changes
3. **Clear Feedback**: Loading states keep users informed during longer operations
4. **Informed Decisions**: Push confirmation shows exactly what will be uploaded
5. **Prevents Mistakes**: Warning when pushing with no changes
6. **Performance Optimization**: No redundant comparisons when pushing from file changes view
7. **Manual Refresh**: Users can refresh file changes on demand with rate limiting protection
8. **Rate Limiting Awareness**: Clear error messages when rate limits are hit
9. **Smart Push Behavior**: Change count display and confirmations prevent accidental pushes
10. **Enhanced Visual Feedback**: Clear indication of file status and button states
