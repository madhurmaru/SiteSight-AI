export type Role = "admin" | "engineer" | "safety" | "viewer";
export const permissions: Record<string, Role[]> = {
  configure: ["admin"],
  upload: ["admin", "engineer"],
  progress: ["admin", "engineer"],
  review: ["admin", "safety"],
  daily: ["admin", "engineer"],
  safety: ["admin", "safety"],
  read: ["admin", "engineer", "safety", "viewer"],
};
export function allowed(role: string, action: string) {
  return permissions[action]?.includes(role as Role) ?? false;
}
export function progress(items: { weight: number; completion: number }[]) {
  const total = items.reduce((n, m) => n + m.weight, 0);
  return total > 0
    ? items.reduce((n, m) => n + m.weight * m.completion, 0) / total
    : null;
}
export function planned(
  m: { startDate: Date | string; targetDate: Date | string },
  at = new Date(),
) {
  const span = +new Date(m.targetDate) - +new Date(m.startDate);
  return span > 0
    ? Math.max(0, Math.min(100, ((+at - +new Date(m.startDate)) / span) * 100))
    : null;
}
export function compliance(
  findings: {
    verification: string;
    assessment: string;
    workerId: string | null;
    mediaId: string;
  }[],
) {
  const groups = new Map<string, typeof findings>();
  for (const f of findings) {
    const k = f.mediaId + ":" + f.workerId;
    groups.set(k, [...(groups.get(k) || []), f]);
  }
  let present = 0,
    assessable = 0,
    unknown = 0;
  for (const fs of groups.values()) {
    if (
      fs.some(
        (f) =>
          !f.workerId ||
          f.assessment === "unknown" ||
          f.verification === "proposed" ||
          f.verification === "rejected",
      )
    ) {
      unknown++;
      continue;
    }
    assessable++;
    if (fs.every((f) => f.assessment === "present")) present++;
  }
  return {
    present,
    assessable,
    unknown,
    percent: assessable ? Math.round((present / assessable) * 100) : null,
  };
}
export function validateCitations(
  claims: { evidenceIds: string[] }[],
  authorised: string[],
) {
  const ids = new Set(authorised);
  if (
    claims.some(
      (c) => !c.evidenceIds.length || c.evidenceIds.some((id) => !ids.has(id)),
    )
  )
    throw new Error("Invalid or missing evidence citation");
}
export function assertVersionMutable(status: string) {
  if (status === "approved")
    throw new Error("Approved versions are immutable. Create a new version.");
}
export function resolutionAllowed(
  verification: string,
  resolution: string,
  evidence: string,
) {
  if (verification !== "confirmed")
    throw new Error("Only confirmed findings can change resolution");
  if (resolution === "resolved" && !evidence.trim())
    throw new Error("Resolution evidence or a follow-up reference is required");
}
