// Per-process defence for the academic MVP. Put a shared limiter at the ingress when scaling.
const attempts = new Map<string, { count: number; until: number }>();
export function loginAllowed(key: string) {
  const now = Date.now();
  if (attempts.size > 10000)
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  let item = attempts.get(key);
  if (!item || item.until < now) {
    item = { count: 0, until: now + 60000 };
    attempts.set(key, item);
  }
  item.count++;
  return item.count <= 20;
}
