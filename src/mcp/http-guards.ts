/**
 * Pure helpers for the HTTP (`serve`) transport guards.
 *
 * Kept side-effect free (no express dependency) so the matching semantics can
 * be reasoned about and unit-checked in isolation. The wiring lives in
 * `src/mcp/http.ts`.
 */

/** Trim + lowercase a Host/Origin value for comparison. */
export function normalizeGuardValue(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Strip the port from a Host header value, keeping IPv6 brackets intact:
 * "example.com:4319" -> "example.com", "[::1]:4319" -> "[::1]".
 * Returns the lowercased host without the port.
 */
export function stripHostPort(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end === -1 ? h : h.slice(0, end + 1);
  }
  const colon = h.lastIndexOf(":");
  if (colon !== -1 && /^\d+$/.test(h.slice(colon + 1))) {
    return h.slice(0, colon);
  }
  return h;
}

/**
 * DNS-rebinding guard. Empty allowlist = allow everything (default, preserves
 * plain-localhost behaviour). Otherwise the request Host header must match an
 * entry either exactly (host:port, as browsers send it) or by hostname only,
 * so `example.com` also matches `example.com:4319`.
 */
export function isHostAllowed(
  hostHeader: string | string[] | undefined,
  allowedHosts: string[],
): boolean {
  if (allowedHosts.length === 0) return true;
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!raw || !raw.trim()) return false;
  const host = normalizeGuardValue(raw);
  const hostNoPort = stripHostPort(host);
  return allowedHosts.some((entry) => {
    const e = normalizeGuardValue(entry);
    return e === host || stripHostPort(e) === hostNoPort;
  });
}

/**
 * Browser-origin guard. Empty allowlist = allow everything. Requests WITHOUT
 * an Origin header (native MCP clients — Claude Desktop, curl, the SDK) are
 * always allowed; only browser-issued cross-origin requests are filtered.
 * Comparison is case-insensitive on the whole origin string.
 */
export function isOriginAllowed(
  origin: string | string[] | undefined,
  allowedOrigins: string[],
): boolean {
  if (allowedOrigins.length === 0) return true;
  const raw = Array.isArray(origin) ? origin[0] : origin;
  if (!raw || !raw.trim()) return true;
  const o = normalizeGuardValue(raw);
  return allowedOrigins.some((entry) => normalizeGuardValue(entry) === o);
}
