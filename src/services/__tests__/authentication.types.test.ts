import { describe, expect, it } from 'vitest';
import type { AuthenticationStorage, TokenValidationResult } from '../types/authentication';
import authenticationTypesSource from '../types/authentication.ts?raw';

describe('GitHub App-only authentication types', () => {
  it('authentication types expose only GitHub App credential contracts', () => {
    const storage: AuthenticationStorage = {
      githubAppInstallationId: 12345,
      githubAppUsername: 'octocat',
    };
    const validation: TokenValidationResult = {
      isValid: true,
      type: 'github_app',
    };

    expect(storage).toEqual({ githubAppInstallationId: 12345, githubAppUsername: 'octocat' });
    expect(validation).toEqual({ isValid: true, type: 'github_app' });
    expect(authenticationTypesSource).not.toContain('githubToken');
    expect(authenticationTypesSource).not.toContain('authenticationMethod');
    expect(authenticationTypesSource).not.toContain("'classic'");
    expect(authenticationTypesSource).not.toContain("'fine_grained'");
  });
});
