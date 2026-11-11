// Apify Actor entry (Standby mode): Streamable HTTP MCP endpoint at /mcp.
// Each request carries the CALLER's Apify token; the tools run public Apify Actors on the caller's account.
import http from 'node:http';
import { Actor, log } from 'apify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

export const TOOL_CALL_EVENT = 'tool-call';

await Actor.init();

// Apify removes the caller's Authorization header / ?token= before forwarding a Standby request, so the token never
// reaches this code. This Actor is SINGLE-TENANT: the platform starts a separate run in the CALLER's account, so this
// run's own APIFY_TOKEN belongs to the caller and the underlying Actors are billed to them. We only use it when the
// Actor is verifiably single-tenant (never if it were ever switched to multi-tenant, where it would be the developer's token).
let runTokenIsCallers = false;
try {
    const me = await Actor.apifyClient.actor(process.env.ACTOR_ID).get();
    runTokenIsCallers = me?.actorStandby?.tenancy === 'SINGLE_TENANT';
} catch { runTokenIsCallers = false; }
log.info(`Caller identity: ${runTokenIsCallers ? 'run token (single-tenant, caller account)' : 'request header only'}`);
const port = Number(process.env.ACTOR_STANDBY_PORT || process.env.ACTOR_WEB_SERVER_PORT || 3000);

function tokenFrom(req) {
    const h = req.headers.authorization;
    if (typeof h === 'string' && /^Bearer\s+\S+/i.test(h)) return h.replace(/^Bearer\s+/i, '').trim();
    const u = new URL(req.url, 'http://localhost');
    return u.searchParams.get('token') || undefined;
}

const httpServer = http.createServer(async (req, res) => {
    try {
        if (req.headers['x-apify-container-server-readiness-probe']) { res.writeHead(200).end('ok'); return; }
        const path = new URL(req.url, 'http://localhost').pathname;
        if (path === '/' && req.method === 'GET') {
            res.writeHead(200, { 'content-type': 'text/plain' }).end('Site Audit MCP server. POST MCP requests to /mcp with "Authorization: Bearer <your Apify token>".');
            return;
        }
        if (path !== '/mcp') { res.writeHead(404).end('Not found'); return; }
        if (req.method !== 'POST') {
            res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. Use POST (stateless Streamable HTTP).' }, id: null }));
            return;
        }
        const token = tokenFrom(req) || (runTokenIsCallers ? process.env.APIFY_TOKEN : undefined);
        const server = createServer({
            getToken: () => token,
            onToolSuccess: async () => { try { await Actor.charge({ eventName: TOOL_CALL_EVENT, count: 1 }); } catch (e) { log.warning(`charge failed: ${e.message}`); } },
        });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res);
    } catch (err) {
        log.error(`request failed: ${err.message}`);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
    }
});
httpServer.listen(port, () => log.info(`Site Audit MCP listening on :${port} (/mcp)`));
