/**
 * Tests for EmcyTelemetry class
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmcyTelemetry } from '../telemetry.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-1234',
});

describe('EmcyTelemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with required config', () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });
      expect(telemetry).toBeInstanceOf(EmcyTelemetry);
    });

    it('should accept optional mcpServerId', () => {
      const telemetry = new EmcyTelemetry({
        apiKey: 'test-key',
        mcpServerId: 'server-123',
      });
      expect(telemetry).toBeInstanceOf(EmcyTelemetry);
    });

    it('should accept custom batchSize and flushInterval', () => {
      const telemetry = new EmcyTelemetry({
        apiKey: 'test-key',
        batchSize: 5,
        flushInterval: 1000,
      });
      expect(telemetry).toBeInstanceOf(EmcyTelemetry);
    });
  });

  describe('setServerInfo', () => {
    it('should include server metadata in traced invocations', async () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });
      telemetry.setServerInfo('test-server', '1.0.0');

      // Use trace() which merges metadata (log() does not)
      await telemetry.trace('testTool', async () => 'result');

      await telemetry.flush();

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.invocations[0].metadata?.serverName).toBe('test-server');
      expect(body.invocations[0].metadata?.serverVersion).toBe('1.0.0');
    });
  });

  describe('log', () => {
    it('should queue invocations', () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key', batchSize: 10 });

      telemetry.log({
        invocationId: 'inv-1',
        toolName: 'testTool',
        timestamp: new Date().toISOString(),
        duration: 100,
        success: true,
      });

      // Should not flush yet (batch size is 10)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should auto-flush when batch size is reached', async () => {
      const telemetry = new EmcyTelemetry({ 
        apiKey: 'test-key', 
        batchSize: 2,
        flushInterval: 60000, // Long interval to avoid timer interference
      });

      telemetry.log({
        invocationId: 'inv-1',
        toolName: 'tool1',
        timestamp: new Date().toISOString(),
        duration: 100,
        success: true,
      });

      telemetry.log({
        invocationId: 'inv-2',
        toolName: 'tool2',
        timestamp: new Date().toISOString(),
        duration: 200,
        success: true,
      });

      // flush() is called synchronously but returns a promise
      // Give it a moment to complete
      await Promise.resolve();

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.invocations).toHaveLength(2);
    });
  });

  describe('trace', () => {
    it('should trace successful function execution', async () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });

      const result = await telemetry.trace('myTool', async () => {
        return { data: 'test result' };
      });

      expect(result).toEqual({ data: 'test result' });

      await telemetry.flush();

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.invocations[0].toolName).toBe('myTool');
      expect(body.invocations[0].success).toBe(true);
      expect(body.invocations[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should trace failed function execution', async () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });

      await expect(
        telemetry.trace('failingTool', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      await telemetry.flush();

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.invocations[0].toolName).toBe('failingTool');
      expect(body.invocations[0].success).toBe(false);
      expect(body.invocations[0].error?.message).toBe('Test error');
    });

    it('should include input and sessionId when provided', async () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });

      await telemetry.trace(
        'toolWithOptions',
        async () => 'result',
        { input: { param: 'value' }, sessionId: 'session-123' }
      );

      await telemetry.flush();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.invocations[0].input).toEqual({ param: 'value' });
      expect(body.invocations[0].metadata?.sessionId).toBe('session-123');
    });
  });

  describe('flush', () => {
    it('should send queued invocations', async () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });

      telemetry.log({
        invocationId: 'inv-1',
        toolName: 'tool1',
        timestamp: new Date().toISOString(),
        duration: 100,
        success: true,
      });

      await telemetry.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.emcy.ai/v1/telemetry');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe('Bearer test-key');
    });

    it('should not send if queue is empty', async () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });

      await telemetry.flush();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should include mcpServerId in batch', async () => {
      const telemetry = new EmcyTelemetry({
        apiKey: 'test-key',
        mcpServerId: 'server-456',
      });

      telemetry.log({
        invocationId: 'inv-1',
        toolName: 'tool1',
        timestamp: new Date().toISOString(),
        duration: 100,
        success: true,
      });

      await telemetry.flush();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.mcpServerId).toBe('server-456');
    });
  });

  describe('shutdown', () => {
    it('should flush remaining invocations', async () => {
      const telemetry = new EmcyTelemetry({ apiKey: 'test-key' });

      telemetry.log({
        invocationId: 'inv-1',
        toolName: 'tool1',
        timestamp: new Date().toISOString(),
        duration: 100,
        success: true,
      });

      await telemetry.shutdown();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should stop flush timer', async () => {
      const telemetry = new EmcyTelemetry({
        apiKey: 'test-key',
        flushInterval: 1000,
      });

      await telemetry.shutdown();

      // Log after shutdown
      telemetry.log({
        invocationId: 'inv-1',
        toolName: 'tool1',
        timestamp: new Date().toISOString(),
        duration: 100,
        success: true,
      });

      // Advance timers - should not trigger flush since timer is stopped
      await vi.advanceTimersByTimeAsync(2000);

      // Only the shutdown flush should have been called (with empty queue)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('periodic flush', () => {
    it('should flush on interval', async () => {
      const telemetry = new EmcyTelemetry({
        apiKey: 'test-key',
        flushInterval: 1000,
        batchSize: 100, // High batch size so it won't auto-flush
      });

      telemetry.log({
        invocationId: 'inv-1',
        toolName: 'tool1',
        timestamp: new Date().toISOString(),
        duration: 100,
        success: true,
      });

      expect(mockFetch).not.toHaveBeenCalled();

      // Advance past flush interval
      await vi.advanceTimersByTimeAsync(1100);

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});

