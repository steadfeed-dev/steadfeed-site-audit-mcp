# Pricing (Site Audit MCP Server)

Pay-per-event, set via the Apify API (not via the repo):

| Event | Price | Notes |
|---|---|---|
| `apify-actor-start` | $0.00005 | Same as the underlying Actors |
| `tool-call` | $0.001 | Charged once per successful tool call (errors free) |

Reasoning: the wrapper adds convenience, not compute. The real work is billed at the underlying Actor's existing price ($0.002-$0.005/unit) on the caller's own account, so the wrapper fee is deliberately half of our cheapest per-unit price and is dropped entirely for users who run the open-source package locally.

Note: the `monitor_pay_transparency` tool runs the underlying Actor at $0.02 per posting check on the caller's own account.
