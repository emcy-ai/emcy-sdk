/**
 * Transport layer for sending telemetry to Emcy
 */
const DEFAULT_ENDPOINT = 'https://api.emcy.ai/v1/telemetry';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
export class TelemetryTransport {
    endpoint;
    debug;
    constructor(endpoint, debug = false) {
        this.endpoint = endpoint || DEFAULT_ENDPOINT;
        this.debug = debug;
    }
    async send(batch) {
        let lastError = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(this.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${batch.apiKey}`,
                    },
                    body: JSON.stringify(batch),
                });
                if (response.ok) {
                    if (this.debug) {
                        console.error(`[emcy] Sent ${batch.invocations.length} invocations`);
                    }
                    return true;
                }
                // Don't retry on 4xx errors (client errors)
                if (response.status >= 400 && response.status < 500) {
                    console.error(`[emcy] Client error: ${response.status} ${response.statusText}`);
                    return false;
                }
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
            // Wait before retry (exponential backoff)
            if (attempt < MAX_RETRIES - 1) {
                await this.delay(RETRY_DELAY_MS * Math.pow(2, attempt));
            }
        }
        console.error(`[emcy] Failed to send telemetry after ${MAX_RETRIES} attempts:`, lastError?.message);
        return false;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=transport.js.map