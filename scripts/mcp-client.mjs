// Test client: node scripts/mcp-client.mjs <serverUrl> list | call <tool> '<json args>'
// Reads APIFY_TOKEN from the environment and never prints it.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const [url, cmd, tool, json] = process.argv.slice(2);
const token = process.env.APIFY_TOKEN;
const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
const client = new Client({ name: 'steadfeed-test', version: '1' });
const t0 = Date.now();
await client.connect(transport);
const scrub = (s) => (token ? s.split(token).join('***') : s);
if (cmd === 'list') {
    const { tools } = await client.listTools();
    console.log(scrub(JSON.stringify(tools.map((t) => ({ name: t.name, title: t.title, args: Object.keys(t.inputSchema?.properties ?? {}) })), null, 1)));
} else {
    const r = await client.callTool({ name: tool, arguments: JSON.parse(json || '{}') }, undefined, { timeout: 300_000 });
    console.log(scrub(JSON.stringify(r, null, 1)));
}
console.error(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await client.close();
