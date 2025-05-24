# Premium Features Implementation

## Overview

This document outlines the implementation of premium features for the Bolt to GitHub extension, designed to create a sustainable freemium model while maintaining value for free users.

## Freemium Strategy

### Free Tier

- ✅ Core GitHub push functionality (unlimited)
- ✅ Basic notifications and status updates
- ✅ Project management and repository settings
- ✅ 3 file changes views per day (resets at midnight)

### Premium Tier ($4/month, $40/year)

- ✅ **Unlimited File Changes**: View and compare unlimited file changes per day
- ✅ **Smart Push Reminders**: Intelligent reminders with idle detection and scheduled notifications
- ✅ **Branch Selector**: Choose specific branches when importing private repositories
- ✅ No trial period - users know the value from generous free features
- ✅ Cancel anytime

## Technical Implementation

### 1. PremiumService (`src/content/services/PremiumService.ts`)

**Core Features:**

- Premium status management with expiration handling
- Daily usage limits tracking (3 file changes for free users)
- Feature access control
- Local storage persistence
- Automatic daily limit resets at midnight

**Key Methods:**

- `isPremium()`: Check current premium status
- `hasFeature(feature)`: Check specific feature access
- `canUseFileChanges()`: Check file changes quota
- `useFileChanges()`: Track usage for free users
- `updatePremiumStatus()`: Update premium status (for future SSO)

### 2. Premium Gating Implementation

#### File Changes Gating (`src/content/handlers/FileChangeHandler.ts`)

- Checks premium status before allowing file changes viewing
- Tracks usage for free users (3/day limit)
- Shows upgrade prompts when limits are reached
- Displays remaining uses to free users

#### Push Reminders Gating (`src/content/services/PushReminderService.ts`)

- Requires premium access for all reminder features
- Shows upgrade notifications when accessed by free users
- Maintains full functionality for premium users

#### Branch Selector Gating (`src/lib/components/ProjectsList.svelte`)

- Checks premium status before showing branch selection for private repos
- Triggers upgrade modal for free users
- Allows full branch selection for premium users

### 3. Upgrade Modal (`src/popup/components/UpgradeModal.svelte`)

**Features:**

- Context-aware messaging based on triggered feature
- Premium features showcase
- Pricing display ($4/month, $40/year)
- Trust indicators (1,000+ developers, secure payment)
- Direct link to upgrade page (https://bolt2github.com/upgrade)

**Trigger Contexts:**

- File changes limit reached
- Push reminders access attempt
- Branch selector for private repos
- General premium features showcase

### 4. Background Service Integration (`src/background/BackgroundService.ts`)

**Premium Feature Checking:**

- `handleCheckPremiumFeature()`: Centralized premium status checking
- Currently returns `false` for all features (free tier default)
- Ready for future SSO integration
- Handles `CHECK_PREMIUM_FEATURE` messages from popup/content scripts

### 5. UI Integration (`src/popup/App.svelte`)

**Premium Status Display:**

- Premium badges on restricted features
- Usage status for free users (3 file changes per day)
- Upgrade button with gradient styling
- Settings section with premium indicators

**Event Handling:**

- Listens for `showUpgrade` custom events
- Displays appropriate upgrade modal based on context
- Manages modal state and feature information

## User Experience Flow

### Free User Journey

1. **First Use**: Full access to core features
2. **File Changes**: 3 free views per day with remaining count display
3. **Limit Reached**: Upgrade prompt with clear benefits
4. **Premium Features**: Upgrade prompts with feature explanations
5. **Daily Reset**: Automatic quota reset at midnight

### Premium User Journey (Future)

1. **Upgrade**: Purchase activation
2. **Full Access**: All features unlocked immediately
3. **No Limits**: Unlimited file changes and full feature set
4. **Ongoing**: Monthly billing with cancel anytime option

## Supabase + LemonSqueezy Integration

### Authentication Flow

1. **Sign Up First**: Users click upgrade → redirected to https://bolt2github.com/signup
2. **Authentication**: Supabase handles user registration and login
3. **Upgrade Flow**: Authenticated users can access https://bolt2github.com/upgrade
4. **Payment Processing**: LemonSqueezy handles subscription management
5. **Status Detection**: Extension detects authentication via SupabaseAuthService

### Technical Integration

- `SupabaseAuthService`: Monitors authentication status across browser tabs
- **Token Detection**: Checks localStorage for Supabase session tokens
- **Subscription Validation**: Calls Supabase edge functions to verify LemonSqueezy subscriptions
- **Real-time Updates**: Automatic premium status updates when subscription changes

### Backend Integration (Supabase Edge Functions)

- `check-subscription`: Validates LemonSqueezy subscription status
- Webhook handling for subscription events (create, cancel, expire)
- JWT token validation for secure API access
- Real-time subscription status updates

## Pricing Strategy

### Competitive Analysis

- **Target Price**: $4/month, $40/year (no trial needed)
- **Value Proposition**: Time-saving automation for developers with proven utility
- **Market Position**: Premium developer tools pricing with generous free tier
- **Open Source Trust**: Users trust the value since code is open source

### Revenue Projections

- **Current Users**: 4,000 active users
- **Conversion Target**: 5-10% (200-400 premium users)
- **Monthly Revenue**: $1,000-$2,000
- **Annual Revenue**: $12,000-$24,000

## Implementation Status

### ✅ Completed

- [x] Premium service architecture
- [x] Usage limits and tracking
- [x] Feature gating for all premium features
- [x] Upgrade modal with compelling messaging ($4/month, $40/year)
- [x] UI integration with premium indicators
- [x] Background service premium checking
- [x] Local storage persistence
- [x] Daily limit resets
- [x] SupabaseAuthService for authentication detection
- [x] Supabase + LemonSqueezy integration architecture
- [x] Authentication-aware upgrade flow (signup → upgrade)

### 🔄 Ready for Configuration

- [ ] Configure actual Supabase project URL and anon key
- [ ] Implement Supabase edge function for subscription checking
- [ ] Set up LemonSqueezy webhook integration
- [ ] Test end-to-end authentication and subscription flow

### 📈 Future Enhancements

- [ ] Usage analytics and insights
- [ ] A/B testing for conversion optimization
- [ ] Additional premium features
- [ ] Team/organization plans
- [ ] Annual subscription discounts

## Testing

### Manual Testing Scenarios

1. **Free User Limits**: Test 3 file changes per day limit
2. **Upgrade Prompts**: Verify all premium feature triggers
3. **Daily Reset**: Confirm midnight quota reset
4. **Premium Indicators**: Check UI premium badges
5. **Modal Functionality**: Test upgrade modal flows

### Debug Features

- Premium status can be manually set in browser storage
- Usage limits can be reset for testing
- Feature access can be toggled for development

## Conclusion

The premium features implementation provides a solid foundation for monetizing the extension while maintaining a positive experience for free users. The architecture is designed for easy SSO integration and future feature expansion, positioning the extension for sustainable growth and development funding.
