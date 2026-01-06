/**
 * Emcy Telemetry - Collects and batches tool invocation data
 */

import type { EmcyConfig, ToolInvocation } from './types.js';
import { TelemetryTransport } from './transport.js';

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL = 5000; // 5 seconds

export class EmcyTelemetry {
  private apiKey: string;
  private mcpServerId?: string;
  private transport: TelemetryTransport;
  private queue: ToolInvocation[] = [];
  private batchSize: number;
  private flushInterval: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private debug: boolean;
  private metadata: {
    serverName?: string;
    serverVersion?: string;
    mcpServerId?: string;
  } = {};
  
  constructor(config: EmcyConfig) {
    this.apiKey = config.apiKey;
    this.mcpServerId = config.mcpServerId;
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.flushInterval = config.flushInterval || DEFAULT_FLUSH_INTERVAL;
    this.debug = config.debug || false;
    this.transport = new TelemetryTransport(config.endpoint, this.debug);
    
    // Store mcpServerId in metadata for invocations
    if (config.mcpServerId) {
      this.metadata.mcpServerId = config.mcpServerId;
    }
    
    // Start periodic flush
    this.startFlushTimer();
    
    // Flush on process exit
    this.setupShutdownHooks();
  }
  
  /**
   * Set server metadata that will be included in all invocations
   */
  setServerInfo(name: string, version: string): void {
    this.metadata.serverName = name;
    this.metadata.serverVersion = version;
  }
  
  /**
   * Trace a tool invocation
   */
  async trace<T>(
    toolName: string,
    fn: () => Promise<T>,
    options?: { input?: Record<string, unknown>; sessionId?: string }
  ): Promise<T> {
    const invocationId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      const result = await fn();
      
      this.log({
        invocationId,
        toolName,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: true,
        input: options?.input,
        output: this.extractOutput(result),
        metadata: {
          sessionId: options?.sessionId,
          ...this.metadata,
        },
      });
      
      return result;
    } catch (error) {
      this.log({
        invocationId,
        toolName,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        input: options?.input,
        error: this.extractError(error),
        metadata: {
          sessionId: options?.sessionId,
          ...this.metadata,
        },
      });
      
      throw error;
    }
  }
  
  /**
   * Manually log an invocation
   */
  log(invocation: ToolInvocation): void {
    this.queue.push(invocation);
    
    if (this.debug) {
      console.error(`[emcy] Logged: ${invocation.toolName} (${invocation.duration}ms, ${invocation.success ? 'success' : 'error'})`);
    }
    
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }
  
  /**
   * Flush queued invocations to Emcy
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    
    const invocations = this.queue.splice(0, this.queue.length);
    
    await this.transport.send({
      apiKey: this.apiKey,
      mcpServerId: this.mcpServerId,
      timestamp: new Date().toISOString(),
      invocations,
    });
  }
  
  /**
   * Stop the telemetry collector
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
  
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(console.error);
    }, this.flushInterval);
    
    // Don't keep process alive just for telemetry
    this.flushTimer.unref();
  }
  
  private setupShutdownHooks(): void {
    const shutdown = () => {
      this.shutdown().catch(console.error);
    };
    
    process.on('beforeExit', shutdown);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
  
  private extractOutput(result: unknown): ToolInvocation['output'] {
    if (result && typeof result === 'object' && 'status' in result) {
      const r = result as { status?: number; data?: unknown };
      return { status: r.status, body: r.data };
    }
    return { body: result };
  }
  
  private extractError(error: unknown): ToolInvocation['error'] {
    if (error instanceof Error) {
      return {
        message: error.message,
        code: (error as { code?: string }).code,
        stack: error.stack,
      };
    }
    return { message: String(error) };
  }
}

