# GitHub Integration - Supabase Edge Functions Documentation

This document describes the Supabase Edge Functions that handle GitHub integration for the Project Management Platform. These functions manage GitHub App authentication, token lifecycle, and installation management.

## Overview

The GitHub integration consists of four main Edge Functions that work together to provide seamless GitHub App authentication and token management:

1. **github-app-auth** - Handles OAuth flow completion and initial authentication
2. **get-github-token** - Retrieves and manages user access tokens with automatic renewal
3. **get-installation-token** - Generates installation-specific tokens for GitHub App operations
4. **cleanup-expired-tokens** - Background maintenance for token cleanup

## Function Details

### 1. github-app-auth

**Purpose**: Completes the GitHub App OAuth flow by exchanging authorization codes for access tokens and storing user integration data.

#### Endpoint

```
POST /functions/v1/github-app-auth
```

#### Authentication

Requires Supabase user authentication via `Authorization` header.

#### Request Body

```typescript
{
  code: string;        // OAuth authorization code from GitHub
  state?: string;      // Optional state parameter for CSRF protection
}
```

#### Response

```typescript
// Success (200)
{
  success: true;
  github_username: string;
  avatar_url: string;
  scopes: string[];
  installation_id: number | null;
  installation_found: boolean;
}

// Error (400)
{
  error: string;
  details: string;
}
```

#### Key Features

- Exchanges OAuth code for access/refresh tokens
- Fetches GitHub user profile information
- Detects GitHub App installations for the user
- Stores integration data in `github_integrations` table
- Updates user profile with GitHub information
- Handles both public and private email addresses

#### Error Handling

- Invalid authorization codes
- Missing GitHub App credentials
- User authentication failures
- Database storage errors

---

### 2. get-github-token

**Purpose**: Retrieves valid GitHub access tokens for authenticated users, automatically renewing expired tokens when possible.

#### Endpoint

```
GET /functions/v1/get-github-token
```

#### Authentication

Requires Supabase user authentication via `Authorization` header.

#### Response

```typescript
// Success - Valid Token (200)
{
  access_token: string;
  github_username: string;
  expires_at: string;
  scopes: string[];
  type: "github_app";
  renewed: boolean;
}

// No Integration Found (404)
{
  error: "No GitHub App integration found";
  code: "NO_GITHUB_APP";
  requires_auth: true;
}

// No Access Token (401)
{
  error: "No access token found - re-authentication required";
  code: "NO_ACCESS_TOKEN";
  requires_auth: true;
  has_installation: boolean;
}

// Token Expired (401)
{
  error: "GitHub token expired and cannot be renewed";
  code: "TOKEN_EXPIRED_NO_REFRESH";
  expired_at: string;
  requires_auth: true;
  has_installation: boolean;
}

// Renewal Failed (401)
{
  error: "Token renewal failed";
  code: "TOKEN_RENEWAL_FAILED";
  details: string;
  requires_auth: true;
  has_installation: boolean;
}
```

#### Key Features

- **Automatic Token Renewal**: Uses refresh tokens to renew expired access tokens
- **Smart Cleanup**: Preserves installation data when clearing expired tokens
- **Usage Tracking**: Updates `last_used_at` timestamp
- **Comprehensive Error Codes**: Provides specific error codes for different scenarios

#### Token Renewal Logic

1. Check if access token exists
2. Verify token expiration status
3. If expired, attempt renewal using refresh token
4. Update database with new tokens on successful renewal
5. Clean up invalid tokens while preserving installation data

#### Error Codes Reference

| Code                       | Description                           | Action Required          |
| -------------------------- | ------------------------------------- | ------------------------ |
| `NO_GITHUB_APP`            | No GitHub integration found           | Complete OAuth flow      |
| `NO_ACCESS_TOKEN`          | Missing access token                  | Re-authenticate          |
| `TOKEN_EXPIRED_NO_REFRESH` | Token expired, no valid refresh token | Re-authenticate          |
| `TOKEN_RENEWAL_FAILED`     | Refresh token invalid/expired         | Re-authenticate          |
| `TOKEN_RETRIEVAL_ERROR`    | General server error                  | Retry or contact support |

---

### 3. get-installation-token

**Purpose**: Generates installation-specific access tokens for GitHub App operations using JWT authentication.

#### Endpoint

```
GET /functions/v1/get-installation-token
```

#### Authentication

Requires Supabase user authentication via `Authorization` header.

#### Response

```typescript
// Success (200)
{
  github_username: string;
  token: string;
  expires_at: string;
  type: "installation";
  installation_id: number;
  permissions: object;
  repositories: "all" | object[];
}

// No Installation (404)
{
  error: "No GitHub App installation found";
  code: "NO_INSTALLATION";
}

// Server Error (500)
{
  error: string;
  code: "INSTALLATION_TOKEN_ERROR";
}
```

#### Key Features

- **JWT Authentication**: Uses GitHub App private key to generate JWT tokens
- **Installation Tokens**: Creates tokens scoped to specific GitHub App installations
- **Permission Management**: Returns available permissions and repository access
- **PKCS#8 Support**: Requires private key in PKCS#8 format

#### Environment Variables Required

```bash
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY=your_private_key_pkcs8_format
```

#### Private Key Format

The function expects the private key in PKCS#8 format:

```
-----BEGIN PRIVATE KEY-----
[base64 encoded key data]
-----END PRIVATE KEY-----
```

To convert from PKCS#1 to PKCS#8:

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in your-key.pem -out converted-key.pem
```

#### Error Handling

- Missing GitHub App installation
- Invalid private key format
- JWT generation failures
- GitHub API authentication errors

---

### 4. cleanup-expired-tokens

**Purpose**: Background maintenance function that cleans up expired GitHub tokens while preserving installation data.

#### Endpoint

```
POST /functions/v1/cleanup-expired-tokens
```

#### Authentication

Uses Supabase Service Role Key (admin operation).

#### Response

```typescript
// Success (200)
{
  message: 'Cleanup completed successfully';
  tokens_cleared: number;
  tokens_deleted: number;
  total_processed: number;
}

// Error (500)
{
  error: string;
  code: 'CLEANUP_ERROR';
}
```

#### Key Features

- **Smart Cleanup Strategy**:
  - Clears tokens but preserves records with `installation_id`
  - Deletes entire records without `installation_id`
- **Comprehensive Cleanup**: Handles both expired access tokens and refresh tokens
- **Duplicate Prevention**: Removes duplicate entries during processing
- **Detailed Reporting**: Returns counts of operations performed

#### Cleanup Logic

1. Find expired access tokens without refresh tokens
2. Find records with expired refresh tokens
3. For each expired token:
   - If `installation_id` exists: Clear tokens, keep record
   - If no `installation_id`: Delete entire record
4. Return summary of cleanup operations

## Integration Patterns

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant GitHub
    participant AuthFunction
    participant Database

    User->>App: Click "Connect GitHub"
    App->>GitHub: Redirect to OAuth
    GitHub->>App: Return with code
    App->>AuthFunction: POST /github-app-auth
    AuthFunction->>GitHub: Exchange code for tokens
    AuthFunction->>Database: Store integration
    AuthFunction->>App: Return success
```

### Token Usage Flow

```mermaid
sequenceDiagram
    participant App
    participant GetToken
    participant Database
    participant GitHub

    App->>GetToken: GET /get-github-token
    GetToken->>Database: Fetch integration
    alt Token valid
        GetToken->>App: Return token
    else Token expired
        GetToken->>GitHub: Refresh token
        GetToken->>Database: Update tokens
        GetToken->>App: Return new token
    else Refresh failed
        GetToken->>Database: Clear tokens
        GetToken->>App: Requires re-auth
    end
```

### Installation Token Flow

```mermaid
sequenceDiagram
    participant App
    participant InstallToken
    participant Database
    participant GitHub

    App->>InstallToken: GET /get-installation-token
    InstallToken->>Database: Get installation_id
    InstallToken->>InstallToken: Generate JWT
    InstallToken->>GitHub: Request installation token
    GitHub->>InstallToken: Return installation token
    InstallToken->>App: Return token with permissions
```

## Database Schema

### github_integrations Table

```sql
CREATE TABLE github_integrations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_type VARCHAR(20) NOT NULL DEFAULT 'github_app',
  access_token TEXT,
  expires_at TIMESTAMPTZ,
  refresh_token TEXT,
  refresh_token_expires_at TIMESTAMPTZ,
  github_username VARCHAR(255),
  github_user_id BIGINT,
  avatar_url TEXT,
  scopes TEXT[],
  installation_id BIGINT,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, integration_type)
);
```

## Error Handling Best Practices

### Client-Side Implementation

```typescript
async function getGitHubToken(): Promise<string> {
  try {
    const response = await fetch('/functions/v1/get-github-token', {
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      switch (data.code) {
        case 'NO_GITHUB_APP':
        case 'NO_ACCESS_TOKEN':
        case 'TOKEN_EXPIRED_NO_REFRESH':
        case 'TOKEN_RENEWAL_FAILED':
          // Redirect to GitHub OAuth
          window.location.href = '/auth/github';
          break;
        default:
          throw new Error(data.error);
      }
    }

    return data.access_token;
  } catch (error) {
    console.error('Failed to get GitHub token:', error);
    throw error;
  }
}
```

### Retry Logic

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Security Considerations

1. **Token Storage**: Tokens are encrypted at rest in Supabase
2. **Access Control**: All functions require user authentication
3. **Token Scope**: GitHub App tokens have limited, pre-configured permissions
4. **Automatic Cleanup**: Expired tokens are automatically cleaned up
5. **Private Key Security**: GitHub App private key is stored as environment variable
6. **CORS Protection**: Functions include proper CORS headers

## Monitoring and Maintenance

### Recommended Monitoring

- Token renewal success/failure rates
- Function execution times and error rates
- Database query performance
- GitHub API rate limiting

### Maintenance Tasks

- Regular execution of `cleanup-expired-tokens` function
- Monitor GitHub App installation health
- Update private key rotation as needed
- Review and update token expiration policies

## Usage Examples

### Complete Integration Example

```typescript
// 1. Initialize OAuth flow
const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,user:email`;

// 2. Handle OAuth callback
async function handleGitHubCallback(code: string) {
  const response = await fetch('/functions/v1/github-app-auth', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });

  return response.json();
}

// 3. Use tokens for GitHub API calls
async function createRepository(name: string) {
  const token = await getGitHubToken();

  const response = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, private: false }),
  });

  return response.json();
}
```

This documentation provides a comprehensive guide for integrating with the GitHub-related Supabase Edge Functions, covering all aspects from authentication to error handling and best practices.
