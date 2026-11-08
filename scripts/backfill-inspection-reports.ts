import { db } from "../lib/db";
import { buildInspectionReport } from "../lib/reports";

async function main() {
const inspections = await db.inspection.findMany({
  where: { status: "reviewed", report: { is: null } },
  include: { media: true },
  orderBy: { reviewedAt: "asc" },
});

let created = 0;
for (const inspection of inspections) {
  const author = await db.user.findUnique({ where: { id: inspection.authorId } });
  const raw = await buildInspectionReport(
    inspection.projectId,
    inspection.id,
    author?.name || "Site engineer",
  );
  const content = Object.fromEntries(
    Object.entries(raw).filter(([key]) => key !== "_records"),
  );
  const evidenceIds = [
    ...new Set(raw.claims.flatMap((claim) => claim.evidenceIds)),
  ];
  await db.report.upsert({
    where: { inspectionId: inspection.id },
    update: {},
    create: {
      projectId: inspection.projectId,
      inspectionId: inspection.id,
      title: `${inspection.title} · Inspection report`,
      type: "daily",
      authorId: inspection.authorId,
      createdAt: inspection.reviewedAt || inspection.uploadedAt,
      versions: {
        create: {
          number: 1,
          status: "draft",
          content: JSON.stringify(content),
          model: "deterministic-inspection-template-v1",
          promptVersion: "inspection-report-v1",
          sourceRecordVersions: JSON.stringify(raw.sourceRecordVersions),
          evidenceLinks: {
            create: evidenceIds.map((mediaId) => ({ mediaId })),
          },
        },
      },
    },
  });
  created += 1;
}

console.log(`Created ${created} missing inspection report drafts.`);
}

main().finally(() => db.$disconnect());
