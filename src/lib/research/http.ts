/** Next.js may expose an internal hostname in request.url; Host is the browser-facing authority. */
export function isSameOriginRequest(request: Request): boolean {
 const origin = request.headers.get('origin');
 if (!origin) return true; // Non-browser server clients do not send Origin.
 try {
 const parsed = new URL(origin);
 const host = request.headers.get('host') ?? new URL(request.url).host;
 const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ?? new URL(request.url).protocol.slice(0,-1);
 return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin && parsed.origin === `${protocol}://${host}`;
 } catch { return false; }
}
