/**
 * Types for Emcy Telemetry SDK
 * 
 * This SDK can be used standalone or integrated with the Emcy platform.
 * When used standalone, provide a custom endpoint URL.
 * When used with Emcy platform, provide the API key from your dashboard.
 */

export interface EmcyConfig {
  /**
   * API key for authentication. Required.
   * Get this from the Emcy dashboard or your self-hosted telemetry server.
   */
  apiKey: string;
  
  /**
   * Telemetry endpoint URL. 
   * Defaults to https://api.emcy.ai/v1/telemetry for Emcy cloud.
   * Override for self-hosted or custom backends.
   */
  endpoint?: string;
  
  /**
   * MCP Server ID for linking telemetry to a specific server.
   * Optional when the server is registered with Emcy platform.
   */
  mcpServerId?: string;
  
  /**
   * Number of invocations to batch before sending.
   * Default: 10
   */
  batchSize?: number;
  
  /**
   * Interval in milliseconds between automatic flushes.
   * Default: 5000 (5 seconds)
   */
  flushInterval?: number;
  
  /**
   * Enable debug logging to stderr.
   * Default: false
   */
  debug?: boolean;
}

export interface ToolInvocation {
  invocationId: string;
  toolName: string;
  timestamp: string;
  duration: number;
  success: boolean;
  input?: Record<string, unknown>;
  output?: {
    status?: number;
    body?: unknown;
  };
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  metadata?: {
    sessionId?: string;
    agentId?: string;
    userId?: string;
    serverName?: string;
    serverVersion?: string;
    mcpServerId?: string;
  };
}

export interface TelemetryBatch {
  apiKey: string;
  mcpServerId?: string;
  timestamp: string;
  invocations: ToolInvocation[];
}

