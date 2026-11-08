import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { loginAllowed } from "@/lib/rate-limit";
import { bodyJson, bodyForm } from "@/lib/request-body";
import { db, demo } from "@/lib/db";
import { access, currentUser, createSession, HttpError } from "@/lib/auth";
import { putMedia, readMedia, mediaUrl } from "@/lib/storage";
import { validateUploadCount } from "@/lib/validation";
import { resolutionAllowed, assertVersionMutable } from "@/lib/domain";
import {
  buildReport,
  buildInspectionReport,
  buildProviderReport,
  generalProvider,
  naturalRecordFallback,
  needsProjectRecords,
  providerDeclinesRecordAccess,
  providerStatus,
  publicAnswer,
  retrieveInspectionQuestion,
  retrieveQuestion,
  retrieveWorkspaceQuestion,
  structuredProvider,
} from "@/lib/reports";
import { probeVideo } from "@/lib/video";
import { siteSvg } from "@/lib/fixture";
import { renderReport } from "@/lib/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });
async function audit(
  projectId: string,
  actorId: string,
  action: string,
  entityId: string,
  previous: unknown,
  next: unknown,
) {
  return db.auditEvent.create({
    data: {
      projectId,
      actorId,
      action,
      entityId,
      previous: JSON.stringify(previous),
      next: JSON.stringify(next),
    },
  });
}
async function handler(req: NextRequest, ctx: Context) {
  try {
    const p = (await ctx.params).path;
    const method = req.method;
    if (method !== "GET") {
      const origin = req.headers.get("origin");
      const expectedOrigin =
        process.env.APP_ORIGIN ||
        `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      if (origin && origin !== expectedOrigin)
        throw new HttpError(403, "Invalid request origin");
    }
    if (p[0] === "mode" && method === "GET")
      return json({ mode: demo ? "demo" : "connected" });
    if (p[0] === "auth" && method === "POST") {
      const body = await bodyJson(req);
      if (p[1] === "logout") {
        const token = (await cookies()).get("sitesight_session")?.value;
        if (token)
          await db.session.deleteMany({
            where: { id: createHash("sha256").update(token).digest("hex") },
          });
        (await cookies()).delete("sitesight_session");
        return json({ ok: true });
      }
      const input = z
        .object({ email: z.email(), password: z.string().min(1).max(128) })
        .parse(body);
      if (!loginAllowed(input.email.toLowerCase()))
        throw new HttpError(
          429,
          "Too many sign-in attempts. Try again in one minute.",
        );
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !(await compare(input.password, user.passwordHash)))
        throw new HttpError(401, "Email or password is incorrect");
      await createSession(user.id);
      return json({ ok: true });
    }
    const user = await currentUser();
    if (p[0] === "session")
      return json({
        user: { id: user.id, name: user.name, email: user.email },
        mode: demo ? "demo" : "connected",
        projects: await db.project.findMany({
          where: { memberships: { some: { userId: user.id } } },
          include: {
            memberships: { where: { userId: user.id }, select: { role: true } },
          },
        }),
      });
    if (p[0] === "ask" && p[1] === "records" && method === "GET") {
      if (p[2] !== "workspace-summary" || p[3] !== "workspace")
        throw new HttpError(404, "Record not found");
      const retrieval = await retrieveWorkspaceQuestion(user.id);
      const record = retrieval.records[0];
      return json({
        kind: record.kind,
        id: "workspace",
        text: record.text,
        numericFacts: record.numericFacts,
        limitations: retrieval.limitations,
      });
    }
    if (p[0] === "ask" && method === "POST") {
      const b = z
        .object({
          question: z.string().trim().min(1).max(1000),
          useProvider: z.boolean().optional(),
          scope: z.enum(["general", "workspace"]).optional(),
        })
        .parse(await bodyJson(req));
      if (b.scope === "general") {
        if (!b.useProvider)
          return json({
            message:
              "Hello! I’m SiteSight AI. Enable the configured model provider for general questions, or select a project scope for evidence-grounded answers.",
            claims: [],
            limitations:
              "Local greeting; no model or project records were used.",
            provider: "Local greeting",
          });
        const out = await generalProvider(b.question);
        return json({
          message: out.message,
          claims: [],
          limitations:
            "General model answer; it is not based on SiteSight project records.",
          provider: `${providerStatus().provider} · ${out.model}`,
        });
      }
      const retrieval = await retrieveWorkspaceQuestion(user.id);
      if (b.useProvider) {
        const out = await structuredProvider(retrieval.records, b.question, []);
        retrieval.claims = out.claims;
        retrieval.provider = `${providerStatus().provider} · ${out.model} · requires human review`;
      }
      return json(publicAnswer(null, retrieval));
    }
    if (p[0] === "media") {
      const media = await db.media.findUnique({
        where: { id: p[1] },
        include: { inspection: true },
      });
      if (!media) throw new HttpError(404, "Evidence not found");
      const { role } = await access(media.inspection.projectId);
      if (
        role === "viewer" &&
        !(await db.evidenceLink.findFirst({
          where: { mediaId: media.id, reportVersion: { status: "approved" } },
        }))
      )
        throw new HttpError(403, "Evidence is not part of an approved report");
      if (!demo) return NextResponse.redirect(await mediaUrl(media.key, true));
      return new NextResponse(new Uint8Array(await readMedia(media.key)), {
        headers: {
          "Content-Type": media.mime,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (p[0] === "projects" && p.length === 1 && method === "POST") {
      const input = z
        .object({
          name: z.string().min(3),
          description: z.string(),
          location: z.string().min(2),
          startDate: z.coerce.date(),
          targetDate: z.coerce.date(),
        })
        .parse(await bodyJson(req));
      if (input.targetDate <= input.startDate)
        throw new HttpError(400, "Target date must follow start date");
      const project = await db.project.create({
        data: {
          ...input,
          memberships: { create: { userId: user.id, role: "admin" } },
          zones: { create: { name: "Zone A" } },
        },
      });
      return json(project);
    }
    if (p[0] !== "projects" || !p[1]) throw new HttpError(404, "Not found");
    const projectId = p[1];
    const { role } = await access(projectId);
    const section = p[2];
    if (!section && method === "GET") {
      const project = await db.project.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          zones: true,
          milestones: {
            include: {
              zone: true,
              updates: {
                orderBy: { createdAt: "desc" },
                include: { media: { select: { inspectionId: true } } },
              },
            },
          },
          memberships: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
      const reports = await db.report.findMany({
        where: { projectId },
        include: {
          versions: {
            where: role === "viewer" ? { status: "approved" } : {},
            orderBy: { number: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });
      if (role === "viewer")
        return json({
          project: { ...project, milestones: [], memberships: [] },
          role,
          reports: reports.filter((r) => r.versions.length),
          inspections: [],
          findings: [],
          audits: [],
          notifications: [],
        });
      const inspections = await db.inspection.findMany({
        where: { projectId },
        include: {
          zone: true,
          media: { include: { detections: true } },
          findings: { include: { decisions: true } },
          job: true,
        },
        orderBy: { captureTime: "desc" },
      });
      return json({
        project,
        role,
        inspections,
        findings: inspections.flatMap((i) =>
          i.findings.map((f) => ({
            ...f,
            inspectionTitle: i.title,
            zone: i.zone.name,
            captureTime: i.captureTime,
          })),
        ),
        reports,
        audits: await db.auditEvent.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        notifications: await db.notification.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      });
    }
    if (!section && method === "PATCH") {
      await access(projectId, "configure");
      const input = z
        .object({
          name: z.string().min(3),
          description: z.string(),
          location: z.string(),
          status: z.enum(["active", "on hold", "completed"]),
          startDate: z.coerce.date(),
          targetDate: z.coerce.date(),
        })
        .parse(await bodyJson(req));
      if (input.targetDate <= input.startDate)
        throw new HttpError(400, "Invalid project dates");
      const before = await db.project.findUnique({ where: { id: projectId } });
      const updated = await db.project.update({
        where: { id: projectId },
        data: input,
      });
      await audit(
        projectId,
        user.id,
        "Project updated",
        projectId,
        before,
        input,
      );
      return json(updated);
    }

    if (section === "reset" && method === "POST") {
      await access(projectId, "configure");
      if (!demo || projectId !== "riverside")
        throw new HttpError(
          403,
          "Only the fictional sample project can be restored",
        );
      if (
        await db.analysisJob.count({
          where: {
            inspection: { projectId },
            status: {
              in: [
                "queued",
                "retrying",
                "preprocessing",
                "detection",
                "finding generation",
              ],
            },
          },
        })
      )
        throw new HttpError(
          409,
          "Wait for active analysis jobs to finish or cancel them before restoring the sample project.",
        );
      await db.$transaction(async (tx) => {
        await tx.report.deleteMany({ where: { projectId } });
        await tx.progressUpdate.deleteMany({
          where: { milestone: { projectId } },
        });
        await tx.inspection.deleteMany({ where: { projectId } });
        await tx.milestone.deleteMany({ where: { projectId } });
        await tx.zone.deleteMany({ where: { projectId } });
        await tx.project.delete({ where: { id: projectId } });
      });
      const { seedDemo } = await import("@/lib/demo-seed");
      await seedDemo();
      return json({ ok: true });
    }
    if (section === "settings") {
      if (role === "viewer")
        return json({
          mode: demo ? "demo" : "connected",
          access: "Approved records only",
        });
      if (method === "GET") {
        const inferenceAdapter =
          process.env.INFERENCE_ADAPTER || (demo ? "fixture" : "worker");
        let workerHealth: {
          configured?: boolean;
          capabilities?: string[];
          model?: string;
          version?: string;
          provenance?: { license?: string; runtimeLicense?: string };
        } | null = null;
        if (
          inferenceAdapter === "worker" &&
          process.env.INFERENCE_URL &&
          process.env.WORKER_SECRET
        )
          try {
            const response = await fetch(
              process.env.INFERENCE_URL + "/health",
              {
                headers: {
                  Authorization: "Bearer " + process.env.WORKER_SECRET,
                },
                signal: AbortSignal.timeout(3000),
                cache: "no-store",
              },
            );
            if (response.ok) workerHealth = await response.json();
          } catch {}
        return json({
          mode: demo ? "demo" : "connected",
          database: "Connected",
          storage: demo
            ? "Private local storage"
            : process.env.S3_BUCKET
              ? "Configured · not health checked"
              : "Unavailable",
          detector:
            inferenceAdapter === "fixture"
              ? "Deterministic illustrated fixtures"
              : workerHealth?.configured
                ? "Python worker connected · real weights loaded"
                : "Python worker selected · unavailable",
          provider: providerStatus().configured
            ? `${providerStatus().provider} configured · ${providerStatus().model} · availability checked when a question is sent`
            : "Model provider unavailable · deterministic record retrieval is available",
          capabilities:
            inferenceAdapter === "fixture"
              ? ["worker", "helmet", "vest"]
              : workerHealth?.capabilities || [],
          model:
            inferenceAdapter === "fixture"
              ? "SiteSight fixture v1.0"
              : workerHealth
                ? `${workerHealth.model} · ${workerHealth.version}`
                : "Worker health check failed",
          license:
            inferenceAdapter === "fixture"
              ? "Original CC0 synthetic media"
              : workerHealth?.provenance
                ? [
                    workerHealth.provenance.license,
                    workerHealth.provenance.runtimeLicense,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Unavailable from worker",
        });
      }
      await access(projectId, "configure");
      const b = z
        .object({ threshold: z.number().min(0.1).max(0.95) })
        .parse(await bodyJson(req));
      await db.project.update({ where: { id: projectId }, data: b });
      await audit(
        projectId,
        user.id,
        "Analysis threshold changed",
        projectId,
        {},
        b,
      );
      return json({ ok: true });
    }
    if (section === "members" && method === "POST") {
      await access(projectId, "configure");
      const b = z
        .object({
          userId: z.string().optional(),
          email: z.email().optional(),
          role: z.enum(["admin", "engineer", "safety", "viewer"]),
        })
        .refine(
          (v) => v.userId || v.email,
          "Provide a user ID or registered email",
        )
        .parse(await bodyJson(req));
      const target = await db.user.findFirst({
        where: b.userId ? { id: b.userId } : { email: b.email },
      });
      if (!target)
        throw new HttpError(
          400,
          "No account with that email. Provision the account before adding membership.",
        );
      if (target.id === user.id && b.role !== "admin")
        throw new HttpError(400, "You cannot remove your own admin role");
      const previous = await db.membership.findUnique({
        where: { userId_projectId: { userId: target.id, projectId } },
      });
      const member = await db.membership.upsert({
        where: { userId_projectId: { userId: target.id, projectId } },
        update: { role: b.role },
        create: { userId: target.id, projectId, role: b.role },
      });
      await audit(
        projectId,
        user.id,
        previous ? "Role changed" : "Member added",
        member.id,
        previous,
        { userId: target.id, role: b.role },
      );
      return json({ ok: true });
    }
    if (section === "zones" && method === "POST") {
      await access(projectId, "configure");
      const b = z
        .object({ name: z.string().min(2) })
        .parse(await bodyJson(req));
      return json(await db.zone.create({ data: { ...b, projectId } }));
    }
    if (section === "milestones" && method === "POST") {
      await access(projectId, "configure");
      const b = z
        .object({
          name: z.string().min(3),
          zoneId: z.string(),
          weight: z.number().positive().max(100),
          startDate: z.coerce.date(),
          targetDate: z.coerce.date(),
        })
        .parse(await bodyJson(req));
      if (
        b.targetDate <= b.startDate ||
        !(await db.zone.findFirst({ where: { id: b.zoneId, projectId } }))
      )
        throw new HttpError(400, "Invalid zone or milestone dates");
      return json(await db.milestone.create({ data: { ...b, projectId } }));
    }
    if (section === "progress" && method === "POST") {
      await access(projectId, "progress");
      const b = z
        .object({
          milestoneId: z.string(),
          completion: z.number().min(0).max(100),
          mediaId: z.string(),
          reason: z.string().min(10),
        })
        .parse(await bodyJson(req));
      const m = await db.milestone.findFirst({
        where: { id: b.milestoneId, projectId },
      });
      const media = await db.media.findFirst({
        where: { id: b.mediaId, inspection: { projectId } },
      });
      if (!m || !media)
        throw new HttpError(
          400,
          "Milestone and evidence must belong to this project",
        );
      const result = await db.$transaction(async (tx) => {
        const previous = await tx.milestone.findUniqueOrThrow({
          where: { id: m.id },
        });
        await tx.milestone.update({
          where: { id: m.id },
          data: { completion: b.completion },
        });
        const update = await tx.progressUpdate.create({
          data: { ...b, previous: previous.completion, authorId: user.id },
        });
        await tx.auditEvent.create({
          data: {
            projectId,
            actorId: user.id,
            action: "Verified progress updated",
            entityId: m.id,
            previous: JSON.stringify({ completion: previous.completion }),
            next: JSON.stringify(b),
          },
        });
        return update;
      });
      return json(result);
    }
    if (section === "inspections" && method === "POST" && !p[3]) {
      await access(projectId, "upload");
      const form = await bodyForm(req);
      const b = z
        .object({
          title: z.string().min(3),
          zoneId: z.string(),
          captureTime: z.coerce.date(),
          viewpoint: z.string().max(100),
          notes: z.string().max(3000),
        })
        .parse(
          Object.fromEntries(
            ["title", "zoneId", "captureTime", "viewpoint", "notes"].map(
              (k) => [k, form.get(k)],
            ),
          ),
        );
      if (!(await db.zone.findFirst({ where: { id: b.zoneId, projectId } })))
        throw new HttpError(400, "Zone must belong to this project");
      if (+b.captureTime > Date.now() + 300000)
        throw new HttpError(400, "Capture time cannot be in the future");
      const fixture = form.get("fixture") === "true";
      if (fixture && !demo)
        throw new HttpError(400, "Fixtures are disabled in connected mode");
      const files = form
        .getAll("files")
        .filter((f) => f instanceof File) as File[];
      if (!fixture) validateUploadCount(files);
      const media = [];
      if (fixture) {
        const key = randomUUID() + ".jpg";
        await putMedia(
          key,
          await sharp(Buffer.from(siteSvg())).jpeg().toBuffer(),
          "image/jpeg",
        );
        media.push({
          key,
          mime: "image/jpeg",
          width: 1200,
          height: 760,
          fixture: true,
        });
      } else
        for (const file of files) {
          const buffer = Buffer.from(await file.arrayBuffer());
          if (file.type.startsWith("video/")) {
            let info;
            try {
              info = await probeVideo(buffer);
            } catch (e) {
              throw new HttpError(400, (e as Error).message);
            }
            const key = randomUUID() + ".mp4";
            await putMedia(key, buffer, file.type);
            media.push({
              key,
              mime: file.type,
              width: info.width,
              height: info.height,
              fixture: false,
              metadata: JSON.stringify({
                duration: info.duration,
                sampling: "Uniform bounded frame sampling; may miss events",
              }),
            });
            continue;
          }
          let info;
          try {
            info = await sharp(buffer, {
              limitInputPixels: 40000000,
            }).metadata();
          } catch {
            throw new HttpError(400, "File contents are not a supported image");
          }
          if (!["jpeg", "png", "webp"].includes(info.format || ""))
            throw new HttpError(
              400,
              "Only JPEG, PNG and WebP image contents are supported",
            );
          const originalKey = randomUUID() + "." + info.format;
          await putMedia(originalKey, buffer, "image/" + info.format);
          const data = await sharp(buffer)
            .rotate()
            .jpeg({ quality: 92 })
            .toBuffer();
          const key = randomUUID() + ".jpg";
          await putMedia(key, data, "image/jpeg");
          const normal = await sharp(data).metadata();
          media.push({
            key,
            mime: "image/jpeg",
            width: normal.width!,
            height: normal.height!,
            fixture: false,
            metadata: JSON.stringify({
              originalKey,
              originalMime: "image/" + info.format,
              normalisation:
                "EXIF orientation applied; JPEG review derivative; original retained privately",
            }),
          });
        }
      const inspection = await db.inspection.create({
        data: {
          ...b,
          projectId,
          authorId: user.id,
          media: { create: media },
          job: { create: { status: "queued" } },
        },
      });
      await audit(
        projectId,
        user.id,
        "Inspection uploaded",
        inspection.id,
        {},
        b,
      );
      return json(inspection, 201);
    }
    if (section === "inspections" && p[3] && method === "POST") {
      const i = await db.inspection.findFirst({
        where: { id: p[3], projectId },
        include: { job: true, findings: true },
      });
      if (!i) throw new HttpError(404, "Inspection not found");
      const b = await bodyJson(req);
      if (b.action === "reviewed") {
        await access(projectId, "progress");
        const humanObservation = z
          .string()
          .max(4000)
          .default("")
          .parse(b.humanObservation);
        await db.inspection.update({
          where: { id: i.id },
          data: {
            status: "reviewed",
            reviewedAt: i.reviewedAt || new Date(),
            humanObservation,
          },
        });
        const existingReport = await db.report.findUnique({
          where: { inspectionId: i.id },
        });
        if (!existingReport) {
          const rawContent = await buildInspectionReport(
            projectId,
            i.id,
            user.name,
          );
          const content = Object.fromEntries(
            Object.entries(rawContent).filter(([key]) => key !== "_records"),
          );
          const evidenceIds = rawContent.claims.flatMap(
            (claim) => claim.evidenceIds,
          );
          const report = await db.report.upsert({
            where: { inspectionId: i.id },
            update: {},
            create: {
              projectId,
              inspectionId: i.id,
              title: `${i.title} · Inspection report`,
              type: "daily",
              authorId: user.id,
              versions: {
                create: {
                  number: 1,
                  status: "draft",
                  content: JSON.stringify(content),
                  model: "deterministic-inspection-template-v1",
                  promptVersion: "inspection-report-v1",
                  sourceRecordVersions: JSON.stringify(
                    rawContent.sourceRecordVersions,
                  ),
                  evidenceLinks: {
                    create: [...new Set(evidenceIds)].map((mediaId) => ({
                      mediaId,
                    })),
                  },
                },
              },
            },
          });
          await audit(
            projectId,
            user.id,
            "Inspection report generated",
            report.id,
            {},
            { inspectionId: i.id },
          );
        }
      } else {
        await access(projectId, "upload");
        if (!["retry", "cancel"].includes(b.action))
          throw new HttpError(400, "Invalid job action");
        if (
          b.action === "cancel" &&
          ![
            "queued",
            "retrying",
            "preprocessing",
            "detection",
            "finding generation",
          ].includes(i.job?.status || "")
        )
          throw new HttpError(400, "Only active jobs can be cancelled");
        if (
          b.action === "retry" &&
          !["failed", "cancelled"].includes(i.job?.status || "")
        )
          throw new HttpError(400, "Only failed or cancelled jobs can retry");
        await db.$transaction([
          db.analysisJob.update({
            where: { inspectionId: i.id },
            data: {
              status: b.action === "retry" ? "retrying" : "cancelled",
              error: null,
            },
          }),
          db.inspection.update({
            where: { id: i.id },
            data: { status: b.action === "retry" ? "retrying" : "cancelled" },
          }),
        ]);
      }
      await audit(
        projectId,
        user.id,
        "Inspection " + b.action,
        i.id,
        { status: i.status },
        b,
      );
      return json({ ok: true });
    }
    if (section === "findings" && method === "POST") {
      await access(projectId, "review");
      const b = z
        .object({
          findingId: z.string().optional(),
          mediaId: z.string().optional(),
          action: z.enum([
            "confirm",
            "reject",
            "correct",
            "resolution",
            "manual",
          ]),
          comment: z.string().min(3),
          title: z.string().min(3).optional(),
          assessment: z.enum(["missing", "present", "unknown"]).optional(),
          resolution: z.enum(["open", "in progress", "resolved"]).optional(),
          assignedTo: z.string().nullable().optional(),
        })
        .parse(await bodyJson(req));
      if (b.action === "manual") {
        const media = await db.media.findFirst({
          where: { id: b.mediaId, inspection: { projectId } },
        });
        if (!media) throw new HttpError(400, "Invalid evidence");
        const f = await db.finding.create({
          data: {
            id: randomUUID(),
            inspectionId: media.inspectionId,
            mediaId: media.id,
            kind: "manual",
            assessment: b.assessment || "unknown",
            title: b.title || "Manual finding",
            verification: "confirmed",
            original: JSON.stringify({ manual: true, authorId: user.id }),
            notes: b.comment,
          },
        });
        await audit(projectId, user.id, "Manual finding added", f.id, {}, f);
        return json(f);
      }
      const f = await db.finding.findFirst({
        where: { id: b.findingId, inspection: { projectId } },
      });
      if (!f) throw new HttpError(404, "Finding not found");
      if (
        b.assignedTo &&
        !(await db.membership.findUnique({
          where: { userId_projectId: { userId: b.assignedTo, projectId } },
        }))
      )
        throw new HttpError(400, "Assignee must be a project member");
      if (b.action === "resolution")
        resolutionAllowed(f.verification, b.resolution || "open", b.comment);
      if (b.action === "reject" && f.resolution !== "open")
        throw new HttpError(
          400,
          "Reopen this finding before changing its verification",
        );
      const data =
        b.action === "resolution"
          ? {
              resolution: b.resolution,
              assignedTo: b.assignedTo,
              notes: b.comment,
            }
          : b.action === "correct"
            ? {
                verification: "confirmed",
                title: b.title || f.title,
                assessment: b.assessment || f.assessment,
                correction: JSON.stringify({
                  title: b.title,
                  assessment: b.assessment,
                  comment: b.comment,
                  authorId: user.id,
                }),
                notes: b.comment,
              }
            : {
                verification: b.action === "confirm" ? "confirmed" : "rejected",
                notes: b.comment,
              };
      const result = await db.$transaction(async (tx) => {
        const out = await tx.finding.update({ where: { id: f.id }, data });
        await tx.reviewDecision.create({
          data: {
            findingId: f.id,
            authorId: user.id,
            action: b.action,
            previous: JSON.stringify(f),
            comment: b.comment,
          },
        });
        await tx.auditEvent.create({
          data: {
            projectId,
            actorId: user.id,
            action: "Finding " + b.action,
            entityId: f.id,
            previous: JSON.stringify(f),
            next: JSON.stringify(data),
          },
        });
        return out;
      });
      return json(result);
    }
    if (section === "compare" && method === "POST") {
      await access(projectId, "progress");
      const b = z
        .object({
          first: z.string(),
          second: z.string(),
          observation: z.enum([
            "Newly visible work",
            "Work continuing",
            "No visible change",
            "Insufficient evidence",
            "Not comparable",
          ]),
          reason: z.string().min(10),
        })
        .parse(await bodyJson(req));
      const items = await db.inspection.findMany({
        where: { projectId, id: { in: [b.first, b.second] } },
      });
      if (items.length !== 2 || items[0].zoneId !== items[1].zoneId)
        throw new HttpError(
          400,
          "Choose two different inspections of the same zone",
        );
      await audit(
        projectId,
        user.id,
        "Comparison observation recorded",
        b.second,
        {},
        b,
      );
      return json({ ok: true });
    }
    if (section === "records" && method === "GET") {
      const kind = z
        .enum([
          "finding",
          "progress-update",
          "comparison",
          "approved-report",
          "inspection-summary",
        ])
        .parse(p[3]);
      const id = z.string().min(1).parse(p[4]);
      if (kind === "approved-report") {
        const version = await db.reportVersion.findFirst({
          where: {
            id,
            report: { projectId },
            ...(role === "viewer" ? { status: "approved" } : {}),
          },
          select: {
            id: true,
            number: true,
            status: true,
            model: true,
            promptVersion: true,
            sourceRecordVersions: true,
            approvedAt: true,
            content: true,
          },
        });
        if (!version) throw new HttpError(404, "Record not found");
        const content = JSON.parse(version.content);
        return json({
          kind,
          id: version.id,
          version: version.number,
          status: version.status,
          model: version.model,
          promptVersion: version.promptVersion,
          sourceRecordVersions: JSON.parse(version.sourceRecordVersions),
          approvedAt: version.approvedAt,
          claims: content.claims,
          limitations: content.limitations,
        });
      }
      if (role === "viewer")
        throw new HttpError(
          403,
          "Operational records are restricted to project staff",
        );
      if (kind === "inspection-summary") {
        const inspection = await db.inspection.findFirst({
          where: { id, projectId },
          include: { zone: true, media: true, findings: true },
        });
        if (!inspection) throw new HttpError(404, "Record not found");
        return json({
          kind,
          id: inspection.id,
          title: inspection.title,
          zone: inspection.zone.name,
          captureTime: inspection.captureTime,
          status: inspection.status,
          mediaCount: inspection.media.length,
          findingCount: inspection.findings.length,
          confirmedFindingCount: inspection.findings.filter(
            (finding) => finding.verification === "confirmed",
          ).length,
        });
      }
      if (kind === "finding") {
        const finding = await db.finding.findFirst({
          where: { id, inspection: { projectId } },
          select: {
            id: true,
            title: true,
            assessment: true,
            verification: true,
            resolution: true,
            mediaId: true,
            createdAt: true,
          },
        });
        if (!finding) throw new HttpError(404, "Record not found");
        return json({ kind, ...finding });
      }
      if (kind === "progress-update") {
        const update = await db.progressUpdate.findFirst({
          where: { id, milestone: { projectId } },
          select: {
            id: true,
            milestoneId: true,
            completion: true,
            reason: true,
            mediaId: true,
            createdAt: true,
          },
        });
        if (!update) throw new HttpError(404, "Record not found");
        return json({ kind, ...update });
      }
      const comparison = await db.auditEvent.findFirst({
        where: { id, projectId, action: "Comparison observation recorded" },
        select: { id: true, action: true, next: true, createdAt: true },
      });
      if (!comparison) throw new HttpError(404, "Record not found");
      return json({
        kind,
        id: comparison.id,
        action: comparison.action,
        observation: JSON.parse(comparison.next),
        createdAt: comparison.createdAt,
      });
    }
    if (section === "reports" && method === "POST") {
      const b = await bodyJson(req);
      const type = z.enum(["daily", "safety"]).parse(b.type);
      await access(projectId, type);
      if (!p[3]) {
        let period;
        if (b.from && b.to) {
          const from = z.coerce.date().parse(b.from),
            to = z.coerce.date().parse(b.to + "T23:59:59.999Z");
          if (to < from)
            throw new HttpError(400, "Report period end must follow start");
          period = { from, to };
        }
        const useProvider = b.useProvider === true;
        const generated = useProvider
          ? await buildProviderReport(projectId, user.name, period)
          : null;
        const rawContent =
          generated?.content ||
          (await buildReport(projectId, user.name, period));
        const content = Object.fromEntries(
          Object.entries(rawContent).filter(([key]) => key !== "_records"),
        ) as Omit<typeof rawContent, "_records">;
        const title = z.string().min(3).parse(b.title);
        const ids = [...new Set(content.claims.flatMap((c) => c.evidenceIds))];
        const report = await db.report.create({
          data: {
            projectId,
            title,
            type,
            authorId: user.id,
            versions: {
              create: {
                number: 1,
                status: "draft",
                content: JSON.stringify(content),
                model: generated?.model || "deterministic-record-template-v1",
                promptVersion: generated?.promptVersion || "report-v1",
                sourceRecordVersions: JSON.stringify(
                  generated?.sourceRecordVersions ||
                    content.sourceRecordVersions,
                ),
                evidenceLinks: { create: ids.map((mediaId) => ({ mediaId })) },
              },
            },
          },
        });
        await audit(projectId, user.id, "Report generated", report.id, {}, {});
        return json(report);
      }
      const report = await db.report.findFirst({
        where: { id: p[3], projectId },
        include: { versions: { orderBy: { number: "desc" } } },
      });
      if (!report) throw new HttpError(404, "Report not found");
      await access(projectId, report.type);
      const version = report.versions[0];
      if (b.action === "revision") {
        if (report.inspectionId)
          throw new HttpError(
            400,
            "Inspection reports are single immutable records",
          );
        let period;
        if (b.from && b.to) {
          const from = z.coerce.date().parse(b.from),
            to = z.coerce.date().parse(b.to + "T23:59:59.999Z");
          if (to < from)
            throw new HttpError(400, "Report period end must follow start");
          period = { from, to };
        }
        const useProvider = b.useProvider === true;
        const generated = useProvider
          ? await buildProviderReport(projectId, user.name, period)
          : null;
        const rawContent =
          generated?.content ||
          (await buildReport(projectId, user.name, period));
        const content = Object.fromEntries(
          Object.entries(rawContent).filter(([key]) => key !== "_records"),
        ) as Omit<typeof rawContent, "_records">;
        await db.reportVersion.create({
          data: {
            reportId: report.id,
            number: version.number + 1,
            content: JSON.stringify(content),
            model: generated?.model || "deterministic-record-template-v1",
            promptVersion: generated?.promptVersion || "report-v1",
            sourceRecordVersions: JSON.stringify(
              generated?.sourceRecordVersions || content.sourceRecordVersions,
            ),
            evidenceLinks: {
              create: [
                ...new Set(content.claims.flatMap((c) => c.evidenceIds)),
              ].map((mediaId) => ({ mediaId })),
            },
          },
        });
      } else {
        assertVersionMutable(version.status);
        if (
          b.action === "approve" &&
          !JSON.parse(version.content).claims?.length
        )
          throw new HttpError(
            400,
            "Reports require reviewed evidence before approval",
          );
        if (
          b.action === "approve" &&
          JSON.parse(version.content).claims.some(
            (claim: { type?: string; verification?: string }) =>
              claim.type && claim.type !== "verified",
          )
        )
          throw new HttpError(
            400,
            "Approved reports can contain only verified claims",
          );
        if (b.action === "approve" && version.status !== "pending approval")
          throw new HttpError(400, "Submit the draft for approval first");
        if (!["submit", "approve"].includes(b.action))
          throw new HttpError(400, "Invalid report action");
        await db.reportVersion.update({
          where: { id: version.id },
          data: {
            status: b.action === "approve" ? "approved" : "pending approval",
            ...(b.action === "approve"
              ? { approvedBy: user.id, approvedAt: new Date() }
              : {}),
          },
        });
      }
      await audit(
        projectId,
        user.id,
        "Report " + b.action,
        report.id,
        { status: version.status },
        b,
      );
      return json({ ok: true });
    }
    if (section === "reports" && p[4] === "pdf" && method === "GET") {
      const version = await db.reportVersion.findFirst({
        where: {
          reportId: p[3],
          status: "approved",
          report: { projectId },
          ...(req.nextUrl.searchParams.get("version")
            ? { id: req.nextUrl.searchParams.get("version")! }
            : {}),
        },
        include: {
          report: { include: { project: true } },
          evidenceLinks: { include: { media: true } },
        },
        orderBy: { number: "desc" },
      });
      if (!version)
        throw new HttpError(
          403,
          "Only approved report versions can be exported",
        );
      const bytes = await renderReport({
        title: version.report.title,
        project: version.report.project.name,
        version: version.number,
        versionId: version.id,
        approvedAt: version.approvedAt!,
        approvedBy: version.approvedBy!,
        model: version.model,
        promptVersion: version.promptVersion,
        content: JSON.parse(version.content),
        evidence: version.evidenceLinks.map((e) => e.media),
      });
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="sitesight-${version.reportId}-v${version.number}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (section === "ask" && method === "POST") {
      const b = z
        .object({
          question: z.string().trim().min(1).max(1000),
          useProvider: z.boolean().optional(),
          scope: z.enum(["project", "inspection"]).optional(),
          inspectionId: z.string().min(1).optional(),
          history: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().min(1).max(4000),
              }),
            )
            .optional(),
          previousGrounded: z.boolean().optional(),
        })
        .parse(await bodyJson(req));
      const history = b.history || [];
      if (!needsProjectRecords(b.question, b.previousGrounded)) {
        try {
          const out = await generalProvider(b.question, fetch, history);
          if (!providerDeclinesRecordAccess(out.message))
            return json({
              message: out.message,
              claims: [],
              limitations:
                "General conversational answer; no SiteSight project records were used.",
              provider: `${providerStatus().provider} · ${out.model}`,
            });
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : "The configured model provider did not return a usable answer.";
          return json({
            message: /\(429\)|rate limit/i.test(detail)
              ? "Groq’s free-tier request limit is temporarily exhausted. Your conversation is still active; wait briefly, then continue."
              : "I couldn’t complete that general answer because Groq returned an invalid or unavailable response. Your conversation is still active, so you can continue.",
            claims: [],
            limitations: detail,
            provider: "Groq response unavailable",
          });
        }
      }
      const retrieval =
        b.scope === "inspection"
          ? await retrieveInspectionQuestion(
              projectId,
              b.inspectionId || "",
              role === "viewer",
              b.question,
            )
          : await retrieveQuestion(projectId, b.question, role === "viewer");
      if (
        b.scope !== "inspection" &&
        role !== "viewer" &&
        !/certif|structural quality|site-wide|whole site/i.test(b.question)
      ) {
        const workspace = await retrieveWorkspaceQuestion(user.id);
        retrieval.records = [
          ...new Map(
            [...retrieval.records, ...workspace.records].map((record) => [
              record.id,
              record,
            ]),
          ).values(),
        ];
      }
      let providerMessage: string | undefined;
      if (b.useProvider !== false) {
        const authorisedFallbackClaims = retrieval.claims;
        try {
          const requestedEvidence = [
            ...new Set(
              retrieval.records.flatMap((record) => record.evidenceIds),
            ),
          ];
          const ids = await db.media.findMany({
            where: {
              inspection: { projectId },
              id: { in: requestedEvidence },
              ...(role === "viewer"
                ? {
                    evidenceLinks: {
                      some: { reportVersion: { status: "approved" } },
                    },
                  }
                : {}),
            },
          });
          const out = await structuredProvider(
            retrieval.records,
            b.question,
            ids.map((m) => m.id),
            "qa",
            fetch,
            history,
          );
          if (!out.claims.length && authorisedFallbackClaims.length) {
            const fallback = naturalRecordFallback(
              b.question,
              authorisedFallbackClaims,
            );
            retrieval.claims = fallback.claims;
            providerMessage = fallback.message;
            retrieval.provider = "Authorised record fallback";
            retrieval.limitations =
              "Direct authorised record excerpts are shown because the generated wording did not pass evidence validation.";
          } else {
            retrieval.claims = out.claims;
            providerMessage = out.message;
            retrieval.provider = `${providerStatus().provider} · ${out.model} · requires human review`;
            retrieval.limitations = out.claims.length
              ? "Model wording is grounded in authorised records and remains subject to human review."
              : "Insufficient authorised evidence to answer this project-specific question.";
          }
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : "The configured model provider did not return a usable answer.";
          if (authorisedFallbackClaims.length) {
            const fallback = naturalRecordFallback(
              b.question,
              authorisedFallbackClaims,
            );
            retrieval.claims = fallback.claims;
            providerMessage = fallback.message;
            retrieval.provider = "Authorised record fallback";
            retrieval.limitations = detail;
          } else {
            retrieval.claims = [];
            providerMessage =
              "I couldn’t complete that answer because Groq returned an invalid or unavailable response. Your conversation is still active, so you can rephrase the question and continue.";
            retrieval.provider = "Groq response unavailable";
            retrieval.limitations = detail;
          }
        }
      }
      return json({
        ...publicAnswer(projectId, retrieval),
        message: providerMessage,
      });
    }
    if (section === "notifications" && method === "POST") {
      if (role === "viewer")
        throw new HttpError(
          403,
          "Notifications are restricted to project staff",
        );
      await db.notification.updateMany({
        where: { projectId },
        data: { read: true },
      });
      return json({ ok: true });
    }
    throw new HttpError(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: e.issues.map((i) => i.message).join("; ") }, 400);
    if (
      e instanceof Error &&
      /(?:Hugging Face|Groq|Model) provider unavailable/.test(e.message)
    )
      return json({ error: e.message }, 503);
    if (
      e instanceof Error &&
      /(?:Hugging Face|Groq) authentication failed/.test(e.message)
    )
      return json({ error: e.message }, 503);
    if (
      e instanceof Error &&
      /(?:Hugging Face|Groq) account has no remaining provider credits/.test(
        e.message,
      )
    )
      return json({ error: e.message }, 402);
    if (
      e instanceof Error &&
      /(?:Hugging Face|Groq) model is not supported by the configured provider/.test(
        e.message,
      )
    )
      return json({ error: e.message }, 422);
    if (
      e instanceof Error &&
      /(?:Hugging Face|Groq) provider request failed|(?:Hugging Face|Groq) rejected the request|Provider returned|structured output|invalid output|response exceeds/.test(
        e.message,
      )
    )
      return json({ error: e.message }, 502);
    if (
      e instanceof Error &&
      /source record|numerical claim|validated source fact|Unverified records|Proposal claim|Unknown claim|Recommendations|approved reports|Too many source|input limit|Insufficient reviewed evidence/.test(
        e.message,
      )
    )
      return json({ error: e.message }, 422);
    if (
      e instanceof Error &&
      /immutable|evidence|confirmed findings|Upload|Maximum|Videos/.test(
        e.message,
      )
    )
      return json({ error: e.message }, 400);
    console.error("Request failed:", e instanceof Error ? e.name : "unknown");
    return json(
      {
        error:
          "The request could not be completed. Check your inputs and service configuration.",
      },
      500,
    );
  }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
