export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSeconds);
  const bucketKey = `${key}:${bucket}`;
  const windowEnd = (bucket + 1) * windowSeconds;
  await db.prepare('DELETE FROM rate_limits WHERE window_end <= ?').bind(now).run();

  const result = await db
    .prepare(
      'INSERT INTO rate_limits (key, count, window_end) VALUES (?, 1, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count'
    )
    .bind(bucketKey, windowEnd)
    .first<{ count: number }>();

  return (result?.count ?? 1) <= maxRequests;
}

// Daily, keyed pseudonyms prevent storing raw IPs in our application database.
export async function privateRateKey(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${Math.floor(Date.now() / 86400000)}:${ip}`));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
