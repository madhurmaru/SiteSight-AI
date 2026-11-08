import { extractFrames } from "./video";
import { db, demo } from "./db";
import { fixtureDetections, fixtureFindings, fixtureModel } from "./fixture";

export function inferenceConnectionError(error: unknown, endpoint: string) {
  let origin = "the configured endpoint";
  try {
    origin = new URL(endpoint).origin;
  } catch {}
  if (error instanceof DOMException && error.name === "TimeoutError")
    return `Python inference worker timed out at ${origin}. Check that the model service is running and has enough memory.`;
  if (
    error instanceof TypeError ||
    (error instanceof Error && /fetch failed|econnrefused/i.test(error.message))
  )
    return `Cannot reach the Python inference worker at ${origin}. Start npm run worker:inference and verify INFERENCE_URL, then retry.`;
  return error instanceof Error ? error.message : "Analysis failed";
}

async function inferenceResponseError(response: Response) {
  let detail = "Check the Python worker terminal for model setup errors.";
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") detail = body.detail.slice(0, 500);
  } catch {}
  return `Python inference worker returned HTTP ${response.status}: ${detail}`;
}

export async function runOneJob() {
  const cutoff = new Date(Date.now() - 120000);
  const job = await db.analysisJob.findFirst({
    where: {
      OR: [
        { status: { in: ["queued", "retrying"] } },
        {
          status: { in: ["preprocessing", "detection", "finding generation"] },
          leaseAt: { lt: cutoff },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return false;
  const claimed = await db.analysisJob.updateMany({
    where: { id: job.id, status: job.status, updatedAt: job.updatedAt },
    data: {
      status: "preprocessing",
      leaseAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  });
  if (!claimed.count) return false;
  const heartbeat = setInterval(() => {
    void db.analysisJob
      .updateMany({
        where: {
          id: job.id,
          attempts: job.attempts + 1,
          status: { in: ["preprocessing", "detection", "finding generation"] },
        },
        data: { leaseAt: new Date() },
      })
      .catch(() => {});
  }, 15000);
  try {
    const inspection = await db.inspection.findUniqueOrThrow({
      where: { id: job.inspectionId },
      include: { media: true, project: true },
    });
    await db.inspection.updateMany({
      where: {
        id: inspection.id,
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
      data: { status: "preprocessing" },
    });
    const outputs: {
      media: (typeof inspection.media)[number];
      model: string;
      version: string;
      detections: {
        id: string;
        class: string;
        rawClass?: string;
        confidence: number;
        box: number[];
        workerId: string | null;
      }[];
      provenance?: Record<string, unknown>;
      findings: {
        id: string;
        kind: string;
        assessment: string;
        title: string;
        workerId: string | null;
        original: string;
      }[];
    }[] = [];
    const inputs = [];
    for (const m of inspection.media.filter((m) => !m.sourceId)) {
      if (m.mime.startsWith("video/")) inputs.push(...(await extractFrames(m)));
      else inputs.push(m);
    }
    const detecting = await db.analysisJob.updateMany({
      where: {
        id: job.id,
        attempts: job.attempts + 1,
        status: "preprocessing",
      },
      data: { status: "detection" },
    });
    if (!detecting.count) return true;
    await db.inspection.updateMany({
      where: { id: inspection.id, status: "preprocessing" },
      data: { status: "detection" },
    });
    for (const media of inputs) {
      if (
        (await db.analysisJob.findUniqueOrThrow({ where: { id: job.id } }))
          .status === "cancelled"
      )
        return true;
      if (media.fixture) {
        if (!demo)
          throw new Error(
            "Fixture inference is restricted to local fixture mode.",
          );
        outputs.push({
          media,
          detections: fixtureDetections(media.id),
          findings: fixtureFindings(media.id, inspection.id),
          model: fixtureModel.name,
          version: fixtureModel.version,
        });
      } else {
        const adapter =
          process.env.INFERENCE_ADAPTER || (demo ? "fixture" : "worker");
        if (adapter !== "worker")
          throw new Error(
            "Real inference is disabled. Set INFERENCE_ADAPTER=worker and configure the licensed Python detector.",
          );
        if (!process.env.INFERENCE_URL || !process.env.WORKER_SECRET)
          throw new Error(
            "Detector unavailable. Configure INFERENCE_URL, WORKER_SECRET and licensed PPE weights.",
          );
        const { mediaUrl, readMedia } = await import("./storage");
        const source = demo
          ? { contentBase64: (await readMedia(media.key)).toString("base64") }
          : { url: await mediaUrl(media.key) };
        let r: Response;
        try {
          r = await fetch(process.env.INFERENCE_URL + "/analyse", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + process.env.WORKER_SECRET,
            },
            body: JSON.stringify({
              mediaId: media.id,
              inspectionId: inspection.id,
              ...source,
              mime: media.mime,
              threshold: inspection.project.threshold,
            }),
            signal: AbortSignal.timeout(90000),
          });
        } catch (error) {
          throw new Error(
            inferenceConnectionError(error, process.env.INFERENCE_URL),
          );
        }
        if (!r.ok) throw new Error(await inferenceResponseError(r));
        const result = await r.json();
        const { inferenceSchema } = await import("./validation");
        const parsed = inferenceSchema.parse(result);
        if (
          parsed.detections.some(
            (d) =>
              !d.id.startsWith(media.id + "-") ||
              (d.workerId && !d.workerId.startsWith(media.id + "-")),
          ) ||
          parsed.findings.some(
            (f) =>
              !f.id.startsWith(media.id + "-") ||
              (f.workerId &&
                !parsed.detections.some(
                  (d) => d.id === f.workerId && d.class === "worker",
                )),
          )
        )
          throw new Error("Invalid detector evidence references");
        outputs.push({ media, ...parsed });
      }
    }
    await db.analysisJob.updateMany({
      where: { id: job.id, attempts: job.attempts + 1, status: "detection" },
      data: { status: "finding generation" },
    });
    await db.inspection.updateMany({
      where: { id: inspection.id, status: "detection" },
      data: { status: "finding generation" },
    });
    await db.$transaction(async (tx) => {
      const current = await tx.analysisJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (
        current.status === "cancelled" ||
        current.attempts !== job.attempts + 1
      )
        return;
      for (const out of outputs) {
        for (const d of out.detections)
          await tx.detection.upsert({
            where: { id: d.id },
            update: {},
            create: {
              ...d,
              box: JSON.stringify(d.box),
              mediaId: out.media.id,
              model: out.model,
              version: out.version,
              rawClass: d.rawClass,
            },
          });
        for (const f of out.findings)
          await tx.finding.upsert({
            where: { id: f.id },
            update: {},
            create: {
              ...f,
              mediaId: out.media.id,
              inspectionId: inspection.id,
            },
          });
      }
      await tx.analysisJob.update({
        where: { id: job.id },
        data: {
          status: "ready",
          model: outputs[0]?.model,
          version: outputs[0]?.version,
          provenance: outputs[0]?.provenance
            ? JSON.stringify(outputs[0].provenance)
            : undefined,
        },
      });
      await tx.inspection.update({
        where: { id: inspection.id },
        data: { status: inspection.reviewedAt ? "reviewed" : "ready" },
      });
      await tx.notification.create({
        data: {
          projectId: inspection.projectId,
          message: `${inspection.title} is ready for review`,
        },
      });
    });
  } catch (e) {
    const failure = e instanceof Error ? e.message : "Analysis failed";
    await db.$transaction(async (tx) => {
      const current = await tx.analysisJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (
        current.status === "cancelled" ||
        current.attempts !== job.attempts + 1
      )
        return;
      await tx.analysisJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          error: failure,
        },
      });
      await tx.inspection.update({
        where: { id: job.inspectionId },
        data: { status: "failed" },
      });
    });
    console.error("[SiteSight queue] analysis job failed", {
      jobId: job.id,
      inspectionId: job.inspectionId,
      attempt: job.attempts + 1,
      error: failure,
    });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
