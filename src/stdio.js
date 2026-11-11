#!/usr/bin/env node
// Local stdio MCP server: runs with your own APIFY_TOKEN (and optional GOOGLE_PSI_API_KEY).
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const token = process.env.APIFY_TOKEN;
if (!token) {
    console.error('APIFY_TOKEN is not set. Create a token at https://console.apify.com/settings/integrations and export it before starting this server.');
    process.exit(1);
}
const server = createServer({ getToken: () => token, env: { GOOGLE_PSI_API_KEY: process.env.GOOGLE_PSI_API_KEY } });
await server.connect(new StdioServerTransport());
