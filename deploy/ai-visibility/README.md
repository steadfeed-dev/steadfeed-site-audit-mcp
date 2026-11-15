# AI Visibility MCP Server

**Ask your AI assistant: "Can ChatGPT and other AI tools find and understand my website?"** Connect this server to ChatGPT, Claude, Cursor or any MCP client. One call returns a plain-English AI visibility report with a 0-100 readiness score and the fixes that matter most.

## What the report checks

| Check | What it tells you |
|---|---|
| AI crawler access | Whether ChatGPT search, Claude, Perplexity, Apple and Google crawlers may read your site (robots.txt, noindex, firewall signals) |
| Structured data and page basics | JSON-LD, title, description, canonical, Open Graph, llms.txt |
| Mobile speed | Google PageSpeed performance score and top fixes |
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

**ChatGPT** (Plus/Pro/Business with Developer mode on): Settings → Apps & Connectors → Create. Server URL `https://mcp.apify.com?tools=steadfeed/ai-visibility-mcp`, authentication **OAuth**. Sign in to Apify when asked.

**Claude** (claude.ai or Claude Desktop): Settings → Connectors → Add custom connector. URL `https://mcp.apify.com?tools=steadfeed/ai-visibility-mcp`. Sign in to Apify when asked.

**Cursor, VS Code, Claude Code and other clients that accept headers:** you can also connect directly:

```json
{ "mcpServers": { "ai-visibility": { "url": "https://steadfeed--ai-visibility-mcp.apify.actor/mcp", "headers": { "Authorization": "Bearer <your Apify API token>" } } } }
```

You need a free Apify account. The free plan's monthly credit covers well over a hundred reports.

## Pricing

Pay per use, billed to your Apify account. No subscription.

| What | Price |
|---|---|
| Full AI visibility report (homepage) | about $0.03 all-in |
| Each single-purpose tool call | $0.001 plus the checked pages at the underlying tool's price ($0.002-$0.005 per page) |
| Real AI answers (optional) | $0.01 per analysed answer, plus your AI provider's own cost (about $0.0002-$0.002) |

## Good to know

- Only public pages are checked. Nothing is stored beyond your own Apify run.
- Optional API keys (OpenAI, Perplexity, Google) are passed to Apify as secret input, used only for that call, and never returned.
- The report measures whether AI systems can reach and understand your site. It does not guarantee rankings or AI citations.
