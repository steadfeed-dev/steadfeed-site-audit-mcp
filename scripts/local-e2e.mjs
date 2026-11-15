// Local end-to-end test: real MCP HTTP server + real MCP client over Streamable HTTP, real Google PageSpeed (keyless),
// with the Apify API answered from results recorded from real cloud runs (no Apify token needed).
// Usage: node scripts/local-e2e.mjs <recorded.json> <site> [profile]
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createServer } from '../src/server.js';

const [recPath, site, profile = 'ai-visibility'] = process.argv.slice(2);
const rec = JSON.parse(readFileSync(recPath, 'utf8'));
const host = new URL(site).hostname;
const runs = new Map(); let n = 0;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fakeApify = async (url, init) => {
    const u = String(url);
    if (!u.startsWith('https://api.apify.com/')) return fetch(url, init); // real network (PageSpeed)
    const m = u.match(/acts\/steadfeed~([^/]+)\/runs/);
    if (m) { const id = `REC${++n}`; runs.set(id, m[1]); return json(201, { data: { id, status: 'SUCCEEDED', defaultDatasetId: id } }); }
    const d = u.match(/datasets\/(REC\d+)\/items/);
    if (d) return json(200, rec[host]?.[runs.get(d[1])] ?? []);
    return json(404, { error: { message: 'not recorded' } });
};
const charges = [];
const srv = http.createServer(async (req, res) => {
    const server = createServer({ getToken: () => 'local-test', profile, env: { GOOGLE_PSI_API_KEY: process.env.GOOGLE_PSI_API_KEY }, fetchImpl: fakeApify, onToolSuccess: async (t) => charges.push(t.name) });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport); await transport.handleRequest(req, res);
}).listen(0);
const port = srv.address().port;
const client = new Client({ name: 'e2e', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
const t0 = Date.now();
const { tools } = await client.listTools();
const r = await client.callTool({ name: 'ai_visibility_report', arguments: { url: site } }, undefined, { timeout: 120_000 });
console.log(JSON.stringify({ site, tools: tools.map((t) => t.name), isError: !!r.isError, charged: charges, seconds: (Date.now() - t0) / 1000, summary: r.content[0].text, data: r.content[1] ? JSON.parse(r.content[1].text) : null }, null, 1));
await client.close(); srv.close();
