/**
 * Emcy Telemetry - Collects and batches tool invocation data
 */
import type { EmcyConfig, ToolInvocation } from './types.js';
export declare class EmcyTelemetry {
    private apiKey;
    private mcpServerId?;
    private transport;
    private queue;
    private batchSize;
    private flushInterval;
    private flushTimer;
    private debug;
    private metadata;
    constructor(config: EmcyConfig);
    /**
     * Set server metadata that will be included in all invocations
     */
    setServerInfo(name: string, version: string): void;
    /**
     * Trace a tool invocation
     */
    trace<T>(toolName: string, fn: () => Promise<T>, options?: {
        input?: Record<string, unknown>;
        sessionId?: string;
    }): Promise<T>;
    /**
     * Manually log an invocation
     */
    log(invocation: ToolInvocation): void;
    /**
     * Flush queued invocations to Emcy
     */
    flush(): Promise<void>;
    /**
     * Stop the telemetry collector
     */
    shutdown(): Promise<void>;
    private startFlushTimer;
    private setupShutdownHooks;
    private extractOutput;
    private extractError;
}
//# sourceMappingURL=telemetry.d.ts.map