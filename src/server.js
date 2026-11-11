import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOLS, ACTOR_OWNER, defaultCapUsd, MIN_CAP_USD } from './tools.js';
import { runActorSync, formatResult, ApifyCallError } from './apify.js';

export const SERVER_INFO = { name: 'site-audit', version: '0.2.2' };

/**
 * @param {{getToken:()=>string|undefined, env?:object, onToolSuccess?:(tool:object)=>Promise<void>, fetchImpl?:typeof fetch}} opts
 */
export function createServer({ getToken, env = {}, onToolSuccess, fetchImpl }) {
    const server = new McpServer(SERVER_INFO, {
        instructions: 'Site Audit MCP: run website-audit tools (schema/AI-readiness, accessibility, tech stack, PageSpeed, AI-crawler access, page change monitoring, pay-transparency posting monitor). Each call runs a public Apify Actor on the caller\'s own Apify account and is billed there. Pass dryRun:true to preview without cost. Only public pages are checked.',
    });
    for (const tool of TOOLS) {
        server.registerTool(tool.name, {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.shape,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: tool.name !== 'monitor_page_changes', openWorldHint: true },
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
