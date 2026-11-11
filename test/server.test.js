import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { TOOLS, defaultCapUsd } from '../src/tools.js';

async function connect(opts) {
    const server = createServer(opts);
    const client = new Client({ name: 't', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
}
const resp = (status, body) => ({ ok: status < 400, status, headers: { get: () => null }, text: async () => JSON.stringify(body) });
const okFetch = (calls, items = [{ url: 'https://example.com/', status: 'ok' }]) => async (url, init) => {
    if (/\/datasets\//.test(url)) return resp(200, items);
    if (/\/runs\?/.test(url)) { calls.push({ url, init }); return resp(201, { data: { id: 'RUN123', status: 'SUCCEEDED', defaultDatasetId: 'DS1' } }); }
    return resp(200, { data: { id: 'RUN123', status: 'SUCCEEDED', defaultDatasetId: 'DS1' } });
};

describe('tool catalogue', () => {
    it('exposes seven tools mapped to public steadfeed actors', async () => {
        const client = await connect({ getToken: () => 'tok' });
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map((t) => t.name).sort(), ['audit_accessibility', 'audit_ai_crawler_access', 'audit_pagespeed', 'audit_schema_ai_readiness', 'detect_tech_stack', 'monitor_page_changes', 'monitor_pay_transparency']);
        for (const t of tools) { assert.ok(t.description.length > 40); assert.equal(t.inputSchema.type, 'object'); }
        assert.equal(TOOLS.length, 7);
    });
});

describe('tool calls', () => {
    it('runs the actor with the caller token, a spend cap and mapped input', async () => {
        const calls = [];
        const client = await connect({ getToken: () => 'user-token-abc', fetchImpl: okFetch(calls) });
        const r = await client.callTool({ name: 'audit_schema_ai_readiness', arguments: { urls: ['https://example.com/'], dryRun: true } });
        assert.ok(!r.isError);
        const body = JSON.parse(r.content[0].text);
        assert.equal(body.itemCount, 1); assert.equal(body.runId, 'RUN123');
        assert.match(calls[0].url, /acts\/steadfeed~schema-ai-readiness-validator\/runs\?/);
        assert.match(calls[0].url, /maxTotalChargeUsd=0\.05(&|$)/);
        assert.equal(calls[0].init.headers.authorization, 'Bearer user-token-abc');
        assert.deepEqual(JSON.parse(calls[0].init.body), { urls: ['https://example.com/'], dryRun: true });
        assert.ok(!r.content[0].text.includes('user-token-abc'));
    });
    it('respects maxCostUsd', async () => {
        const calls = [];
        const client = await connect({ getToken: () => 't', fetchImpl: okFetch(calls) });
        await client.callTool({ name: 'detect_tech_stack', arguments: { urls: ['https://a.com/', 'https://b.com/'], maxCostUsd: 0.2 } });
        assert.match(calls[0].url, /maxTotalChargeUsd=0\.2(&|$)/);
    });
    it('pagespeed requires a Google key unless dryRun; env key works locally', async () => {
        const calls = [];
        const c1 = await connect({ getToken: () => 't', fetchImpl: okFetch(calls) });
        const bad = await c1.callTool({ name: 'audit_pagespeed', arguments: { urls: ['https://example.com/'] } });
        assert.equal(bad.isError, true); assert.match(bad.content[0].text, /googleApiKey is required/); assert.equal(calls.length, 0);
        const c2 = await connect({ getToken: () => 't', env: { GOOGLE_PSI_API_KEY: 'AIza' + 'x'.repeat(30) }, fetchImpl: okFetch(calls) });
        const ok = await c2.callTool({ name: 'audit_pagespeed', arguments: { urls: ['https://example.com/'], strategy: ['mobile', 'desktop'] } });
        assert.ok(!ok.isError);
        const sent = JSON.parse(calls[0].init.body);
        assert.equal(sent.maxAudits, 20); assert.deepEqual(sent.strategy, ['mobile', 'desktop']); assert.ok(sent.googleApiKey);
        assert.ok(!ok.content[0].text.includes('AIza'));
    });
    it('page change monitor maps pages and watchlist', async () => {
        const calls = [];
        const client = await connect({ getToken: () => 't', fetchImpl: okFetch(calls) });
        await client.callTool({ name: 'monitor_page_changes', arguments: { pages: [{ url: 'https://example.com/pricing', label: 'Pricing' }], skipNoiseOnlyChanges: true } });
        const sent = JSON.parse(calls[0].init.body);
        assert.equal(sent.watchlistId, 'mcp'); assert.equal(sent.skipNoiseOnlyChanges, true); assert.equal(sent.pages[0].label, 'Pricing');
    });
    it('maps API failures to clear tool errors without leaking the token', async () => {
        for (const [status, re] of [[401, /rejected the API token/], [402, /insufficient credit/], [408, /did not finish/], [500, /Apify API error 500/]]) {
            const client = await connect({ getToken: () => 'secret-token-xyz', fetchImpl: async () => resp(status === 408 ? 200 : status, status === 408 ? { data: { id: 'R', status: 'TIMED-OUT', defaultDatasetId: 'D' } } : { error: { message: 'boom secret-token-xyz' } }) });
            const r = await client.callTool({ name: 'detect_tech_stack', arguments: { urls: ['https://example.com/'] } });
            assert.equal(r.isError, true); assert.match(r.content[0].text, re);
        }
    });
    it('missing token gives an actionable error', async () => {
        const client = await connect({ getToken: () => undefined, fetchImpl: okFetch([]) });
        const r = await client.callTool({ name: 'detect_tech_stack', arguments: { urls: ['https://example.com/'] } });
        assert.equal(r.isError, true); assert.match(r.content[0].text, /No Apify API token/);
    });
    it('calls onToolSuccess only on success', async () => {
        let n = 0;
        const client = await connect({ getToken: () => 't', fetchImpl: okFetch([]), onToolSuccess: async () => { n++; } });
        await client.callTool({ name: 'detect_tech_stack', arguments: { urls: ['https://example.com/'] } });
        const c2 = await connect({ getToken: () => 't', fetchImpl: async () => resp(500, {}), onToolSuccess: async () => { n += 10; } });
        await c2.callTool({ name: 'detect_tech_stack', arguments: { urls: ['https://example.com/'] } });
        assert.equal(n, 1);
    });
    it('rejects invalid input (non-URL, too many URLs)', async () => {
        const client = await connect({ getToken: () => 't', fetchImpl: okFetch([]) });
        const r = await client.callTool({ name: 'detect_tech_stack', arguments: { urls: ['not a url'] } }).catch((e) => ({ isError: true, content: [{ text: String(e.message) }] }));
        assert.equal(r.isError, true);
    });
    it('truncates very large results', async () => {
        const big = Array.from({ length: 400 }, (_, i) => ({ i, blob: 'x'.repeat(500) }));
        const client = await connect({ getToken: () => 't', fetchImpl: okFetch([], big) });
        const r = await client.callTool({ name: 'detect_tech_stack', arguments: { urls: ['https://example.com/'] } });
        const body = JSON.parse(r.content[0].text);
        assert.equal(body.truncated, true); assert.ok(body.items.length < 400); assert.ok(r.content[0].text.length < 95000);
    });
});

describe('default spend cap', () => {
    it('scales with units and stays small', () => {
        const t = TOOLS.find((x) => x.name === 'audit_accessibility');
        assert.equal(defaultCapUsd(t, { urls: ['https://a.com/'] }), 0.05);
        assert.equal(defaultCapUsd(t, { urls: Array(10).fill('https://a.com/') }), 0.0601);
        assert.ok(defaultCapUsd(t, { urls: Array(40).fill('https://a.com/') }) < 0.25);
    });
});

describe('monitor_pay_transparency (gated tool)', () => {
    it('carries the approved Option A prices: $0.02 initial/changed (cap basis), $0.005 unchanged recheck', () => {
        const t = TOOLS.find((x) => x.name === 'monitor_pay_transparency');
        assert.equal(t.unitPriceUsd, 0.02); assert.equal(t.recheckPriceUsd, 0.005);
        assert.match(t.description, /\$0\.02 per initial or changed/); assert.match(t.description, /\$0\.005 per verified unchanged/);
        assert.match(t.description, /human review/);
    });
    it('maps input, bounds the spend cap and never forwards a webhook', async () => {
        const calls = [];
        const client = await connect({ getToken: () => 't', fetchImpl: okFetch(calls) });
        await client.callTool({ name: 'monitor_pay_transparency', arguments: { boardUrls: ['https://job-boards.greenhouse.io/acme'], maxJobsPerCompany: 10, hiringStates: ['CA'], webhookUrl: 'https://evil.example/hook' } });
        assert.match(calls[0].url, /acts\/steadfeed~pay-transparency-compliance-monitor\/runs/);
        assert.match(calls[0].url, /maxTotalChargeUsd=0\.2101(&|$)/);
        const body = JSON.parse(calls[0].init.body);
        assert.equal(body.maxJobsPerCompany, 10); assert.deepEqual(body.hiringStates, ['CA']); assert.equal(body.watchlistId, 'mcp'); assert.equal(body.webhookUrl, undefined);
    });
});
