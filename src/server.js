import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOLS, ACTOR_OWNER, defaultCapUsd, MIN_CAP_USD } from './tools.js';
import { runActorSync, formatResult, ApifyCallError } from './apify.js';
import { REPORT_TOOL, runReport } from './report.js';

export const SERVER_INFO = { name: 'site-audit', version: '0.3.0' };

/** Tool profiles: one codebase, two listings. 'all' = Site Audit MCP; 'ai-visibility' = the focused AI Visibility connector. */
export const PROFILES = {
    all: { name: 'site-audit', tools: null, instructions: null },
    'ai-visibility': {
        name: 'ai-visibility',
        tools: ['ai_visibility_report', 'audit_ai_crawler_access', 'audit_schema_ai_readiness', 'check_ai_search_visibility', 'audit_pagespeed', 'audit_accessibility', 'detect_tech_stack'],
        instructions: 'AI Visibility connector. For "how visible is my site to AI / ChatGPT / AI search", call ai_visibility_report with the site URL first, then explain its summary and fixes in plain English. Use the single-purpose tools only for follow-up detail. Each call runs on the caller\'s own Apify account and is billed there (a full report is about $0.03). Only public pages are checked. Never ask the user to paste API keys unless they want the optional real-AI-answers check, and never repeat keys back.',
    },
};

/**
 * @param {{getToken:()=>string|undefined, env?:object, onToolSuccess?:(tool:object)=>Promise<void>, fetchImpl?:typeof fetch}} opts
 */
export function createServer({ getToken, env = {}, onToolSuccess, fetchImpl, profile = 'all' }) {
    const prof = PROFILES[profile] ?? PROFILES.all;
    const server = new McpServer({ ...SERVER_INFO, name: prof.name }, {
        instructions: prof.instructions ?? 'Site Audit MCP: run website-audit tools (schema/AI-readiness, accessibility, tech stack, PageSpeed, AI-crawler access, page change monitoring, pay-transparency posting monitor). Each call runs a public Apify Actor on the caller\'s own Apify account and is billed there. Pass dryRun:true to preview without cost. Only public pages are checked.',
    });
    const wanted = (name) => !prof.tools || prof.tools.includes(name);
    if (wanted(REPORT_TOOL.name)) {
        server.registerTool(REPORT_TOOL.name, {
            title: REPORT_TOOL.title, description: REPORT_TOOL.description, inputSchema: REPORT_TOOL.shape,
            annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        }, async (args) => {
            try {
                const token = getToken();
                if (!token) throw new ApifyCallError('No Apify API token. Connect with your Apify account (OAuth) or pass "Authorization: Bearer <token>".', 401);
                const report = await runReport(args, { token, env, fetchImpl });
                if (!report.coreOk) return { isError: true, content: [{ type: 'text', text: `Could not build a report for ${report.site}, so nothing was charged for the report.\n${report.notIncluded.map((x) => `- ${x}`).join('\n')}${report.fixes.length ? `\n\nWhat this suggests:\n${report.fixes.map((f) => `- ${f.fix}`).join('\n')}` : ''}` }] };
                if (report.billable) await onToolSuccess?.(REPORT_TOOL);
                const { summary, ...data } = report;
                return { content: [{ type: 'text', text: summary }, { type: 'text', text: JSON.stringify(data, null, 1).slice(0, 60_000) }] };
            } catch (err) {
                const message = err instanceof ApifyCallError ? err.message : `Report failed: ${String(err?.message ?? err).slice(0, 300)}`;
                return { isError: true, content: [{ type: 'text', text: message }] };
            }
        });
    }
    for (const tool of TOOLS) {
        if (!wanted(tool.name)) continue;
        server.registerTool(tool.name, {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.shape,
            annotations: { readOnlyHint: !['monitor_page_changes', 'monitor_pay_transparency'].includes(tool.name), destructiveHint: false, idempotentHint: tool.name !== 'monitor_page_changes', openWorldHint: true },
        }, async (args) => {
            try {
                const bad = tool.validate?.(args, env);
                if (bad) return { isError: true, content: [{ type: 'text', text: bad }] };
                const cap = args.maxCostUsd ? Math.min(Math.max(args.maxCostUsd, MIN_CAP_USD), 5) : defaultCapUsd(tool, args);
                const { items, runId } = await runActorSync({ token: getToken(), actorOwner: ACTOR_OWNER, actor: tool.actor, input: tool.buildInput(args, env), maxTotalChargeUsd: cap, fetchImpl });
                const { text } = formatResult({ tool, items, runId, capUsd: cap });
                await onToolSuccess?.(tool);
                return { content: [{ type: 'text', text }] };
            } catch (err) {
                const message = err instanceof ApifyCallError ? err.message : `Tool failed: ${String(err?.message ?? err).slice(0, 300)}`;
                return { isError: true, content: [{ type: 'text', text: message }] };
            }
        });
    }
    return server;
}
export { z };
