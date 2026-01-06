/**
 * Transport layer for sending telemetry to Emcy
 */
import type { TelemetryBatch } from './types.js';
export declare class TelemetryTransport {
    private endpoint;
    private debug;
    constructor(endpoint?: string, debug?: boolean);
    send(batch: TelemetryBatch): Promise<boolean>;
    private delay;
}
//# sourceMappingURL=transport.d.ts.map