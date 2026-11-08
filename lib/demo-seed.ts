import { db } from "./db";
import { hash } from "bcryptjs";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import {
  fixtureDetections,
  fixtureFindings,
  fixtureModel,
  siteSvg,
} from "./fixture";
export async function seedDemo() {
  if (process.env.APP_MODE !== "demo")
    throw new Error("Fixture seed is restricted to APP_MODE=demo");
  const passwordHash = await hash("SiteSight2026!", 12);
  for (const [role, name] of [
    ["admin", "Alex Morgan"],
    ["engineer", "Priya Shah"],
    ["safety", "James Chen"],
    ["viewer", "Taylor Brooks"],
  ])
    await db.user.upsert({
      where: { id: role },
      update: { email: `${role}@sitesight.local`, name, passwordHash },
      create: {
        id: role,
        email: `${role}@sitesight.local`,
        name,
        passwordHash,
      },
    });
  if (await db.project.findUnique({ where: { id: "riverside" } })) {
    console.log(
      "Sample project already seeded; use in-app restore to reset it.",
    );
    return;
  }
  await db.project.create({
    data: {
      id: "riverside",
      name: "Riverside Heights",
      description:
        "A 12-storey residential development with two podium levels and landscaped public space.",
      location: "Bengaluru, Karnataka",
      startDate: new Date("2026-06-01"),
      targetDate: new Date("2027-03-31"),
      memberships: {
        create: ["admin", "engineer", "safety", "viewer"].map((role) => ({
          userId: role,
          role,
        })),
      },
    },
  });
  await db.project.upsert({
    where: { id: "restricted" },
    update: {},
    create: {
      id: "restricted",
      name: "Private validation project",
      description: "Cross-project isolation test",
      location: "Bengaluru",
      startDate: new Date("2026-06-01"),
      targetDate: new Date("2027-03-31"),
      memberships: { create: { userId: "engineer", role: "admin" } },
    },
  });
  for (const [id, name] of [
    ["zone-a", "Zone A · East wing"],
    ["zone-b", "Zone B · West wing"],
    ["zone-c", "Zone C · Podium"],
  ])
    await db.zone.create({ data: { id, name, projectId: "riverside" } });
  const milestones = [
    [
      "foundation",
      "Foundation & substructure",
      "zone-a",
      25,
      100,
      "2026-06-01",
      "2026-08-30",
    ],
    [
      "structure",
      "Structural framework",
      "zone-b",
      35,
      65,
      "2026-07-01",
      "2026-12-15",
    ],
    ["mep", "MEP rough-in", "zone-a", 25, 35, "2026-09-01", "2027-01-30"],
    [
      "envelope",
      "Building envelope",
      "zone-c",
      15,
      15,
      "2026-09-15",
      "2027-03-01",
    ],
  ] as const;
  for (const [
    id,
    name,
    zoneId,
    weight,
    completion,
    startDate,
    targetDate,
  ] of milestones)
    await db.milestone.create({
      data: {
        id,
        name,
        zoneId,
        weight,
        completion,
        startDate: new Date(startDate),
        targetDate: new Date(targetDate),
        projectId: "riverside",
      },
    });
  await mkdir("data/media", { recursive: true });
  for (let n = 0; n < 6; n++) {
    const id = `INS-${String(1041 + n).padStart(4, "0")}`,
      mediaId = `evidence-${n}`,
      date = new Date(
        `2026-10-${String(17 + n * 2).padStart(2, "0")}T09:30:00+05:30`,
      );
    const key = `fixture-${n}.jpg`;
    await writeFile(
      "data/media/" + key,
      await sharp(Buffer.from(siteSvg(n % 2)))
        .jpeg({ quality: 90 })
        .toBuffer(),
    );
    await db.inspection.create({
      data: {
        id,
        projectId: "riverside",
        zoneId: n % 3 === 0 ? "zone-a" : "zone-b",
        title: [
          "East wing · Level 03 walkthrough",
          "West wing · Slab preparation",
          "West wing · Reinforcement check",
          "East wing · MEP installation",
          "West wing · Concrete works",
          "West wing · Morning inspection",
        ][n],
        captureTime: date,
        uploadedAt: date,
        viewpoint: n === 1 ? "West elevation" : "East elevation",
        notes:
          "Scheduled site walkthrough. Review the visible work and PPE observations before using them in reports.",
        authorId: "engineer",
        status: n === 5 ? "ready" : "reviewed",
        humanObservation:
          n === 5
            ? ""
            : "Inspector reviewed the sampled evidence and recorded no additional observation beyond the visible work area.",
        reviewedAt: n === 5 ? null : date,
        media: {
          create: {
            id: mediaId,
            key,
            mime: "image/jpeg",
            width: 1200,
            height: 760,
            fixture: true,
            metadata: JSON.stringify({
              attribution: "Original SiteSight synthetic illustration · CC0",
              viewpoint: n === 1 ? "West elevation" : "East elevation",
            }),
          },
        },
        job: {
          create: {
            status: "ready",
            attempts: 1,
            model: fixtureModel.name,
            version: "1.0",
          },
        },
      },
    });
    for (const d of fixtureDetections(mediaId))
      await db.detection.create({
        data: {
          ...d,
          box: JSON.stringify(d.box),
          mediaId,
          model: fixtureModel.name,
          version: "1.0",
        },
      });
    for (const f of fixtureFindings(mediaId, id))
      await db.finding.create({
        data: {
          ...f,
          createdAt: date,
          decisions:
            n === 5
              ? undefined
              : {
                  create: {
                    authorId: "safety",
                    action: f.assessment === "unknown" ? "reject" : "confirm",
                    previous: JSON.stringify({ verification: "proposed" }),
                    comment:
                      f.assessment === "unknown"
                        ? "Insufficient visibility to assess PPE."
                        : "Reviewed against labelled synthetic inspection evidence.",
                    createdAt: date,
                  },
                },
          verification:
            n === 5
              ? "proposed"
              : f.assessment === "unknown"
                ? "rejected"
                : "confirmed",
          resolution:
            n === 0 && f.assessment === "missing" ? "resolved" : "open",
          assignedTo: f.assessment === "missing" ? "safety" : null,
          notes: n === 0 ? "Follow-up observation recorded by James Chen." : "",
        },
      });
    await db.auditEvent.create({
      data: {
        projectId: "riverside",
        actorId: "engineer",
        action: n === 5 ? "Inspection submitted" : "Inspection reviewed",
        entityId: id,
        previous: "{}",
        next: JSON.stringify({ status: n === 5 ? "ready" : "reviewed" }),
        createdAt: date,
      },
    });
    if (n !== 5) {
      const detections = fixtureDetections(mediaId);
      const classCount = (name: string) =>
        detections.filter((detection) => detection.class === name).length;
      const findings = fixtureFindings(mediaId, id);
      const potentialViolations = findings.filter(
        (finding) => finding.assessment === "missing",
      ).length;
      const unableToAssess = findings.filter(
        (finding) => finding.assessment === "unknown",
      ).length;
      const approved = n < 4;
      await db.report.create({
        data: {
          id: `report-${id}`,
          projectId: "riverside",
          inspectionId: id,
          title: `${
            [
              "East wing · Level 03 walkthrough",
              "West wing · Slab preparation",
              "West wing · Reinforcement check",
              "East wing · MEP installation",
              "West wing · Concrete works",
            ][n]
          } · Inspection report`,
          type: "daily",
          authorId: "engineer",
          createdAt: date,
          versions: {
            create: {
              number: 1,
              status: approved ? "approved" : "draft",
              createdAt: date,
              content: JSON.stringify({
                period: date.toISOString().slice(0, 10),
                author: "Priya Shah",
                claims: [
                  {
                    text: `The fixture detector recorded ${detections.length} objects: ${classCount("worker")} workers, ${classCount("helmet")} helmets and ${classCount("vest")} safety vests. It produced ${potentialViolations} potential PPE violation observations and ${unableToAssess} unable-to-assess observations.`,
                    type: "verified",
                    evidenceIds: [mediaId],
                    sourceRecordIds: [`inspection-summary:${id}`],
                    verification: "verified",
                    limitations:
                      "Labelled fixture evidence; no continuous site coverage.",
                    numericFacts: [],
                  },
                ],
                reviewContext: {
                  proposed: [],
                  unknown: [],
                  recommendations: [],
                },
                progress: [],
                findings: [],
                inspectionSummary: {
                  inspectionId: id,
                  title: [
                    "East wing · Level 03 walkthrough",
                    "West wing · Slab preparation",
                    "West wing · Reinforcement check",
                    "East wing · MEP installation",
                    "West wing · Concrete works",
                  ][n],
                  zone:
                    n % 3 === 0 ? "Zone A · East wing" : "Zone B · West wing",
                  captureTime: date.toISOString(),
                  evidenceCount: 1,
                  detectionCount: detections.length,
                  classCounts: {
                    worker: classCount("worker"),
                    helmet: classCount("helmet"),
                    vest: classCount("vest"),
                  },
                  potentialViolations,
                  unableToAssess,
                  humanObservation:
                    "Inspector reviewed the sampled evidence and recorded no additional observation beyond the visible work area.",
                  modelNotice:
                    "Counts describe labelled fixture output and do not prove a site-wide condition.",
                },
                limitations: [
                  "Labelled synthetic fixture evidence.",
                  "Visible work does not certify engineering quality or completion.",
                ],
                followUp: ["No additional human observation was recorded."],
                sourceRecordVersions: [
                  {
                    id: `inspection-summary:${id}`,
                    kind: "inspection-summary",
                    version: date.toISOString(),
                  },
                ],
              }),
              model: "SiteSight illustrated fixture",
              promptVersion: "inspection-report-v1",
              sourceRecordVersions: JSON.stringify([
                {
                  id: `inspection-summary:${id}`,
                  kind: "inspection-summary",
                  version: date.toISOString(),
                },
              ]),
              approvedBy: approved ? "admin" : null,
              approvedAt: approved ? date : null,
              evidenceLinks: { create: { mediaId } },
            },
          },
        },
      });
    }
  }
  for (const [id, , , , completion] of milestones)
    await db.progressUpdate.create({
      data: {
        milestoneId: id,
        previous: Math.max(0, completion - 10),
        completion,
        reason:
          "Engineer-verified work records and visible inspection evidence. Percentage is an engineering assessment, not an image measurement.",
        authorId: "engineer",
        mediaId: "evidence-4",
        createdAt: new Date("2026-10-25"),
      },
    });
  await db.notification.create({
    data: {
      projectId: "riverside",
      message:
        "Morning inspection is ready: 4 observations await verification.",
    },
  });
  console.log(
    "Seeded Riverside Heights. Sample accounts: admin, engineer, safety, viewer @sitesight.local / SiteSight2026!",
  );
}
