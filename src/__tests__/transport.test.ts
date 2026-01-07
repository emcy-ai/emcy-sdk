/**
 * Tests for TelemetryTransport class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryTransport } from '../transport.js';
import type { TelemetryBatch } from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('TelemetryTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createBatch = (overrides?: Partial<TelemetryBatch>): TelemetryBatch => ({
    apiKey: 'test-api-key',
    timestamp: '2024-01-01T00:00:00.000Z',
    invocations: [
      {
        invocationId: 'inv-1',
        toolName: 'testTool',
        timestamp: '2024-01-01T00:00:00.000Z',
        duration: 100,
        success: true,
      },
    ],
    ...overrides,
  });

  describe('constructor', () => {
    it('should use default endpoint when not provided', async () => {
      const transport = new TelemetryTransport();
      mockFetch.mockResolvedValue({ ok: true });

      await transport.send(createBatch());

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.emcy.ai/v1/telemetry',
        expect.any(Object)
      );
    });

    it('should use custom endpoint when provided', async () => {
      const transport = new TelemetryTransport('https://custom.endpoint.com/telemetry');
      mockFetch.mockResolvedValue({ ok: true });

      await transport.send(createBatch());

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.endpoint.com/telemetry',
        expect.any(Object)
      );
    });
  });

  describe('send', () => {
    it('should send batch with correct headers', async () => {
      const transport = new TelemetryTransport();
      mockFetch.mockResolvedValue({ ok: true });

      const batch = createBatch();
      await transport.send(batch);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key',
          },
          body: JSON.stringify(batch),
        })
      );
    });

    it('should return true on successful send', async () => {
      const transport = new TelemetryTransport();
      mockFetch.mockResolvedValue({ ok: true });

      const result = await transport.send(createBatch());

      expect(result).toBe(true);
    });

    it('should return false on 4xx client error without retry', async () => {
      const transport = new TelemetryTransport();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await transport.send(createBatch());

      expect(result).toBe(false);
      // Should not retry on 4xx errors
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx server error', async () => {
      const transport = new TelemetryTransport();
      
      // Fail twice, then succeed
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' })
        .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
        .mockResolvedValueOnce({ ok: true });

      const sendPromise = transport.send(createBatch());

      // Advance through retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry delay
      await vi.advanceTimersByTimeAsync(2000); // Second retry delay (exponential)

      const result = await sendPromise;

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return false after max retries', async () => {
      const transport = new TelemetryTransport();
      
      // Always fail
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });

      const sendPromise = transport.send(createBatch());

      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry
      await vi.advanceTimersByTimeAsync(2000); // Second retry

      const result = await sendPromise;

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(3); // Initial + 2 retries = 3 total
    });

    it('should retry on network error', async () => {
      const transport = new TelemetryTransport();
      
      // Network error then success
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true });

      const sendPromise = transport.send(createBatch());

      await vi.advanceTimersByTimeAsync(1000); // First retry delay

      const result = await sendPromise;

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff for retries', async () => {
      const transport = new TelemetryTransport();
      
      // Track when fetch is called
      const callTimes: number[] = [];
      mockFetch.mockImplementation(() => {
        callTimes.push(Date.now());
        return Promise.resolve({ ok: false, status: 500, statusText: 'Error' });
      });

      const sendPromise = transport.send(createBatch());

      // First call is immediate
      await vi.advanceTimersByTimeAsync(0);
      expect(callTimes).toHaveLength(1);

      // Second call after 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      expect(callTimes).toHaveLength(2);

      // Third call after 2000ms (exponential: 1000 * 2^1)
      await vi.advanceTimersByTimeAsync(2000);
      expect(callTimes).toHaveLength(3);

      await sendPromise;
    });

    it('should include mcpServerId in batch when provided', async () => {
      const transport = new TelemetryTransport();
      mockFetch.mockResolvedValue({ ok: true });

      const batch = createBatch({ mcpServerId: 'server-123' });
      await transport.send(batch);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.mcpServerId).toBe('server-123');
    });
  });

  describe('debug mode', () => {
    it('should log when debug is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const transport = new TelemetryTransport(undefined, true);
      mockFetch.mockResolvedValue({ ok: true });

      await transport.send(createBatch());

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[emcy] Sent 1 invocations')
      );

      consoleSpy.mockRestore();
    });

    it('should not log when debug is disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const transport = new TelemetryTransport(undefined, false);
      mockFetch.mockResolvedValue({ ok: true });

      await transport.send(createBatch());

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[emcy] Sent')
      );

      consoleSpy.mockRestore();
    });
  });
});

