import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { GLAMA_CONNECTOR_CLAIM, serveGlamaJsonIfRequested } from '../src/glama.js';

function startServer() {
    const server = http.createServer((req, res) => {
        const path = new URL(req.url, 'http://localhost').pathname;
        if (serveGlamaJsonIfRequested(path, req.method, res)) return;
        if (path === '/' && req.method === 'GET') {
            res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
            return;
        }
        if (path !== '/mcp') { res.writeHead(404).end('Not found'); return; }
        if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST' }).end('Method not allowed');
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

describe('Glama connector claim routes', () => {
    let server;
    let base;
    before(async () => {
        server = await startServer();
        const { port } = server.address();
        base = `http://127.0.0.1:${port}`;
    });
    after(async () => { await new Promise((r) => server.close(r)); });

    const paths = ['/mcp/.well-known/glama.json', '/.well-known/glama.json'];

    for (const path of paths) {
        it(`GET ${path} returns the claim JSON without auth`, async () => {
            const res = await fetch(`${base}${path}`);
            assert.equal(res.status, 200);
            assert.match(res.headers.get('content-type'), /application\/json/);
            const body = await res.json();
            assert.deepEqual(body, GLAMA_CONNECTOR_CLAIM);
            assert.equal(body.$schema, 'https://glama.ai/mcp/schemas/connector.json');
            assert.equal(body.maintainers[0].email, 'hello@getsteadfeed.com');
        });
        it(`GET ${path} still works with a query string present`, async () => {
            const res = await fetch(`${base}${path}?token=should-be-ignored`);
            assert.equal(res.status, 200);
            assert.deepEqual(await res.json(), GLAMA_CONNECTOR_CLAIM);
        });
        it(`HEAD ${path} is 200`, async () => {
            const res = await fetch(`${base}${path}`, { method: 'HEAD' });
            assert.equal(res.status, 200);
        });
        it(`POST ${path} is 405`, async () => {
            const res = await fetch(`${base}${path}`, { method: 'POST', body: '{}' });
            assert.equal(res.status, 405);
        });
    }

    it('does not change the MCP POST /mcp route', async () => {
        const res = await fetch(`${base}/mcp`, { method: 'POST', body: '{}' });
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { ok: true });
    });

    it('GET /mcp is still 405', async () => {
        const res = await fetch(`${base}/mcp`);
        assert.equal(res.status, 405);
    });
});
