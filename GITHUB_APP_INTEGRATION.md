# GitHub App Integration Guide

This document explains how to use the new GitHub App integration alongside existing Personal Access Token (PAT) functionality.

## Overview

The extension now supports two authentication methods:

1. **Personal Access Tokens (PAT)** - Legacy method, still fully supported
2. **GitHub Apps** - New method with higher rate limits (12,500/hour vs 5,000/hour)

## Backward Compatibility

**✅ All existing PAT functionality continues to work exactly as before.**

The new GitHub App integration is designed to be completely backward compatible. Existing users with PATs will experience no changes unless they explicitly choose to upgrade.

## Implementation Phases

### Phase 1: Core Infrastructure ✅

- `GitHubAppsApiClient` - Implements `IGitHubApiClient` using GitHub Apps
- `GitHubApiClientFactory` - Smart factory for choosing the best API client
- Enhanced `GitHubService` with factory methods
- Full backward compatibility with existing PAT functionality

### Phase 2: UI Integration ✅

- `GitHubConnector` - Simplified GitHub App connection for new users
- `RateLimitMonitor` - Shows rate limit usage and upgrade prompts for existing PAT users
- `GitHubAppMigrationModal` - Helps existing users migrate to GitHub App
- Enhanced stores with migration tracking and auth method detection

## Architecture

### New Components

1. **`GitHubAppsApiClient`** - Implements `IGitHubApiClient` using GitHub Apps
2. **`GitHubApiClientFactory`** - Smart factory for choosing authentication method
3. **`GitHubConnector`** - Simplified GitHub App connection for new users
4. **`RateLimitMonitor`** - Displays rate limit usage and warnings for PAT users
5. **`GitHubAppMigrationModal`** - Migration prompt for existing users

### Enhanced Components

1. **`GitHubService`** - Now supports factory methods for different user types
2. **`githubSettingsStore`** - Added migration tracking and auth method detection
3. **Popup App** - Integrated new components with smart defaults

## User Experience

### New Users

- **Default**: GitHub App authentication only (simplified onboarding)
- **No choice confusion**: Single "Connect to GitHub" flow
- **UI**: `GitHubConnector` component with streamlined experience

### Existing Users

- **Default**: Continue using existing PAT (no changes)
- **Optional**: Migration prompts when approaching rate limits
- **UI**: `RateLimitMonitor` shows usage and upgrade options

### Migration Flow

1. User sees rate limit warning in `RateLimitMonitor`
2. Click "Upgrade" opens `GitHubAppMigrationModal`
3. Modal explains benefits and guides through GitHub App setup
4. Seamless transition to higher rate limits

## Usage Examples

### For New Users (Onboarding)

```typescript
// Simplified GitHub App-only connection
<GitHubConnector
  onAuthenticationSelected={handleAuth}
/>
```

### For Existing Users (Settings)

```typescript
// Rate limit monitor shows upgrade prompts
<RateLimitMonitor
  githubToken={token}
  onUpgradeRequested={showMigrationModal}
/>
```

### Programmatic Usage

```typescript
// Factory automatically chooses best method
const service = await GitHubService.create({
  userType: 'new', // Uses GitHub App only
});

// Or for existing users
const service = await GitHubService.createForExistingUser(
  patToken,
  true // Allow upgrade
);
```

## Migration Strategy

### Automatic Detection

- Extension detects authentication method on startup
- Tracks migration eligibility and user preferences
- Shows prompts only when beneficial (approaching rate limits)

### User Control

- Migration is always optional for existing users
- Users can dismiss prompts (with 7-day cooldown)
- PAT users can continue indefinitely without changes
- New users get GitHub App by default (no choice needed)

### Smart Prompts

- Only shown to existing PAT users approaching rate limits
- Includes clear benefit explanation (2.5× higher limits)
- One-click migration with fallback to manual setup
- New users skip all this complexity

## Rate Limit Management

### Monitoring

- Real-time rate limit checking
- Visual progress bars and warnings
- Proactive upgrade suggestions

### Thresholds

- **Green**: >50% remaining
- **Yellow**: 20-50% remaining
- **Red**: <20% remaining (upgrade prompt)

### Benefits Communication

- Clear comparison: 5,000/hour (PAT) vs 12,500/hour (GitHub App)
- Real-time usage statistics
- Upgrade ROI explanation

## Testing

### Unit Tests

- `GitHubAppsApiClient.test.ts` - API client functionality
- `GitHubApiClientFactory.test.ts` - Factory logic
- Component tests for new UI elements

### Integration Tests

- End-to-end authentication flows
- Migration scenarios
- Backward compatibility verification

## Deployment Considerations

### Feature Flags

- Phase 2 features can be disabled via environment variables
- Gradual rollout capability
- Fallback to Phase 1 if needed

### Monitoring

- Track adoption rates of GitHub App vs PAT
- Monitor migration success rates
- Rate limit usage analytics

### Support

- Clear documentation for both authentication methods
- Migration troubleshooting guide
- Rollback procedures if needed

## Future Enhancements

### Phase 3 (Planned)

- Advanced GitHub App features (webhooks, fine-grained permissions)
- Organization-level GitHub App support
- Enhanced analytics and reporting

### Potential Improvements

- Automatic token refresh for GitHub Apps
- Multi-account support
- Advanced rate limit optimization

## Token Selection Logic

The system intelligently chooses tokens based on operation type:

### User Actions (Use User Token for Attribution)

- Creating issues/PRs
- Adding comments
- Repository management (create/delete)
- User profile updates

### Repository-Intensive Operations (Use Installation Token for Higher Limits)

- File tree traversal
- Content fetching
- Repository listing
- Bulk operations

## Rate Limits

| Authentication Method     | Rate Limit  | Use Case                |
| ------------------------- | ----------- | ----------------------- |
| Personal Access Token     | 5,000/hour  | Individual user actions |
| GitHub App (Installation) | 12,500/hour | Repository operations   |

## Error Handling

The system gracefully handles various scenarios:

```typescript
try {
  const githubService = await GitHubService.create({
    patToken: userToken,
    preferGitHubApp: true,
  });

  // Use service normally
  const repos = await githubService.listRepos();
} catch (error) {
  if (error.message.includes('GitHub App not installed')) {
    // Fallback to PAT or show installation prompt
  }
}
```

## Testing

Run the comprehensive test suite:

```bash
npm test -- --testPathPattern="GitHubApps"
```

## Integration Points

### Existing Code

No changes required to existing code using `GitHubService(token)`.

### New Code

Use factory methods for optimal authentication:

```typescript
// Instead of: new GitHubService(token)
const service = await GitHubService.create({ patToken: token });
```

## Benefits

1. **Higher Rate Limits**: 15K/hour vs 5K/hour
2. **Better Token Management**: Automatic token selection
3. **Improved Attribution**: User actions properly attributed
4. **Future-Proof**: Easy path for GitHub Apps adoption
5. **Zero Breaking Changes**: Complete backward compatibility

## Troubleshooting

### GitHub App Not Working

1. Check if GitHub App is installed for the user's repositories
2. Verify Supabase function configuration
3. Fallback to PAT authentication automatically occurs

### Rate Limit Issues

1. System automatically chooses best available token
2. Installation tokens provide 3x higher limits
3. Monitor rate limit status with `getAuthenticationStatus()`

## Development

When developing new features:

1. Use `GitHubService.create()` for new code
2. Test with both PAT and GitHub App scenarios
3. Ensure graceful fallbacks are implemented
4. Maintain backward compatibility
