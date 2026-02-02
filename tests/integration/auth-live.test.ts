import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

const REGISTRY_URL = process.env.ASPECTS_REGISTRY_URL;

describe.skipIf(!REGISTRY_URL)('Auth & Handle API Live Tests', () => {
  let api: typeof import('../../src/lib/api-client');

  beforeAll(async () => {
    api = await import('../../src/lib/api-client');
    api.clearApiCache();
  });

  afterAll(() => {
    api.clearApiCache();
  });

  describe('GET /handles/:name/available', () => {
    test('returns available: true for unclaimed handle', async () => {
      const result = await api.checkHandleAvailability('this-handle-should-not-exist-xyz');
      expect(result.name).toBe('this-handle-should-not-exist-xyz');
      expect(result.available).toBe(true);
    });

    test('returns available: false with reason "reserved" for reserved handles', async () => {
      const result = await api.checkHandleAvailability('admin');
      expect(result.name).toBe('admin');
      expect(result.available).toBe(false);
      expect(result.reason).toBe('reserved');
    });

    test('returns available: false with reason "invalid" for invalid format', async () => {
      const result = await api.checkHandleAvailability('x');
      expect(result.name).toBe('x');
      expect(result.available).toBe(false);
      expect(result.reason).toBe('invalid');
    });
  });

  describe('GET /handles/:name', () => {
    test('returns 404 for nonexistent handle', async () => {
      try {
        await api.getHandleInfo('nonexistent-handle-xyz-999');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(api.ApiClientError);
        expect((err as InstanceType<typeof api.ApiClientError>).statusCode).toBe(404);
      }
    });
  });

  describe('POST /auth/device', () => {
    test('returns device code with required fields', async () => {
      const result = await api.initiateDeviceAuth();
      expect(result).toHaveProperty('device_code');
      expect(result).toHaveProperty('user_code');
      expect(result).toHaveProperty('verification_uri');
      expect(result).toHaveProperty('verification_uri_complete');
      expect(result).toHaveProperty('expires_in');
      expect(result).toHaveProperty('interval');
      expect(result).toHaveProperty('code_verifier');
      expect(typeof result.device_code).toBe('string');
      expect(typeof result.user_code).toBe('string');
      expect(typeof result.expires_in).toBe('number');
      expect(typeof result.interval).toBe('number');
    });
  });

  describe('POST /auth/device/poll', () => {
    test('returns pending status for fresh device code', async () => {
      const deviceCode = await api.initiateDeviceAuth();
      const result = await api.pollDeviceAuth(deviceCode.device_code, deviceCode.code_verifier);
      expect(result.ok).toBe(false);
      expect(result.status).toBe('pending');
    });
  });

  describe('Unauthenticated endpoints', () => {
    test('GET /account returns 401 without auth', async () => {
      try {
        await api.getAccount();
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(api.ApiClientError);
        expect((err as InstanceType<typeof api.ApiClientError>).statusCode).toBe(401);
      }
    });

    test('POST /handles returns 401 without auth', async () => {
      try {
        await api.claimHandle('test-handle');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(api.ApiClientError);
        expect((err as InstanceType<typeof api.ApiClientError>).statusCode).toBe(401);
      }
    });
  });
});
