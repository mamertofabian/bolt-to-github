# 30-Day Authentication Failure Fix

## Problem Description

After ~30 days of not using the extension, GitHub push operations would fail with authentication errors. The only solution was to disable/enable the extension in chrome://extensions.

## Root Cause Analysis

The issue was a **cascade failure** with two layers:

### Layer 1: Supabase Authentication (Primary Issue)

- **Supabase refresh tokens expire after ~30 days of inactivity**
- The extension stored refresh tokens but **never tracked when they were issued**
- When tokens expired, the extension would:
  1. Try to use the expired access token
  2. Attempt to refresh with the expired refresh token
  3. Fail silently without triggering re-authentication

### Layer 2: GitHub App Token Retrieval (Cascade Effect)

When you try to push to GitHub:

1. `GitHubAppAuthenticationStrategy.getToken()` calls `GitHubAppService.getAccessToken()`
2. `getAccessToken()` needs a Supabase user token to authenticate with the edge function
3. `getUserToken()` blindly retrieves the stored Supabase token **without checking if it's expired**
4. The Supabase edge function call fails because the Supabase token is expired
5. Returns `TOKEN_EXPIRED_NO_REFRESH` or `TOKEN_RENEWAL_FAILED`
6. GitHub push fails with "Failed to get GitHub App token"

**Why disabling/enabling the extension worked:** It cleared the stale tokens from storage, forcing a fresh authentication flow.

## Solution Implemented

### Fix 1: Track Refresh Token Age in SupabaseAuthService

**File:** `src/content/services/SupabaseAuthService.ts`

#### Added refresh token age tracking:

```typescript
// Store when refresh token was issued
storageData.refreshTokenIssuedAt = Date.now();
```

#### Check token age before refresh:

```typescript
const refreshTokenAge = storedTokens.refreshTokenIssuedAt
  ? now - storedTokens.refreshTokenIssuedAt
  : 0;
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

if (refreshTokenAge > REFRESH_TOKEN_MAX_AGE) {
  logger.warn(
    `🕐 Refresh token is very old (${Math.round(
      refreshTokenAge / (24 * 60 * 60 * 1000)
    )} days). Likely expired. Clearing tokens to force re-authentication.`
  );
  // Clear all tokens immediately
  await chrome.storage.local.remove([
    'supabaseToken',
    'supabaseRefreshToken',
    'supabaseTokenExpiry',
    'refreshTokenIssuedAt',
  ]);
  return null;
}
```

#### Enhanced error handling for expired refresh tokens:

```typescript
const isRefreshTokenExpired =
  response.status === 400 && errorData.error_description?.includes('refresh');
const isInvalidGrant =
  errorData.error === 'invalid_grant' || errorData.error_description?.includes('invalid');

if (isRefreshTokenExpired || isInvalidGrant) {
  logger.error(
    '🕐 Refresh token is expired or invalid. Both access and refresh tokens need re-authentication.'
  );
}
```

### Fix 2: Validate Supabase Token in GitHubAppService

**File:** `src/services/GitHubAppService.ts`

#### Check Supabase token expiration before using it:

```typescript
private async getUserToken(): Promise<string> {
  // ... existing code ...

  if (authData?.access_token) {
    // Check if the Supabase token might be expired
    const tokenExpiry = result.supabaseTokenExpiry || 0;
    const now = Date.now();

    // If token is expired, check refresh token age
    if (tokenExpiry < now) {
      // Handle missing refreshTokenIssuedAt (legacy installations)
      if (!result.refreshTokenIssuedAt) {
        logger.warn(
          '⚠️ Supabase token is expired and refresh token age is unknown (legacy installation). ' +
          'Allowing through - SupabaseAuthService will validate and trigger re-auth if needed.'
        );
      } else {
        const refreshTokenAge = now - result.refreshTokenIssuedAt;
        const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

        if (refreshTokenAge > REFRESH_TOKEN_MAX_AGE) {
          logger.warn(
            `🕐 Supabase refresh token is very old (${Math.round(
              refreshTokenAge / (24 * 60 * 60 * 1000)
            )} days). GitHub operations will likely fail. User needs to re-authenticate.`
          );
          throw new Error('Supabase authentication expired. Please re-authenticate via bolt2github.com.');
        }

        logger.warn('⚠️ Supabase token is expired but refresh token might work. Attempting to use it anyway.');
      }
    }

    this.userToken = authData.access_token;
    return authData.access_token;
  }
}
```

## How It Works Now

### Before 30 Days (Normal Operation)

1. User pushes to GitHub
2. Extension checks Supabase token → valid
3. Extension gets GitHub App token → success
4. Push completes → ✅

### After 30+ Days (Fixed)

1. User pushes to GitHub
2. Extension checks Supabase token expiration
3. If refresh token > 30 days old:
   - Extension immediately detects expired tokens
   - Throws clear error: "Supabase authentication expired"
   - Triggers re-authentication flow
   - Opens bolt2github.com automatically
   - User re-authenticates
   - Push retry succeeds → ✅

### No More Need to Disable/Enable Extension

- Tokens are proactively validated
- Expired tokens trigger proper re-authentication
- Self-healing flow guides user through reconnection
- No manual intervention needed

## Testing

✅ TypeScript compilation passes  
✅ Build succeeds  
✅ No linter errors

## User Experience Improvements

**Before:**

- ❌ Silent failure after 30 days
- ❌ Confusing "Failed to get GitHub token" error
- ❌ Required disabling/enabling extension
- ❌ No clear guidance on what to do

**After:**

- ✅ Proactive token age detection
- ✅ Clear "Supabase authentication expired" error
- ✅ Automatic re-authentication flow
- ✅ Guided reconnection process
- ✅ No manual extension toggling needed

## Related Issues

- Addresses the 30-day authentication failure
- Fixes the cascade effect from Supabase → GitHub App authentication
- Complements the existing `GITHUB_TOKEN_RENEWAL_FIX.md` solution
- Works together with the self-healing authentication flow

## Technical Details

### Storage Keys Modified

- `refreshTokenIssuedAt` - New key to track when refresh token was issued
- Cleaned up in all token clearing operations

### Services Modified

1. `SupabaseAuthService` - Added refresh token age tracking and validation
2. `GitHubAppService` - Added Supabase token expiration checking

### Token Expiration Timeline

- **Access Token:** 1 hour (Supabase default)
- **Refresh Token:** ~30 days of inactivity (Supabase default)
- **GitHub App Token:** 1 hour (GitHub default)
- **Detection Window:** Proactively checks at token retrieval time

## Migration Notes & Edge Cases

### Handling Missing `refreshTokenIssuedAt`

For existing users who installed the extension before this fix:

- If `refreshTokenIssuedAt` is missing, we **allow the token through** with a warning
- The primary validation happens in `SupabaseAuthService`, which will catch expired tokens
- On the first token refresh after the update, `refreshTokenIssuedAt` will be set
- This provides graceful migration without forcing immediate re-authentication

### Null/Undefined Safety

The code defensively handles all missing values:

- `result.supabaseTokenExpiry || 0` - Treats missing expiry as "already expired"
- `!result.refreshTokenIssuedAt` check - Explicitly handles missing timestamp
- `result.refreshTokenIssuedAt ? ... : 0` - Ternary operator for safe calculation

This ensures:

- ✅ No breaking changes to existing authentication flow
- ✅ Backward compatible with existing storage schema
- ✅ Graceful degradation for legacy installations
- ✅ No crashes from null/undefined values
- ✅ Progressive enhancement as users authenticate
