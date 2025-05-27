# Complete GitHub Apps Implementation Plan

_Adding GitHub Apps support to Bolt to GitHub extension while maintaining PAT workflow_

## 🏗️ Architecture Overview

```
Current: PAT + Supabase Auth + Freemium
    Extension (PAT) → GitHub API
    Extension → Web App (Supabase Session) → Premium Check

New: PAT + GitHub Apps + Supabase Auth + Freemium
    Extension (PAT) → GitHub API (fallback)
    Extension → Supabase → Edge Function → GitHub Apps Token → GitHub API
    Extension → Web App (Supabase Session) → Premium Check
```

---

## 📋 Phase 1: Foundation Setup

_Duration: 3-5 days_

### 1.1 Create GitHub App

**Steps:**

1. Go to GitHub Settings → Developer settings → GitHub Apps
2. Click "New GitHub App"
3. Fill configuration:

```yaml
App Name: "Bolt to GitHub"
Homepage URL: "https://bolt2github.com"
Authorization callback URL: "https://bolt2github.com/auth/github/callback"
Request user authorization (OAuth) during installation: ✅
Webhook URL: "https://bolt2github.com/api/webhooks/github" (optional)
Webhook secret: Generate and save
```

**Permissions:**

```yaml
Repository permissions:
  - Contents: Read & Write
  - Issues: Read & Write
  - Pull requests: Read & Write
  - Metadata: Read
  - Actions: Read (if needed)

Account permissions:
  - Email addresses: Read
  - Profile: Read
```

**Where can this GitHub App be installed:**

- [x] Any account

**Save these values:**

- App ID
- Client ID
- Client Secret
- Private Key (generate and download)

### 1.2 Update Environment Variables

**Supabase Dashboard → Settings → Environment Variables:**

```bash
GITHUB_APP_ID=123456
GITHUB_APP_CLIENT_ID=Iv1.abc123def456
GITHUB_APP_CLIENT_SECRET=your_client_secret_here
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
```

**Local Development (.env.local):**

```bash
NEXT_PUBLIC_GITHUB_APP_CLIENT_ID=Iv1.abc123def456
GITHUB_APP_CLIENT_SECRET=your_client_secret_here
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 📊 Phase 2: Database Schema Updates

_Duration: 1-2 days_

### 2.1 Database Migration

```sql
-- Add GitHub Apps support to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_app_installation_id BIGINT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_app_access_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_app_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'none'; -- 'none', 'pat', 'github_app'

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_github_username ON profiles(github_username);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_method ON profiles(auth_method);

-- Optional: Create separate table for better data organization
CREATE TABLE IF NOT EXISTS github_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL CHECK (integration_type IN ('pat', 'github_app')),

  -- GitHub App specific fields
  installation_id BIGINT,
  access_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Common fields
  github_username TEXT,
  github_user_id BIGINT,
  avatar_url TEXT,
  scopes TEXT[],

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Ensure one active integration per user per type
  UNIQUE(user_id, integration_type)
);

-- Enable RLS
ALTER TABLE github_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can manage their own github integrations"
  ON github_integrations FOR ALL
  USING (auth.uid() = user_id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_github_integrations_updated_at
  BEFORE UPDATE ON github_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Migration Script

Create `migrations/add_github_apps_support.sql` and run via Supabase CLI:

```bash
supabase db push
```

---

## ⚡ Phase 3: Supabase Edge Functions

_Duration: 2-3 days_

### 3.1 GitHub App Authentication Function

**Create `supabase/functions/github-app-auth/index.ts`:**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create, verify } from 'https://esm.sh/jsonwebtoken@9.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GitHubTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

interface GitHubUser {
  id: number;
  login: string;
  email: string;
  avatar_url: string;
  name: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, state } = await req.json();

    if (!code) {
      throw new Error('Authorization code is required');
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: Deno.env.get('GITHUB_APP_CLIENT_ID'),
        client_secret: Deno.env.get('GITHUB_APP_CLIENT_SECRET'),
        code: code,
      }),
    });

    const tokenData: GitHubTokenResponse = await tokenResponse.json();

    if ('error' in tokenData) {
      throw new Error((tokenData as any).error_description || 'Failed to exchange code for token');
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Bolt-to-GitHub-Extension',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      throw new Error(`GitHub API error: ${userResponse.status}`);
    }

    const userData: GitHubUser = await userResponse.json();

    // Get user email if not public
    let userEmail = userData.email;
    if (!userEmail) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'User-Agent': 'Bolt-to-GitHub-Extension',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((email: any) => email.primary);
        userEmail = primaryEmail?.email || emails[0]?.email;
      }
    }

    // Get authenticated user from Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Calculate expiration time
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : new Date(Date.now() + 8 * 60 * 60 * 1000); // Default 8 hours

    // Store GitHub App integration
    const { error: upsertError } = await supabase.from('github_integrations').upsert(
      {
        user_id: user.id,
        integration_type: 'github_app',
        access_token: tokenData.access_token,
        expires_at: expiresAt.toISOString(),
        github_username: userData.login,
        github_user_id: userData.id,
        avatar_url: userData.avatar_url,
        scopes: tokenData.scope ? tokenData.scope.split(',') : [],
        last_used_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id,integration_type',
      }
    );

    if (upsertError) {
      console.error('Database error:', upsertError);
      throw new Error('Failed to save GitHub integration');
    }

    // Also update profiles table for backward compatibility
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        github_app_access_token: tokenData.access_token,
        github_app_token_expires_at: expiresAt.toISOString(),
        github_username: userData.login,
        github_avatar_url: userData.avatar_url,
        auth_method: 'github_app',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileError) {
      console.warn('Profile update error:', profileError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        github_username: userData.login,
        avatar_url: userData.avatar_url,
        scopes: tokenData.scope,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('GitHub App auth error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Authentication failed',
        details: 'Check server logs for more information',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

### 3.2 Token Retrieval Function

**Create `supabase/functions/get-github-token/index.ts`:**

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
    // Get authenticated user from Supabase
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Get GitHub App integration
    const { data: integration, error: integrationError } = await supabase
      .from('github_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'github_app')
      .single();

    if (integrationError && integrationError.code !== 'PGRST116') {
      throw new Error('Failed to fetch GitHub integration');
    }

    if (!integration) {
      return new Response(
        JSON.stringify({
          error: 'No GitHub App integration found',
          code: 'NO_GITHUB_APP',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        }
      );
    }

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(integration.expires_at);

    if (now >= expiresAt) {
      return new Response(
        JSON.stringify({
          error: 'GitHub token expired',
          code: 'TOKEN_EXPIRED',
          expired_at: integration.expires_at,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    // Update last used timestamp
    await supabase
      .from('github_integrations')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', integration.id);

    return new Response(
      JSON.stringify({
        access_token: integration.access_token,
        github_username: integration.github_username,
        expires_at: integration.expires_at,
        scopes: integration.scopes,
        type: 'github_app',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Token retrieval error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to retrieve token',
        code: 'TOKEN_RETRIEVAL_ERROR',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
```

### 3.3 Deploy Edge Functions

```bash
# Deploy functions
supabase functions deploy github-app-auth
supabase functions deploy get-github-token

# Verify deployment
supabase functions list
```

---

## 🌐 Phase 4: Web App Updates (React)

_Duration: 2-3 days_

### 4.1 GitHub App Auth Component

**Create `components/GitHubAppAuth.tsx`:**

```typescript
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { toast } from 'react-hot-toast'

interface GitHubAppAuthProps {
  onSuccess?: (data: any) => void
  onError?: (error: string) => void
}

export default function GitHubAppAuth({ onSuccess, onError }: GitHubAppAuthProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [githubUsername, setGithubUsername] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    checkExistingConnection()
  }, [])

  const checkExistingConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: integration } = await supabase
        .from('github_integrations')
        .select('github_username, expires_at')
        .eq('user_id', user.id)
        .eq('integration_type', 'github_app')
        .single()

      if (integration) {
        const expiresAt = new Date(integration.expires_at)
        const now = new Date()

        if (now < expiresAt) {
          setIsConnected(true)
          setGithubUsername(integration.github_username)
        }
      }
    } catch (error) {
      console.error('Error checking GitHub connection:', error)
    }
  }

  const generateState = () => {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15)
  }

  const initiateGitHubAuth = () => {
    setIsLoading(true)

    const clientId = process.env.NEXT_PUBLIC_GITHUB_APP_CLIENT_ID
    const redirectUri = `${window.location.origin}/auth/github/callback`
    const scope = 'repo user:email'
    const state = generateState()

    // Store state for validation
    sessionStorage.setItem('github_oauth_state', state)

    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize')
    githubAuthUrl.searchParams.set('client_id', clientId!)
    githubAuthUrl.searchParams.set('redirect_uri', redirectUri)
    githubAuthUrl.searchParams.set('scope', scope)
    githubAuthUrl.searchParams.set('state', state)

    window.location.href = githubAuthUrl.toString()
  }

  const disconnectGitHub = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('github_integrations')
        .delete()
        .eq('user_id', user.id)
        .eq('integration_type', 'github_app')

      if (error) throw error

      setIsConnected(false)
      setGithubUsername(null)
      toast.success('GitHub disconnected successfully')
    } catch (error) {
      console.error('Error disconnecting GitHub:', error)
      toast.error('Failed to disconnect GitHub')
    }
  }

  if (isConnected && githubUsername) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div>
              <p className="font-medium text-green-900">
                Connected to GitHub
              </p>
              <p className="text-sm text-green-700">
                @{githubUsername}
              </p>
            </div>
          </div>
          <button
            onClick={disconnectGitHub}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="text-center">
        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Connect GitHub App
        </h3>
        <p className="text-gray-600 mb-6 text-sm">
          Connect your GitHub account for seamless authentication and better rate limits
        </p>
        <button
          onClick={initiateGitHubAuth}
          disabled={isLoading}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Connect GitHub
            </>
          )}
        </button>

        <div className="mt-4 p-3 bg-blue-50 rounded-md">
          <p className="text-xs text-blue-800">
            <strong>Benefits:</strong> Higher rate limits (15k/hour), automatic token management, granular permissions
          </p>
        </div>
      </div>
    </div>
  )
}
```

### 4.2 GitHub Callback Handler

**Create `pages/auth/github/callback.tsx`:**

```typescript
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../../lib/supabase'
import { toast } from 'react-hot-toast'

export default function GitHubCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!router.isReady) return

    handleCallback()
  }, [router.isReady])

  const handleCallback = async () => {
    try {
      const { code, state, error: githubError } = router.query

      if (githubError) {
        throw new Error(`GitHub OAuth error: ${githubError}`)
      }

      if (!code) {
        throw new Error('No authorization code received')
      }

      // Validate state parameter
      const storedState = sessionStorage.getItem('github_oauth_state')
      if (!storedState || storedState !== state) {
        throw new Error('Invalid state parameter')
      }

      // Clear stored state
      sessionStorage.removeItem('github_oauth_state')

      // Get current user session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('No user session found. Please log in first.')
      }

      // Exchange code for access token via Edge Function
      const { data, error } = await supabase.functions.invoke('github-app-auth', {
        body: { code, state }
      })

      if (error) {
        throw new Error(error.message || 'Failed to authenticate with GitHub')
      }

      if (data.error) {
        throw new Error(data.error)
      }

      setStatus('success')
      toast.success(`Successfully connected to GitHub as @${data.github_username}`)

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard?tab=github&connected=true')
      }, 2000)

    } catch (err: any) {
      console.error('GitHub callback error:', err)
      setError(err.message || 'Authentication failed')
      setStatus('error')
      toast.error(err.message || 'Failed to connect GitHub')

      // Redirect to settings after a delay
      setTimeout(() => {
        router.push('/dashboard?tab=github&error=auth_failed')
      }, 3000)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Connecting to GitHub...
          </h2>
          <p className="text-gray-600">
            Please wait while we set up your GitHub integration.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            GitHub Connected Successfully!
          </h2>
          <p className="text-gray-600 mb-4">
            Your extension will now use GitHub Apps for authentication.
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to dashboard...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Connection Failed
        </h2>
        <p className="text-gray-600 mb-4">
          {error || 'Something went wrong while connecting to GitHub.'}
        </p>
        <button
          onClick={() => router.push('/dashboard?tab=github')}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
```

### 4.3 Update Dashboard

**Update your dashboard to include GitHub Apps option:**

```typescript
// Add to your dashboard/settings page
import GitHubAppAuth from '../components/GitHubAppAuth'

// In your settings/GitHub section:
<div className="space-y-6">
  <div>
    <h3 className="text-lg font-medium text-gray-900 mb-4">
      GitHub Authentication
    </h3>
    <p className="text-sm text-gray-600 mb-6">
      Choose how your extension connects to GitHub. You can switch between methods at any time.
    </p>
  </div>

  {/* GitHub Apps Option */}
  <div className="border border-gray-200 rounded-lg p-6">
    <div className="flex items-start justify-between mb-4">
      <div>
        <h4 className="text-base font-medium text-gray-900">
          GitHub Apps (Recommended)
        </h4>
        <p className="text-sm text-gray-600 mt-1">
          Seamless setup with higher rate limits and better security
        </p>
      </div>
      <div className="flex items-center">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Recommended
        </span>
      </div>
    </div>
    <GitHubAppAuth
      onSuccess={(data) => {
        // Handle success
        console.log('GitHub connected:', data)
      }}
      onError={(error) => {
        // Handle error
        console.error('GitHub connection failed:', error)
      }}
    />
  </div>

  {/* PAT Option */}
  <div className="border border-gray-200 rounded-lg p-6">
    <div className="flex items-start justify-between mb-4">
      <div>
        <h4 className="text-base font-medium text-gray-900">
          Personal Access Token
        </h4>
        <p className="text-sm text-gray-600 mt-1">
          Use your own GitHub token for full control
        </p>
      </div>
      <div className="flex items-center">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Advanced
        </span>
      </div>
    </div>
    {/* Your existing PAT component */}
    <PersonalAccessTokenSettings />
  </div>
</div>
```

---

## 🔧 Phase 5: Chrome Extension Updates

_Duration: 3-4 days_

### 5.1 Enhanced Auth Manager

**Update your extension's auth manager:**

```javascript
// extension/lib/auth-manager.js
class GitHubAuthManager {
  constructor() {
    this.supabaseUrl = 'YOUR_SUPABASE_URL';
    this.supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
    this.authCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get the best available GitHub token
   * Priority: GitHub Apps > PAT > None
   */
  async getAuthToken() {
    try {
      // Try GitHub Apps first
      const githubAppToken = await this.getGitHubAppToken();
      if (githubAppToken) {
        return {
          token: githubAppToken.access_token,
          type: 'github_app',
          username: githubAppToken.github_username,
          expires_at: githubAppToken.expires_at,
        };
      }

      // Fallback to Personal Access Token
      const patToken = await this.getPersonalAccessToken();
      if (patToken) {
        return {
          token: patToken,
          type: 'pat',
          username: null,
          expires_at: null,
        };
      }

      // No authentication available
      return null;
    } catch (error) {
      console.error('Auth error:', error);

      // If GitHub Apps fails, try PAT fallback
      const patToken = await this.getPersonalAccessToken();
      if (patToken) {
        return {
          token: patToken,
          type: 'pat',
          username: null,
          expires_at: null,
        };
      }

      return null;
    }
  }

  /**
   * Get GitHub Apps token via Supabase Edge Function
   */
  async getGitHubAppToken() {
    try {
      // Check cache first
      const cached = this.authCache.get('github_app');
      if (cached && Date.now() < cached.expiry) {
        return cached.data;
      }

      // Get Supabase session from GitHub.com localStorage
      const supabaseSession = await this.getSupabaseSession();
      if (!supabaseSession?.access_token) {
        return null;
      }

      // Call Edge Function to get GitHub token
      const response = await fetch(`${this.supabaseUrl}/functions/v1/get-github-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseSession.access_token}`,
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (errorData.code === 'NO_GITHUB_APP') {
          // User hasn't connected GitHub Apps yet
          return null;
        }

        if (errorData.code === 'TOKEN_EXPIRED') {
          // Token expired, prompt for reconnection
          this.promptForReconnection('GitHub token expired. Please reconnect your GitHub account.');
          return null;
        }

        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const tokenData = await response.json();

      // Cache the result
      this.authCache.set('github_app', {
        data: tokenData,
        expiry: Date.now() + this.cacheExpiry,
      });

      return tokenData;
    } catch (error) {
      console.error('Error getting GitHub App token:', error);
      return null;
    }
  }

  /**
   * Get Personal Access Token from extension storage
   */
  async getPersonalAccessToken() {
    try {
      const result = await chrome.storage.local.get(['github_pat']);
      return result.github_pat || null;
    } catch (error) {
      console.error('Error getting PAT:', error);
      return null;
    }
  }

  /**
   * Get Supabase session from GitHub.com page
   */
  async getSupabaseSession() {
    return new Promise((resolve) => {
      chrome.tabs.query({ url: 'https://github.com/*' }, (tabs) => {
        if (tabs.length === 0) {
          resolve(null);
          return;
        }

        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            function: () => {
              // Try different possible Supabase localStorage keys
              const possibleKeys = [
                `sb-${window.location.hostname.replace('.', '-')}-auth-token`,
                'supabase.auth.token',
                'sb-auth-token',
              ];

              for (const key of possibleKeys) {
                const stored = localStorage.getItem(key);
                if (stored) {
                  try {
                    return JSON.parse(stored);
                  } catch (e) {
                    continue;
                  }
                }
              }
              return null;
            },
          },
          (result) => {
            if (chrome.runtime.lastError) {
              console.error('Script execution error:', chrome.runtime.lastError);
              resolve(null);
              return;
            }

            resolve(result?.[0]?.result || null);
          }
        );
      });
    });
  }

  /**
   * Make authenticated request to GitHub API
   */
  async makeGitHubAPICall(endpoint, options = {}) {
    const auth = await this.getAuthToken();

    if (!auth) {
      await this.promptForAuthentication();
      return null;
    }

    const response = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'User-Agent': 'Bolt-to-GitHub-Extension',
        Accept: 'application/vnd.github.v3+json',
        ...options.headers,
      },
    });

    // Handle rate limiting
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      if (rateLimitRemaining === '0') {
        const resetTime = response.headers.get('X-RateLimit-Reset');
        const resetDate = new Date(parseInt(resetTime) * 1000);

        this.showRateLimitError(resetDate, auth.type);
        return null;
      }
    }

    // Handle authentication errors
    if (response.status === 401) {
      if (auth.type === 'github_app') {
        // Clear cache and try to refresh
        this.authCache.delete('github_app');
        this.promptForReconnection('GitHub authentication expired. Please reconnect.');
      } else {
        this.promptForTokenUpdate('Your Personal Access Token may be invalid or expired.');
      }
      return null;
    }

    return response;
  }

  /**
   * Prompt user to authenticate
   */
  async promptForAuthentication() {
    const response = await chrome.tabs.create({
      url: 'https://bolt2github.com/dashboard?tab=github&action=connect',
    });

    this.showNotification(
      'Authentication Required',
      'Please connect your GitHub account to use this feature.'
    );
  }

  /**
   * Prompt user to reconnect GitHub Apps
   */
  async promptForReconnection(message) {
    chrome.tabs.create({
      url: 'https://bolt2github.com/dashboard?tab=github&action=reconnect',
    });

    this.showNotification('Reconnection Required', message);
  }

  /**
   * Prompt user to update PAT
   */
  async promptForTokenUpdate(message) {
    chrome.tabs.create({
      url: 'https://bolt2github.com/dashboard?tab=github&action=update-pat',
    });

    this.showNotification('Token Update Required', message);
  }

  /**
   * Show rate limit error
   */
  showRateLimitError(resetDate, authType) {
    const timeUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / 60000);
    const authMethod = authType === 'github_app' ? 'GitHub Apps' : 'Personal Access Token';

    this.showNotification(
      'Rate Limit Exceeded',
      `${authMethod} rate limit exceeded. Try again in ${timeUntilReset} minutes.`
    );
  }

  /**
   * Show notification to user
   */
  showNotification(title, message) {
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icons/icon-48.png',
        title: title,
        message: message,
      });
    }
  }

  /**
   * Get authentication status for UI
   */
  async getAuthStatus() {
    const auth = await this.getAuthToken();

    if (!auth) {
      return {
        isAuthenticated: false,
        type: null,
        username: null,
      };
    }

    return {
      isAuthenticated: true,
      type: auth.type,
      username: auth.username,
      expires_at: auth.expires_at,
    };
  }

  /**
   * Clear all authentication
   */
  async clearAuth() {
    // Clear cache
    this.authCache.clear();

    // Clear PAT from storage
    await chrome.storage.local.remove(['github_pat']);

    // Note: GitHub Apps tokens are cleared from the web app
  }
}

// Export singleton instance
const githubAuth = new GitHubAuthManager();
export default githubAuth;
```

### 5.2 Update Extension Popup

**Update `popup.html` and `popup.js`:**

```html
<!-- popup.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        width: 350px;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .auth-section {
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
      }

      .auth-status {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }

      .status-indicator.connected {
        background-color: #10b981;
      }

      .status-indicator.disconnected {
        background-color: #ef4444;
      }

      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
        text-align: center;
      }

      .btn-primary {
        background-color: #3b82f6;
        color: white;
      }

      .btn-primary:hover {
        background-color: #2563eb;
      }

      .btn-secondary {
        background-color: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
      }

      .btn-secondary:hover {
        background-color: #e5e7eb;
      }

      .auth-method {
        font-size: 12px;
        color: #6b7280;
        background-color: #f3f4f6;
        padding: 2px 6px;
        border-radius: 4px;
        margin-left: 8px;
      }

      .rate-limit-info {
        font-size: 12px;
        color: #6b7280;
        margin-top: 8px;
      }
    </style>
  </head>
  <body>
    <div id="app">
      <div class="auth-section">
        <h3>GitHub Authentication</h3>

        <div id="auth-status" class="auth-status">
          <div class="status-indicator disconnected"></div>
          <span>Not connected</span>
        </div>

        <div id="auth-actions">
          <a href="#" id="connect-btn" class="btn btn-primary"> Connect GitHub </a>
        </div>

        <div id="rate-limit-info" class="rate-limit-info" style="display: none;">
          <!-- Rate limit info will be populated here -->
        </div>
      </div>

      <div id="features-section">
        <!-- Your existing extension features -->
      </div>
    </div>

    <script src="popup.js"></script>
  </body>
</html>
```

```javascript
// popup.js
import githubAuth from './lib/auth-manager.js';

class ExtensionPopup {
  constructor() {
    this.init();
  }

  async init() {
    await this.updateAuthStatus();
    this.setupEventListeners();
  }

  async updateAuthStatus() {
    try {
      const authStatus = await githubAuth.getAuthStatus();
      const statusIndicator = document.querySelector('.status-indicator');
      const authStatusText = document.querySelector('.auth-status span');
      const authActions = document.getElementById('auth-actions');

      if (authStatus.isAuthenticated) {
        statusIndicator.className = 'status-indicator connected';

        const methodBadge = authStatus.type === 'github_app' ? 'GitHub Apps' : 'Personal Token';
        const username = authStatus.username ? `@${authStatus.username}` : '';

        authStatusText.innerHTML = `
          Connected ${username}
          <span class="auth-method">${methodBadge}</span>
        `;

        authActions.innerHTML = `
          <button id="disconnect-btn" class="btn btn-secondary">
            Disconnect
          </button>
          <a href="https://bolt2github.com/dashboard?tab=github" target="_blank" class="btn btn-secondary">
            Settings
          </a>
        `;

        // Show rate limit info
        await this.updateRateLimitInfo(authStatus.type);
      } else {
        statusIndicator.className = 'status-indicator disconnected';
        authStatusText.textContent = 'Not connected';

        authActions.innerHTML = `
          <a href="https://bolt2github.com/dashboard?tab=github" target="_blank" id="connect-btn" class="btn btn-primary">
            Connect GitHub
          </a>
        `;
      }

      this.setupEventListeners();
    } catch (error) {
      console.error('Error updating auth status:', error);
    }
  }

  async updateRateLimitInfo(authType) {
    try {
      const response = await githubAuth.makeGitHubAPICall('/rate_limit');
      if (!response) return;

      const rateLimitData = await response.json();
      const core = rateLimitData.resources.core;

      const rateLimitInfo = document.getElementById('rate-limit-info');
      const limit = authType === 'github_app' ? '15,000' : '5,000';

      rateLimitInfo.innerHTML = `
        Rate limit: ${core.remaining}/${limit} remaining
        ${core.remaining < 100 ? '<span style="color: #ef4444;">⚠️ Low</span>' : ''}
      `;
      rateLimitInfo.style.display = 'block';
    } catch (error) {
      console.error('Error fetching rate limit:', error);
    }
  }

  setupEventListeners() {
    // Connect button
    const connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
      connectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({
          url: 'https://bolt2github.com/dashboard?tab=github&source=extension',
        });
      });
    }

    // Disconnect button
    const disconnectBtn = document.getElementById('disconnect-btn');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        if (confirm('Are you sure you want to disconnect GitHub?')) {
          await githubAuth.clearAuth();
          await this.updateAuthStatus();
        }
      });
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ExtensionPopup();
});
```

---

## 🧪 Phase 6: Testing Strategy

_Duration: 2-3 days_

### 6.1 Test Cases

**Create comprehensive test suite:**

```javascript
// tests/github-auth.test.js
describe('GitHub Authentication', () => {
  describe('PAT Authentication', () => {
    test('should authenticate with valid PAT', async () => {
      // Test PAT authentication
    });

    test('should handle invalid PAT gracefully', async () => {
      // Test error handling
    });

    test('should fall back to PAT when GitHub Apps fails', async () => {
      // Test fallback mechanism
    });
  });

  describe('GitHub Apps Authentication', () => {
    test('should retrieve GitHub Apps token', async () => {
      // Test GitHub Apps flow
    });

    test('should handle expired tokens', async () => {
      // Test token refresh
    });

    test('should prompt for reconnection when needed', async () => {
      // Test reconnection flow
    });
  });

  describe('Rate Limiting', () => {
    test('should respect GitHub rate limits', async () => {
      // Test rate limit handling
    });

    test('should show appropriate rate limit for auth type', async () => {
      // Test rate limit display
    });
  });
});
```

### 6.2 Manual Testing Checklist

**Extension Testing:**

- [ ] PAT authentication works
- [ ] GitHub Apps authentication works
- [ ] Fallback from GitHub Apps to PAT works
- [ ] Rate limit display is accurate
- [ ] Error messages are helpful
- [ ] Popup UI updates correctly

**Web App Testing:**

- [ ] GitHub Apps OAuth flow works
- [ ] Callback handling works
- [ ] Error states are handled
- [ ] UI shows connection status
- [ ] Disconnection works
- [ ] Multiple auth methods display correctly

**Edge Function Testing:**

- [ ] Token exchange works
- [ ] Token retrieval works
- [ ] Error handling works
- [ ] Authentication validation works
- [ ] Database updates work

---

## 🚀 Phase 7: Deployment

_Duration: 1-2 days_

### 7.1 Pre-deployment Checklist

- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Edge functions deployed
- [ ] GitHub App configured
- [ ] Web app updated
- [ ] Extension updated
- [ ] Tests passing
- [ ] Documentation updated

### 7.2 Deployment Steps

```bash
# 1. Deploy Supabase changes
supabase db push
supabase functions deploy github-app-auth
supabase functions deploy get-github-token

# 2. Deploy web app
npm run build
npm run deploy

# 3. Test in production
# - Verify GitHub App OAuth works
# - Test Edge Functions
# - Test extension connection

# 4. Submit extension update
# - Update manifest version
# - Test locally
# - Submit to Chrome Web Store
```

### 7.3 Rollout Strategy

**Phase 1 (Week 1): Soft Launch**

- Enable GitHub Apps for 10% of users
- Monitor error rates and usage
- Collect feedback

**Phase 2 (Week 2): Gradual Rollout**

- Enable for 50% of users
- Monitor performance
- Adjust based on feedback

**Phase 3 (Week 3): Full Rollout**

- Enable for all users
- Make GitHub Apps the default option
- Keep PAT as "Advanced" option

---

## 📚 Phase 8: Documentation & User Communication

_Duration: 1-2 days_

### 8.1 User Documentation

**Create help articles:**

- "Connecting GitHub Apps to Bolt Extension"
- "Switching from PAT to GitHub Apps"
- "Troubleshooting GitHub Authentication"
- "Understanding Rate Limits"

### 8.2 Migration Communication

**Email to existing users:**

```
Subject: 🚀 Easier GitHub Authentication Now Available

Hi [Name],

We've added a new, easier way to connect your GitHub account to the Bolt extension!

🆕 What's New:
• One-click GitHub connection (no more manual token creation!)
• Higher rate limits (15,000 vs 5,000 requests per hour)
• Better security with automatically managed tokens

✅ Your Current Setup:
Your Personal Access Token setup will continue working exactly as before.

🔄 Want to Upgrade?
Visit your dashboard to try the new GitHub Apps connection. You can switch back anytime.

[Connect GitHub Apps] [Learn More]

Thanks for using Bolt!
```

---

## 🔧 Phase 9: Monitoring & Analytics

_Duration: Ongoing_

### 9.1 Metrics to Track

- GitHub Apps adoption rate
- PAT vs GitHub Apps usage
- Authentication error rates
- Rate limit hit rates
- User satisfaction scores

### 9.2 Error Monitoring

```javascript
// Add to your Edge Functions
console.log(
  JSON.stringify({
    event: 'github_auth_attempt',
    auth_type: 'github_app',
    user_id: user.id,
    success: true,
    timestamp: new Date().toISOString(),
  })
);
```

---

## 📈 Success Metrics

**Technical Success:**

- [ ] 90%+ authentication success rate
- [ ] <2 second average auth flow time
- [ ] Zero security incidents
- [ ] 50%+ GitHub Apps adoption within 3 months

**User Success:**

- [ ] Reduced support tickets about PAT setup
- [ ] Higher user satisfaction scores
- [ ] Increased premium conversion rate
- [ ] Better user retention

---

## 🔄 Post-Launch Improvements

### Future Enhancements:

1. **Auto-migration tool** from PAT to GitHub Apps
2. **Bulk operations** using higher rate limits
3. **Real-time sync** across devices
4. **Advanced permissions** management
5. **Enterprise GitHub** support

This comprehensive plan should take approximately **2-3 weeks** to implement fully, with the ability to release incrementally as each phase completes.
