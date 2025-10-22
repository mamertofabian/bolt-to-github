/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenService } from '../TokenService';
import type { IGitHubApiClient } from '../interfaces/IGitHubApiClient';

describe('TokenService', () => {
  let mockApiClient: any;
  let tokenService: TokenService;

  beforeEach(() => {
    mockApiClient = {
      request: vi.fn(),
      getRateLimit: vi.fn(),
      token: 'test-token',
    };

    tokenService = new TokenService(mockApiClient as IGitHubApiClient);
  });

  describe('validateToken', () => {
    it('should return true for a valid token', async () => {
      mockApiClient.request.mockResolvedValueOnce({ login: 'testuser' });

      const result = await tokenService.validateToken();

      expect(result).toBe(true);
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/user');
    });

    it('should return false for an invalid token', async () => {
      mockApiClient.request.mockRejectedValueOnce(new Error('Invalid token'));

      const result = await tokenService.validateToken();

      expect(result).toBe(false);
      expect(mockApiClient.request).toHaveBeenCalledWith('GET', '/user');
    });
  });
});
