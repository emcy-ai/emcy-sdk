# @emcy/sdk

Telemetry SDK for MCP (Model Context Protocol) servers. Track tool invocations, errors, and performance.

[![npm version](https://badge.fury.io/js/%40emcy%2Fsdk.svg)](https://www.npmjs.com/package/@emcy/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is this?

This SDK adds observability to your MCP servers. When AI agents call your tools, Emcy tracks:

- **Tool invocations** - Which tools are called and how often
- **Errors** - Failures with full context for debugging
- **Performance** - Latency metrics and success rates
- **Metadata** - Custom attributes for filtering and analysis

View your data in the [Emcy Dashboard](https://emcy.ai).

## Installation

```bash
npm install @emcy/sdk
```

## Quick Start

```typescript
import { EmcyTelemetry } from '@emcy/sdk';

// Initialize with your API key
const emcy = new EmcyTelemetry({
  apiKey: process.env.EMCY_API_KEY!,
  endpoint: 'https://api.emcy.ai/v1/telemetry',
  mcpServerId: process.env.EMCY_MCP_SERVER_ID,
});

// Set server info for metadata
emcy.setServerInfo('my-mcp-server', '1.0.0');

// Wrap your tool handlers with trace()
const result = await emcy.trace('get_user', async () => {
  return await api.getUser(userId);
});
```

## API

### `EmcyTelemetry`

The main class for telemetry.

```typescript
const emcy = new EmcyTelemetry({
  apiKey: string;           // Required: Your Emcy API key
  endpoint?: string;        // Optional: Telemetry endpoint (default: https://api.emcy.ai/v1/telemetry)
  mcpServerId?: string;     // Optional: MCP server ID for grouping
  debug?: boolean;          // Optional: Enable debug logging
  flushInterval?: number;   // Optional: Batch flush interval in ms (default: 5000)
  maxBatchSize?: number;    // Optional: Max events per batch (default: 100)
});
```

### `setServerInfo(name, version)`

Set server metadata included with all events.

```typescript
emcy.setServerInfo('my-server', '1.2.3');
```

### `trace<T>(toolName, fn)`

Wrap an async function to track its execution.

```typescript
const result = await emcy.trace('search_products', async () => {
  return await api.searchProducts(query);
});
```

The trace automatically captures:
- Start time
- End time / duration
- Success or failure
- Error details if thrown

### `trackInvocation(invocation)`

Manually track a tool invocation.

```typescript
emcy.trackInvocation({
  toolName: 'get_user',
  startTime: Date.now(),
  endTime: Date.now() + 150,
  success: true,
  metadata: { userId: '123' },
});
```

### `flush()`

Force send all pending events. Called automatically on interval.

```typescript
await emcy.flush();
```

### `shutdown()`

Flush and stop the telemetry client.

```typescript
await emcy.shutdown();
```

## Configuration

### Environment Variables

The SDK reads these environment variables:

| Variable | Description |
|----------|-------------|
| `EMCY_API_KEY` | Your Emcy API key (required) |
| `EMCY_TELEMETRY_URL` | Telemetry endpoint URL |
| `EMCY_MCP_SERVER_ID` | MCP server ID for grouping |
| `EMCY_DEBUG` | Set to `true` for debug logs |

### With @emcy/openapi-to-mcp

If you generated your MCP server with [@emcy/openapi-to-mcp](https://www.npmjs.com/package/@emcy/openapi-to-mcp) and the `--emcy` flag, the SDK is already integrated. Just set your environment variables:

```bash
EMCY_API_KEY=your-api-key
EMCY_TELEMETRY_URL=https://api.emcy.ai/v1/telemetry
EMCY_MCP_SERVER_ID=mcp_xxxxxxxxxxxx
```

## Example: Manual Integration

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { EmcyTelemetry } from '@emcy/sdk';

const emcy = new EmcyTelemetry({
  apiKey: process.env.EMCY_API_KEY!,
});

emcy.setServerInfo('my-server', '1.0.0');

const server = new Server(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args } = request.params;
  
  // Wrap the tool execution with telemetry
  return emcy.trace(toolName, async () => {
    switch (toolName) {
      case 'get_data':
        return await getData(args);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await emcy.shutdown();
  process.exit(0);
});
```

## Data Format

Events are batched and sent as:

```typescript
interface TelemetryBatch {
  apiKey: string;
  mcpServerId?: string;
  serverName?: string;
  serverVersion?: string;
  invocations: ToolInvocation[];
}

interface ToolInvocation {
  toolName: string;
  startTime: number;
  endTime: number;
  success: boolean;
  errorMessage?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
}
```

## Self-Hosting

Point the SDK at your own telemetry endpoint:

```typescript
const emcy = new EmcyTelemetry({
  apiKey: 'your-key',
  endpoint: 'https://your-server.com/api/v1/telemetry',
});
```

The endpoint should accept POST requests with the `TelemetryBatch` JSON body.

## License

MIT © [Emcy](https://emcy.ai)

