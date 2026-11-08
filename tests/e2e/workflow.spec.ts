import { test, expect, request as playwrightRequest } from "@playwright/test";
import type { StateData } from "../../lib/types";
import { db } from "../../lib/db";
import { runOneJob } from "../../lib/jobs";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
test("persistent inspection → review → progress → frozen report → approved-only viewer", async ({
  request,
}) => {
  const login = await request.post("/api/auth/login", {
    data: { email: "admin@sitesight.local", password: "SiteSight2026!" },
  });
  expect(login.status()).toBe(200);
  const project = "/api/projects/riverside";
  expect((await request.get("/api/projects/restricted")).status()).toBe(403);
  const initial = await request.get(project);
  expect(initial.status()).toBe(200);
  const created = await request.post(project + "/inspections", {
    multipart: {
      title: "Acceptance inspection " + randomUUID().slice(0, 6),
      zoneId: "zone-b",
      captureTime: "2026-10-26T09:30:00+05:30",
      viewpoint: "East elevation",
      notes: "Automated acceptance workflow",
      fixture: "true",
    },
  });
  expect(created.status()).toBe(201);
  const inspection = await created.json();
  await expect
    .poll(async () => {
      await runOneJob();
      const state = (await (await request.get(project)).json()) as StateData;
      return state.inspections.find((i) => i.id === inspection.id)?.status;
    })
    .toBe("ready");
  let state = (await (await request.get(project)).json()) as StateData;
  let i = state.inspections.find((i) => i.id === inspection.id)!;
  expect(i.media[0].detections).toHaveLength(6);
  expect(i.findings).toHaveLength(4);
  expect(
    (
      await request.post(project + "/inspections/" + i.id, {
        data: {
          action: "reviewed",
          humanObservation:
            "Inspector observed ongoing work within the captured area.",
        },
      })
    ).status(),
  ).toBe(200);
  const originalCompletion = state.project.milestones.find(
    (m) => m.id === "structure",
  )!.completion;
  expect(
    (
      await request.post(project + "/progress", {
        data: {
          milestoneId: "structure",
          completion: 68,
          mediaId: i.media[0].id,
          reason: "Engineer review of work record and supporting inspection.",
        },
      })
    ).status(),
  ).toBe(200);
  state = (await (await request.get(project)).json()) as StateData;
  const reportsForInspection = state.reports.filter(
    (candidate) => candidate.inspectionId === i.id,
  );
  expect(reportsForInspection).toHaveLength(1);
  const report = reportsForInspection[0];
  expect(
    JSON.parse(report.versions[0].content).inspectionSummary,
  ).toMatchObject({
    inspectionId: i.id,
    humanObservation:
      "Inspector observed ongoing work within the captured area.",
  });
  expect(
    (await request.get(project + "/reports/" + report.id + "/pdf")).status(),
  ).toBe(403);
  expect(
    (
      await request.post(project + "/reports/" + report.id, {
        data: { type: "daily", action: "submit" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post(project + "/reports/" + report.id, {
        data: { type: "daily", action: "approve" },
      })
    ).status(),
  ).toBe(200);
  state = await (await request.get(project)).json();
  const approved = state.reports.find((r) => r.id === report.id)!.versions[0];
  expect(approved.status).toBe("approved");
  expect(
    JSON.parse(approved.content).claims.every(
      (c: { verification: string }) => c.verification !== "proposed",
    ),
  ).toBeTruthy();
  expect(
    JSON.parse(approved.content).claims.some(
      (c: { type: string }) => c.type === "progress",
    ),
  ).toBeFalsy();
  const pdf = await request.get(project + "/reports/" + report.id + "/pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(
    (await PDFDocument.load(await pdf.body())).getPageCount(),
  ).toBeGreaterThan(1);
  await request.post(project + "/progress", {
    data: {
      milestoneId: "structure",
      completion: originalCompletion,
      mediaId: i.media[0].id,
      reason: "Restore verified percentage after acceptance test.",
    },
  });
  expect(
    (
      await request.post(project + "/reports/" + report.id, {
        data: { type: "daily", action: "approve" },
      })
    ).status(),
  ).toBe(400);
  const immutable = await db.reportVersion.findUniqueOrThrow({
    where: { id: approved.id },
  });
  expect(immutable.content).toBe(approved.content);
  expect(JSON.parse(immutable.sourceRecordVersions).length).toBeGreaterThan(0);
  expect(
    JSON.parse(immutable.content).claims.every(
      (claim: { type: string }) => claim.type === "verified",
    ),
  ).toBeTruthy();
  const grounded = await (
    await request.post(project + "/ask", {
      data: { question: "Summarise the latest approved inspection report." },
    })
  ).json();
  expect(grounded.claims.length).toBeGreaterThan(0);
  expect(grounded.claims[0].citations.length).toBeGreaterThan(0);
  expect(
    (await request.get(grounded.claims[0].citations[0].href)).status(),
  ).toBe(200);
  const insufficient = await (
    await request.post(project + "/ask", {
      data: { question: "Certify the structural quality of the whole site" },
    })
  ).json();
  expect(insufficient.claims).toHaveLength(0);
  expect(insufficient.limitations).toContain("Insufficient");
  // Force a queue retry to verify idempotence of internal detections/findings.
  await db.analysisJob.update({
    where: { inspectionId: i.id },
    data: { status: "failed", error: "Injected retry test" },
  });
  expect(
    (
      await request.post(project + "/inspections/" + i.id, {
        data: { action: "retry" },
      })
    ).status(),
  ).toBe(200);
  await runOneJob();
  state = await (await request.get(project)).json();
  i = state.inspections.find((j) => j.id === i.id)!;
  expect(i.findings).toHaveLength(4);
  expect(await db.report.count({ where: { inspectionId: i.id } })).toBe(1);
  const viewer = await playwrightRequest.newContext({
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3001",
  });
  await viewer.post("/api/auth/login", {
    data: { email: "viewer@sitesight.local", password: "SiteSight2026!" },
  });
  const visible = (await (await viewer.get(project)).json()) as StateData;
  expect(visible.inspections).toHaveLength(0);
  expect(visible.findings).toHaveLength(0);
  expect(visible.project.milestones).toHaveLength(0);
  expect(
    visible.reports.every((r) =>
      r.versions.every((v) => v.status === "approved"),
    ),
  ).toBeTruthy();
  expect(
    (
      await viewer.post(project + "/progress", {
        data: {
          milestoneId: "structure",
          completion: 99,
          mediaId: i.media[0].id,
          reason: "Unauthorised",
        },
      })
    ).status(),
  ).toBe(403);
  expect((await viewer.get("/api/media/evidence-5")).status()).toBe(403);
  expect((await viewer.get("/api/media/" + i.media[0].id)).status()).toBe(200);
  expect(
    (await viewer.get(project + "/reports/" + report.id + "/pdf")).status(),
  ).toBe(200);
  expect((await viewer.get("/api/projects/restricted")).status()).toBe(403);
  const answer = await (
    await viewer.post(project + "/ask", {
      data: { question: "Summarise approved records" },
    })
  ).json();
  expect(answer.provider).toContain("Approved");
  expect(answer.claims[0].citations[0].kind).toBe("approved-report");
  expect((await viewer.get(answer.claims[0].citations[0].href)).status()).toBe(
    200,
  );
  await viewer.dispose();
});
test("upload content validation, role boundaries, cross-project evidence, CSRF", async ({
  request,
}) => {
  await request.post("/api/auth/login", {
    data: { email: "admin@sitesight.local", password: "SiteSight2026!" },
  });
  const base = {
    title: "Invalid upload",
    zoneId: "zone-b",
    captureTime: "2026-10-26T09:30:00Z",
    viewpoint: "East",
    notes: "Validation",
    fixture: "false",
  };
  expect(
    (
      await request.post("/api/projects/riverside/inspections", {
        multipart: {
          ...base,
          files: {
            name: "fake.jpg",
            mimeType: "image/jpeg",
            buffer: Buffer.from("<script>not image</script>"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/projects/riverside/progress", {
        data: {
          milestoneId: "structure",
          completion: 95,
          mediaId: "foreign-evidence",
          reason: "Invalid evidence reference",
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/projects/riverside/progress", {
        headers: { Origin: "https://evil.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await request.post("/api/auth/login", {
    data: { email: "engineer@sitesight.local", password: "SiteSight2026!" },
  });
  expect(
    (
      await request.post("/api/projects/riverside/findings", {
        data: {
          findingId: "evidence-5-helmet",
          action: "confirm",
          comment: "Not permitted",
        },
      })
    ).status(),
  ).toBe(403);
  await request.post("/api/auth/login", {
    data: { email: "safety@sitesight.local", password: "SiteSight2026!" },
  });
  expect(
    (
      await request.post("/api/projects/riverside/progress", { data: {} })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/projects/riverside/reports", {
        data: { title: "Wrong approval role", type: "daily" },
      })
    ).status(),
  ).toBe(403);
});

test("real media never receives fixtures; bounded video frames persist idempotently", async ({
  request,
}) => {
  const { readFile, mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  await request.post("/api/auth/login", {
    data: { email: "admin@sitesight.local", password: "SiteSight2026!" },
  });
  const project = "/api/projects/riverside";
  const common = {
    title: "Real media boundary test",
    zoneId: "zone-b",
    captureTime: "2026-10-26T09:30:00Z",
    viewpoint: "Test camera",
    notes: "No fixture substitution permitted.",
    fixture: "false",
  };
  const image = await request.post(project + "/inspections", {
    multipart: {
      ...common,
      files: {
        name: "upload.jpg",
        mimeType: "image/jpeg",
        buffer: await readFile("data/media/fixture-0.jpg"),
      },
    },
  });
  expect(image.status()).toBe(201);
  const img = await image.json();
  await expect
    .poll(async () => {
      await runOneJob();
      return (
        await db.analysisJob.findUniqueOrThrow({
          where: { inspectionId: img.id },
        })
      ).status;
    })
    .toBe("failed");
  expect(await db.finding.count({ where: { inspectionId: img.id } })).toBe(0);
  const dir = await mkdtemp(path.join(tmpdir(), "sitesight-e2e-"));
  try {
    const file = path.join(dir, "clip.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=gray:s=640x360:d=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-y",
      file,
    ]);
    const response = await request.post(project + "/inspections", {
      multipart: {
        ...common,
        title: "Video sampling acceptance",
        files: {
          name: "clip.mp4",
          mimeType: "video/mp4",
          buffer: await readFile(file),
        },
      },
    });
    expect(response.status()).toBe(201);
    const video = await response.json();
    await expect
      .poll(async () => {
        await runOneJob();
        return (
          await db.analysisJob.findUniqueOrThrow({
            where: { inspectionId: video.id },
          })
        ).status;
      })
      .toBe("failed");
    const frames = await db.media.findMany({
      where: { inspectionId: video.id, sourceId: { not: null } },
    });
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.timestamp)).toEqual([0, 0.667, 1.333]);
    expect(await db.finding.count({ where: { inspectionId: video.id } })).toBe(
      0,
    );
    expect(
      (
        await request.post(project + "/inspections/" + video.id, {
          data: { action: "retry" },
        })
      ).status(),
    ).toBe(200);
    await runOneJob();
    expect(
      await db.media.count({
        where: { inspectionId: video.id, sourceId: { not: null } },
      }),
    ).toBe(3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("project configuration, member assignment and weight validation", async ({
  request,
}) => {
  await request.post("/api/auth/login", {
    data: { email: "admin@sitesight.local", password: "SiteSight2026!" },
  });
  const created = await request.post("/api/projects", {
    data: {
      name: "Configuration acceptance",
      description: "Temporary acceptance project",
      location: "Bengaluru",
      startDate: "2026-01-01",
      targetDate: "2027-01-01",
    },
  });
  expect(created.status()).toBe(200);
  const project = await created.json();
  const path = "/api/projects/" + project.id;
  try {
    const zone = await (
      await request.post(path + "/zones", { data: { name: "North wing" } })
    ).json();
    expect(zone.projectId).toBe(project.id);
    const values = {
      name: "North frame",
      zoneId: zone.id,
      weight: 25,
      startDate: "2026-01-01",
      targetDate: "2026-12-01",
    };
    expect(
      (
        await request.post(path + "/milestones", {
          data: { ...values, weight: 0 },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post(path + "/milestones", {
          data: { ...values, zoneId: "zone-b" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (await request.post(path + "/milestones", { data: values })).status(),
    ).toBe(200);
    expect(
      (
        await request.post(path + "/members", {
          data: { email: "engineer@sitesight.local", role: "engineer" },
        })
      ).status(),
    ).toBe(200);
    await request.post("/api/auth/login", {
      data: { email: "engineer@sitesight.local", password: "SiteSight2026!" },
    });
    expect((await request.get(path)).status()).toBe(200);
    expect(
      (
        await request.post(path + "/members", {
          data: { email: "viewer@sitesight.local", role: "viewer" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await db.milestone.deleteMany({ where: { projectId: project.id } });
    await db.project.delete({ where: { id: project.id } });
  }
});

test("repeat demo reset restores coherent fixtures without deleting other projects", async ({
  request,
}) => {
  await request.post("/api/auth/login", {
    data: { email: "admin@sitesight.local", password: "SiteSight2026!" },
  });
  for (let n = 0; n < 2; n++) {
    const reset = await request.post("/api/projects/riverside/reset", {
      data: {},
    });
    expect(reset.status()).toBe(200);
    const state = (await (
      await request.get("/api/projects/riverside")
    ).json()) as StateData;
    expect(state.inspections).toHaveLength(6);
    expect(state.findings).toHaveLength(24);
    expect(state.project.milestones).toHaveLength(4);
    expect(state.reports).toHaveLength(5);
    expect(
      new Set(state.reports.map((report) => report.inspectionId)).size,
    ).toBe(5);
    expect(
      state.reports.every(
        (report) =>
          report.inspectionId &&
          JSON.parse(report.versions[0].content).inspectionSummary
            .inspectionId === report.inspectionId,
      ),
    ).toBeTruthy();
    expect(
      state.reports.filter(
        (report) => report.versions[0].status === "approved",
      ),
    ).toHaveLength(4);
    expect(await db.project.count({ where: { id: "restricted" } })).toBe(1);
  }
});
