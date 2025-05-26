# Newsletter Subscription Setup

This document explains how to configure the newsletter subscription feature that integrates with MailerLite via a secure Supabase function.

## Overview

The newsletter subscription feature provides an unintrusive way for users to opt-in to receive updates about new features, tips, and community news. The implementation follows these principles:

- **Unintrusive**: Never interrupts the core user flow
- **Value-driven**: Clear communication of what users will receive
- **Privacy-focused**: Easy to unsubscribe, respects user preferences
- **Smart timing**: Shows prompts only at contextually appropriate moments
- **Secure**: API keys are protected server-side via Supabase function

## Supabase Function Integration

### 1. Current Configuration

The extension is configured to use a Supabase Edge Function that securely handles MailerLite API integration:

**Endpoint**: `https://gapvjcqybzabnrjnxzhg.supabase.co/functions/v1/newsletter-subscription`

### 2. API Request Format

The extension sends subscription data in this format:

```typescript
{
  email: 'user@example.com',
  firstName: 'John',         // First part of name if provided
  lastName: 'Doe',           // Remaining parts of name if provided
  customFields: {
    source: 'extension',
    version: '1.3.0',
    subscription_date: '2024-01-03T10:30:00Z',
    preferences: '{"productUpdates":true,"tips":true}'
  }
}
```

### 3. Expected Response Format

**Success Response (201)**:

```json
{
  "success": true,
  "message": "Successfully subscribed to newsletter",
  "subscriber": {
    "id": "mailerlite_subscriber_id",
    "email": "user@example.com",
    "status": "active",
    "subscribedAt": "2024-01-03T10:30:00Z"
  }
}
```

**Error Response (422/400/500)**:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Feature Components

### 1. Newsletter Modal (`NewsletterModal.svelte`)

- Beautiful, accessible modal for email collection
- Includes value proposition and privacy information
- Success state with confirmation message
- Error handling for various scenarios

### 2. Success Toast (`SuccessToast.svelte`)

- Appears after successful actions (like saving settings)
- Optionally shows subscription prompt at appropriate times
- Non-intrusive design that doesn't interrupt workflow

### 3. Footer Integration (`Footer.svelte`)

- Subtle "Stay Updated" link for interested users
- Only appears if user hasn't already subscribed

### 4. Settings Integration (`GitHubSettings.svelte`)

- Optional checkbox in settings for newsletter subscription
- Inline email collection and subscription

## User Experience Flow

### Subscription Prompts

The system shows subscription prompts intelligently:

- **After 3rd successful interaction**: First prompt opportunity
- **After 10th successful interaction**: Second prompt opportunity
- **Maximum once per 30 days**: Prevents subscription fatigue
- **Never if already subscribed**: Respects user preference

### Touchpoints

1. **Settings Page**: Always-available checkbox option
2. **Success Toasts**: Contextual prompts after successful actions
3. **Footer Link**: Discoverable option for interested users
4. **Manual Trigger**: Users can always access via footer

## Data Storage

### Local Storage

- `newsletterSubscription`: Subscription status and email
- `usageStats`: Interaction count and last prompt date

### Custom Fields Sent to MailerLite

The extension sends these custom fields via the Supabase function:

- `source`: Always "extension"
- `version`: Extension version number
- `subscription_date`: ISO timestamp
- `preferences`: JSON string of subscription preferences

The Supabase function processes these and forwards to MailerLite with proper formatting.

## Privacy & Compliance

### GDPR Compliance

- Clear opt-in process
- Easy unsubscribe (handled by MailerLite)
- Privacy information displayed prominently
- No data collection without consent

### Data Handling

- Email only stored locally after successful subscription
- All subscription data sent directly to MailerLite
- No tracking cookies or analytics on subscription

## Testing

The feature includes comprehensive tests in `src/services/__tests__/SubscriptionService.test.ts`:

```bash
npm test
```

Tests cover:

- Subscription status management
- Usage statistics tracking
- Prompt timing logic
- MailerLite API integration
- Error handling

## Error Handling

### Network Errors

- Graceful fallback messages
- Retry-friendly error states
- No data loss on temporary failures

### API Errors

- Supabase function error handling
- Clear user feedback for various error scenarios
- Prevents duplicate subscription attempts

### Validation

- Email format validation
- Required field checking
- Prevents invalid submissions

## Customization

### Styling

All components use the existing design system:

- TailwindCSS classes
- Consistent color scheme
- Dark mode compatible
- Responsive design

### Messaging

Update subscription messaging in:

- `NewsletterModal.svelte`: Modal content
- `SuccessToast.svelte`: Toast messages
- `Footer.svelte`: Footer link text
- `GitHubSettings.svelte`: Settings description

### Timing

Adjust subscription prompt timing in `SubscriptionService.ts`:

```typescript
// Show on specific interaction counts
return interactionCount === 3 || interactionCount === 10;

// Adjust cooldown period (currently 30 days)
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
```

## Deployment Checklist

- [ ] Verify Supabase function is deployed and accessible
- [ ] Test subscription flow in development
- [ ] Verify MailerLite integration via Supabase function
- [ ] Test error scenarios (network errors, invalid emails, etc.)
- [ ] Verify privacy policy mentions newsletter
- [ ] Test unsubscribe flow (handled by MailerLite)

## Security Considerations

- **API Key Protection**: MailerLite API key is secured server-side in Supabase function
- **Client-side Security**: No sensitive credentials exposed in extension code
- **Data Validation**: Input validated both client-side and in Supabase function
- **Rate Limiting**: Can be implemented in Supabase function if needed

## Support

For issues with:

- **Supabase Function**: Check Supabase function logs and MailerLite API integration
- **MailerLite API**: Refer to [MailerLite API documentation](https://developers.mailerlite.com/)
- **Extension Integration**: Review this documentation and test files
- **User Experience**: Adjust timing and messaging as needed

The newsletter feature is designed to be unintrusive and valuable to users while respecting their privacy and preferences. The Supabase function integration ensures secure handling of API credentials and provides a robust, scalable solution.
