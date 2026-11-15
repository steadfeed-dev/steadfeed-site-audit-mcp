import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { runReport, summarize } from '../src/report.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)));
const fakeRun = (calls) => async ({ actor, input, maxTotalChargeUsd }) => { calls.push({ actor, input, maxTotalChargeUsd }); return { items: fx(actor), runId: `R-${actor}` }; };
const psiFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ lighthouseResult: { categories: { performance: { score: 0.42 } }, audits: { 'render-blocking-resources': { title: 'Eliminate render-blocking resources', numericValue: 900, details: { type: 'opportunity' } } } } }) });

async function connect(opts) {
    const server = createServer(opts);
    const client = new Client({ name: 't', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
}

describe('ai visibility report', () => {
    it('runs the checks in parallel with small caps and builds a plain-English summary', async () => {
        const calls = [];
        const r = await runReport({ url: 'https://getsteadfeed.com/pay-transparency/', extraPages: ['https://getsteadfeed.com/hr/', 'https://other.example/x'] }, { token: 't', runImpl: fakeRun(calls), fetchImpl: psiFetch });
        assert.deepEqual(calls.map((c) => c.actor).sort(), ['accessibility-wcag-checker', 'ai-crawler-access-auditor', 'schema-ai-readiness-validator', 'website-tech-stack-detector']);
        assert.deepEqual(r.pagesChecked, ['https://getsteadfeed.com/', 'https://getsteadfeed.com/hr/']);
        for (const c of calls) assert.ok(c.maxTotalChargeUsd <= 0.05);
        assert.ok(r.score > 0 && r.score <= 100);
        assert.match(r.summary, /AI-readiness score: \d+\/100/);
        assert.equal(r.fixes[0].priority, 'high');
        assert.ok(r.fixes.some((f) => /JSON-LD/.test(f.fix)));
        assert.ok(r.fixes.some((f) => /Mobile speed is 42/.test(f.fix)));
        assert.equal(r.sections.pageSpeed.source, 'Google PageSpeed (keyless)');
        assert.ok(!calls.some((c) => c.actor === 'bulk-pagespeed-audit'));
    });
    it('keeps going when one section fails and lists what was skipped', () => {
        const r = summarize({ home: 'https://x.test/', pages: ['https://x.test/'], results: { crawler: { ok: false, error: 'boom' }, schema: { ok: true, items: fx('schema-ai-readiness-validator') } } });
        assert.ok(r.coreOk); assert.ok(r.notIncluded.some((s) => /AI crawler access: boom/.test(s)));
    });
    it('only runs the AI answers check when a key is supplied, and never echoes keys', async () => {
        const calls = [];
        const r = await runReport({ url: 'https://getsteadfeed.com', brand: 'Steadfeed', includePageSpeed: false }, { token: 't', runImpl: fakeRun(calls), fetchImpl: psiFetch });
        assert.ok(!calls.some((c) => c.actor === 'ai-search-visibility-tracker'));
        assert.ok(r.notIncluded.some((s) => /not measured/.test(s)));
        const calls2 = []; const secret = 'sk-test-SECRET-0123456789abcdef';
        const r2 = await runReport({ url: 'https://getsteadfeed.com', brand: 'Steadfeed', includePageSpeed: false, openaiApiKey: secret }, { token: 't', runImpl: async (p) => (p.actor === 'ai-search-visibility-tracker' ? (calls2.push(p), { items: [{ status: 'ok', provider: 'openai', prompt: 'q', brandMentioned: false }], runId: 'A' }) : fakeRun([])(p)), fetchImpl: psiFetch });
        assert.equal(calls2[0].input.openaiApiKey, secret);
        assert.ok(!JSON.stringify(r2).includes(secret));
        assert.ok(r2.fixes.some((f) => f.area === 'AI answers'));
    });
});

describe('profiles', () => {
    it('ai-visibility profile exposes the focused tool set, report first', async () => {
        const client = await connect({ getToken: () => 'tok', profile: 'ai-visibility' });
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map((t) => t.name), ['ai_visibility_report', 'audit_schema_ai_readiness', 'audit_accessibility', 'detect_tech_stack', 'audit_pagespeed', 'audit_ai_crawler_access', 'check_ai_search_visibility']);
    });
    it('default profile keeps every Site Audit tool plus the new ones', async () => {
        const client = await connect({ getToken: () => 'tok' });
        const { tools } = await client.listTools();
        assert.equal(tools.length, 9);
    });
    it('check_ai_search_visibility refuses without keys (no charge) unless dryRun', async () => {
        const client = await connect({ getToken: () => 'tok', fetchImpl: async () => { throw new Error('should not be called'); } });
        const r = await client.callTool({ name: 'check_ai_search_visibility', arguments: { brand: 'Acme', prompts: ['What is the best widget tool?'] } });
        assert.ok(r.isError); assert.match(r.content[0].text, /OpenAI API key/);
    });
});

describe('limited result', () => {
    it('labels reports with fewer than 2 checks as limited and not billable', () => {
        const r = summarize({ home: 'https://x.test/', pages: ['https://x.test/'], results: { crawler: { ok: true, items: [{ status: 'ok', verdict: 'open', headline: 'ok', suggestedActions: [] }] }, schema: { ok: true, items: [{ status: 'error', url: 'https://x.test/', httpStatus: 403 }] } } });
        assert.equal(r.limited, true); assert.equal(r.billable, false); assert.equal(r.score, null); assert.equal(r.band, 'limited result');
        assert.match(r.summary, /LIMITED RESULT/);
    });
    it('a server-side report key is used for Google only and scrubbed from errors', async () => {
        const key = 'AIzaSERVERKEY-0123456789abcdefghij';
        const calls = [];
        const seen = [];
        const r = await runReport({ url: 'https://getsteadfeed.com' }, { token: 't', env: { REPORT_GOOGLE_PSI_API_KEY: key }, runImpl: fakeRun(calls), fetchImpl: async (u) => { seen.push(String(u)); throw new Error(`boom ${u}`); } });
        assert.ok(seen[0].includes(key));
        assert.ok(!JSON.stringify(calls).includes(key));
        assert.ok(!JSON.stringify(r).includes(key));
    });
});
