# AI Visibility MCP Server

**Ask your AI assistant: "Can ChatGPT and other AI tools find and understand my website?"** Connect this server to ChatGPT, Claude, Cursor or any MCP client. One call returns a plain-English AI visibility report with a 0-100 readiness score and the fixes that matter most.

## What the report checks

| Check | What it tells you |
|---|---|
| AI crawler access | Whether ChatGPT search, Claude, Perplexity, Apple and Google crawlers may read your site (robots.txt, noindex, firewall signals) |
| Structured data and page basics | JSON-LD, title, description, canonical, Open Graph, llms.txt |
| Mobile speed | Google PageSpeed performance score and top fixes (included, no Google key needed) |
| Accessibility | WCAG A/AA problems in the static HTML |
| Tech stack | CMS, frameworks, analytics and CDN (context for the fixes) |
| Real AI answers (optional) | Whether ChatGPT / Perplexity actually name your brand, using your own AI key |

## Tools

| Tool | Use it for |
|---|---|
| `ai_visibility_report` | The one-call report for a site. Start here. |
| `audit_ai_crawler_access` | Detail on each AI crawler |
| `audit_schema_ai_readiness` | Detail on structured data per page |
| `check_ai_search_visibility` | Ask ChatGPT / Perplexity buyer questions and measure brand mentions (your own AI key) |
| `audit_pagespeed` | PageSpeed for many URLs (your free Google key) |
| `audit_accessibility` | WCAG checks for many URLs |
| `detect_tech_stack` | Tech stack for many sites |

## Connect it

**ChatGPT** (web, Developer mode on; full support on Business/Enterprise, read-only tools on Pro): open Plugins (or Settings → Apps & Connectors), choose **Add custom MCP server** / Create, and enter:
- Server URL: `https://mcp.apify.com?tools=steadfeed/ai-visibility-mcp`
- Authentication: **OAuth** (no client ID or secret needed)

Sign in to Apify when asked, then type `@` in a chat, pick the connector and ask: *"Give me an AI visibility report for example.com."*

**Claude** (claude.ai or Claude Desktop, any plan; Free allows one custom connector): Customize → Connectors → Add → Add custom connector. Name it "AI Visibility", URL `https://mcp.apify.com?tools=steadfeed/ai-visibility-mcp`, keep the detected sign-in settings, then sign in to Apify.

**Cursor** (Settings → MCP → Add new MCP server, or `~/.cursor/mcp.json`), **VS Code, Claude Code and other clients that accept headers** can connect directly with an Apify API token from [Console → Settings → API & Integrations](https://console.apify.com/settings/integrations):

```json
{ "mcpServers": { "ai-visibility": { "url": "https://steadfeed--ai-visibility-mcp.apify.actor/mcp", "headers": { "Authorization": "Bearer <your Apify API token>" } } } }
```

Or use OAuth instead of a token: `{ "mcpServers": { "ai-visibility": { "url": "https://mcp.apify.com?tools=steadfeed/ai-visibility-mcp" } } }`.

## Example prompts

- "Give me an AI visibility report for example.com and explain the top 3 fixes."
- "Check example.com plus /pricing and /about: can ChatGPT and Perplexity crawlers read them?"
- "Is our structured data good enough for AI search? Check these 3 pages."

Open source (MIT): [steadfeed-dev/steadfeed-site-audit-mcp](https://github.com/steadfeed-dev/steadfeed-site-audit-mcp). The broader [Site Audit MCP Server](https://apify.com/steadfeed/steadfeed-site-audit-mcp) adds page-change and pay-transparency tools.

You need a free Apify account. The free plan's monthly credit covers well over a hundred reports.

## Pricing

Pay per use, billed to your Apify account. No subscription.

| What | Price |
|---|---|
| Full AI visibility report | $0.01 for the report, plus the checks it runs (about $0.015 for a homepage), so about $0.025-0.03 all-in |
| Each single-purpose tool call | $0.001 plus the checked pages at the underlying tool's price ($0.002-$0.005 per page) |
| Real AI answers (optional) | $0.01 per analysed answer, plus your AI provider's own cost (about $0.0002-$0.002) |

## Good to know

- If fewer than 2 of the 4 core checks can run (for example, the site blocks automated checkers), the report is labeled "limited result" and the $0.01 report fee is not charged.
- Only public pages are checked. Nothing is stored beyond your own Apify run.
- Optional API keys (OpenAI, Perplexity, Google) are passed to Apify as secret input, used only for that call, and never returned.
- The report measures whether AI systems can reach and understand your site. It does not guarantee rankings or AI citations.
