# Newsletter Subscription Setup

This document explains how to configure the newsletter subscription feature that integrates with MailerLite.

## Overview

The newsletter subscription feature provides an unintrusive way for users to opt-in to receive updates about new features, tips, and community news. The implementation follows these principles:

- **Unintrusive**: Never interrupts the core user flow
- **Value-driven**: Clear communication of what users will receive
- **Privacy-focused**: Easy to unsubscribe, respects user preferences
- **Smart timing**: Shows prompts only at contextually appropriate moments

## MailerLite Configuration

### 1. Get Your MailerLite API Key

1. Log in to your [MailerLite account](https://www.mailerlite.com/)
2. Go to **Integrations** > **Developer API**
3. Generate a new API token
4. Copy the API token

### 2. Configure the Extension

In `src/services/SubscriptionService.ts`, replace the placeholder API key:

```typescript
constructor() {
  // Replace this with your actual MailerLite API key
  this.apiKey = 'YOUR_ACTUAL_MAILERLITE_API_KEY';
}
```

### 3. Optional: Configure Groups

If you want to assign subscribers to specific MailerLite groups:

```typescript
const payload = {
  email: data.email,
  // ... other fields
  groups: ['your-group-id-here'], // Add your MailerLite group ID
  // ...
};
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

### MailerLite Fields

The extension sends these custom fields to MailerLite:

- `name`: User's name (optional)
- `source`: Always "extension"
- `version`: Extension version number
- `subscription_date`: ISO timestamp
- `preferences`: JSON string of subscription preferences

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

- MailerLite-specific error handling
- Clear user feedback
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

- [ ] Replace placeholder API key with actual MailerLite key
- [ ] Test subscription flow in development
- [ ] Verify MailerLite webhook (if using double opt-in)
- [ ] Configure MailerLite groups (if desired)
- [ ] Test error scenarios
- [ ] Verify privacy policy mentions newsletter
- [ ] Test unsubscribe flow

## Security Considerations

- **API Key Protection**: Store securely, never expose in client code
- **CORS Configuration**: MailerLite API supports CORS for web extensions
- **Data Validation**: All input validated before sending to API
- **Rate Limiting**: Prevent spam submissions

## Support

For issues with:

- **MailerLite API**: Check [MailerLite API documentation](https://developers.mailerlite.com/)
- **Extension Integration**: Review this documentation and test files
- **User Experience**: Adjust timing and messaging as needed

The newsletter feature is designed to be unintrusive and valuable to users while respecting their privacy and preferences.
