# Supabase + LemonSqueezy Setup Guide

## Overview

This guide walks you through setting up the Supabase authentication and LemonSqueezy subscription integration for the Bolt to GitHub extension's premium features.

## Prerequisites

- Supabase account and project
- LemonSqueezy account and store setup
- Basic understanding of edge functions and webhooks

## Step 1: Supabase Project Setup

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from the project settings
3. Enable authentication providers you want to support (email, GitHub, etc.)

### 1.2 Configure SupabaseAuthService

Update `src/content/services/SupabaseAuthService.ts`:

```typescript
// Replace these with your actual values
private readonly SUPABASE_URL = 'https://your-project-id.supabase.co';
private readonly SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### 1.3 Set up Database Tables

Create the following table in your Supabase SQL editor:

```sql
-- Create subscriptions table
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  lemonsqueezy_id TEXT UNIQUE NOT NULL,
  lemonsqueezy_customer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired', 'paused')),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read their own subscriptions
CREATE POLICY "Users can read own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

## Step 2: LemonSqueezy Setup

### 2.1 Create Products

1. Create your monthly plan ($4/month)
2. Create your yearly plan ($40/year)
3. Note the product IDs and variant IDs

### 2.2 Set up Webhooks

Configure LemonSqueezy webhooks to point to your Supabase edge function:

- URL: `https://your-project-id.supabase.co/functions/v1/lemonsqueezy-webhook`
- Events: `subscription_created`, `subscription_updated`, `subscription_cancelled`

## Step 3: Supabase Edge Functions

### 3.1 Install Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 3.2 Create Edge Functions

#### Check Subscription Function

Create `supabase/functions/check-subscription/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // Get user from JWT
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for active subscription
    const { data: subscription, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    const isActive = !!subscription && new Date(subscription.current_period_end) > new Date();

    return new Response(
      JSON.stringify({
        isActive,
        plan: subscription?.plan_type || 'free',
        expiresAt: subscription?.current_period_end,
        subscriptionId: subscription?.lemonsqueezy_id,
        customerId: subscription?.lemonsqueezy_customer_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking subscription:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

#### LemonSqueezy Webhook Function

Create `supabase/functions/lemonsqueezy-webhook/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

async function verifyWebhook(body: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get('LEMONSQUEEZY_WEBHOOK_SECRET') ?? '';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signatureBytes = Uint8Array.from(signature.split('').map((c) => c.charCodeAt(0)));
  const bodyBytes = encoder.encode(body);

  return await crypto.subtle.verify('HMAC', key, signatureBytes, bodyBytes);
}

serve(async (req) => {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-signature') ?? '';

    // Verify webhook signature
    const isValid = await verifyWebhook(body, signature);
    if (!isValid) {
      return new Response('Invalid signature', { status: 401 });
    }

    const payload = JSON.parse(body);
    const eventName = payload.meta?.event_name;
    const subscription = payload.data;

    // Handle different subscription events
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated':
        await handleSubscriptionUpdate(subscription);
        break;
      case 'subscription_cancelled':
        await handleSubscriptionCancellation(subscription);
        break;
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error', { status: 500 });
  }
});

async function handleSubscriptionUpdate(subscription: any) {
  const { data, error } = await supabaseAdmin.from('subscriptions').upsert({
    lemonsqueezy_id: subscription.id,
    lemonsqueezy_customer_id: subscription.attributes.customer_id,
    status: subscription.attributes.status,
    plan_type: subscription.attributes.variant_name.toLowerCase().includes('yearly')
      ? 'yearly'
      : 'monthly',
    current_period_start: subscription.attributes.current_period_start,
    current_period_end: subscription.attributes.current_period_end,
    // Note: you'll need to map the customer_id to user_id based on your auth flow
    user_id: await getUserIdFromCustomerId(subscription.attributes.customer_id),
  });

  if (error) {
    console.error('Error updating subscription:', error);
  }
}

async function handleSubscriptionCancellation(subscription: any) {
  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('lemonsqueezy_id', subscription.id);

  if (error) {
    console.error('Error cancelling subscription:', error);
  }
}

async function getUserIdFromCustomerId(customerId: string): Promise<string> {
  // Implement logic to map LemonSqueezy customer ID to Supabase user ID
  // This depends on how you store the customer mapping during checkout
  return ''; // placeholder
}
```

### 3.3 Deploy Edge Functions

```bash
supabase functions deploy check-subscription
supabase functions deploy lemonsqueezy-webhook
```

## Step 4: Frontend Integration

### 4.1 Update your website authentication

Ensure your bolt2github.com website:

1. Uses Supabase Auth for login/signup
2. Stores the customer ID mapping during LemonSqueezy checkout
3. Provides the upgrade page that handles subscription creation

### 4.2 Environment Variables

Set these in your Supabase dashboard (Project Settings > Edge Functions):

```
LEMONSQUEEZY_WEBHOOK_SECRET=your_webhook_secret
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Step 5: Testing

### 5.1 Test Authentication Flow

1. User clicks upgrade in extension
2. Gets redirected to signup page
3. Creates account and logs in
4. Gets redirected to upgrade page
5. Completes LemonSqueezy checkout
6. Extension detects authentication and premium status

### 5.2 Test Subscription Checking

1. Use Supabase logs to monitor edge function calls
2. Test webhook delivery from LemonSqueezy
3. Verify subscription status updates in real-time

## Step 6: Production Deployment

### 6.1 Update Extension

1. Update the Supabase URLs in `SupabaseAuthService.ts`
2. Test the full flow in a production-like environment
3. Deploy the updated extension

### 6.2 Monitor

1. Set up monitoring for edge functions
2. Monitor webhook delivery success rates
3. Track subscription conversion rates

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure proper CORS headers in edge functions
2. **Authentication failures**: Check JWT token format and expiry
3. **Webhook failures**: Verify signature validation and secret
4. **Permission errors**: Check RLS policies on database tables

### Debug Tools

1. Supabase logs dashboard
2. Chrome extension developer tools
3. LemonSqueezy webhook logs
4. Browser network tab for API calls

## Security Considerations

1. Always verify webhook signatures
2. Use RLS policies to protect user data
3. Never expose service role keys in client code
4. Implement rate limiting on edge functions
5. Log security events for monitoring

## Next Steps

After setup is complete:

1. Monitor conversion rates
2. A/B test pricing and messaging
3. Add analytics tracking
4. Consider additional premium features
5. Implement team/organization plans
