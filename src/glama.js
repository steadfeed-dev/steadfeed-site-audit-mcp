// Public ownership document for Glama connector claims.
// Served unauthenticated at /mcp/.well-known/glama.json and /.well-known/glama.json.
// Legacy email format is still accepted by https://glama.ai/mcp/schemas/connector.json
// (new claims prefer an opaque glama_claim_ token from the Glama claim panel).
export const GLAMA_CONNECTOR_CLAIM = {
    $schema: 'https://glama.ai/mcp/schemas/connector.json',
    maintainers: [{ email: 'hello@getsteadfeed.com' }],
};

const CLAIM_PATHS = new Set([
    '/mcp/.well-known/glama.json',
    '/mcp/.well-known/glama.json/',
    '/.well-known/glama.json',
    '/.well-known/glama.json/',
]);

/**
 * Serve the Glama connector-claim JSON if this request is for a claim path.
 * @param {string} path pathname only
 * @param {string} method
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true if the response was handled
 */
export function serveGlamaJsonIfRequested(path, method, res) {
    if (!CLAIM_PATHS.has(path)) return false;
    if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain' }).end('Method not allowed');
        return true;
    }
    const body = `${JSON.stringify(GLAMA_CONNECTOR_CLAIM)}\n`;
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'content-length': Buffer.byteLength(body),
    };
    res.writeHead(200, headers);
    if (method === 'HEAD') res.end();
    else res.end(body);
    return true;
}
