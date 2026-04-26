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

  // Lazy expiry cleanup — fire and forget
  db.prepare('DELETE FROM rate_limits WHERE window_end < ?').bind(now).run().catch(() => {});

  await db
    .prepare(
      'INSERT INTO rate_limits (key, count, window_end) VALUES (?, 1, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET count = count + 1'
    )
    .bind(bucketKey, windowEnd)
    .run();

  const result = await db
    .prepare('SELECT count FROM rate_limits WHERE key = ?')
    .bind(bucketKey)
    .first<{ count: number }>();

  return (result?.count ?? 1) <= maxRequests;
}
