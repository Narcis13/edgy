// Edgy for agents, over MCP (stdio): the tools in tools.ts, on standard input and output.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server } from './tools';

await server.connect(new StdioServerTransport());
