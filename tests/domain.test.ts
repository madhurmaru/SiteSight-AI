import test from "node:test";
import assert from "node:assert/strict";
import {
  progress,
  planned,
  allowed,
  compliance,
  validateCitations,
  assertVersionMutable,
  resolutionAllowed,
} from "../lib/domain";
import {
  validateUploadCount,
  boxSchema,
  inferenceSchema,
} from "../lib/validation";
import { inferenceConnectionError } from "../lib/jobs";

test("inference connection failures include actionable localhost guidance", () => {
  const message = inferenceConnectionError(
    new TypeError("fetch failed"),
    "http://127.0.0.1:8001",
  );
  assert.match(message, /Cannot reach the Python inference worker/);
  assert.match(message, /127\.0\.0\.1:8001/);
  assert.match(message, /npm run worker:inference/);
  assert.doesNotMatch(message, /secret|Bearer/i);
});
test("weighted verified progress and zero-weight handling", () => {
  assert.equal(
    progress([
      { weight: 25, completion: 100 },
      { weight: 75, completion: 40 },
    ]),
    55,
  );
  assert.equal(progress([]), null);
  assert.equal(progress([{ weight: 0, completion: 99 }]), null);
});
test("linear baseline clamps outside documented dates", () => {
  assert.equal(
    planned(
      { startDate: "2026-01-01", targetDate: "2026-01-11" },
      new Date("2026-01-06"),
    ),
    50,
  );
  assert.equal(
    planned(
      { startDate: "2026-01-01", targetDate: "2026-01-11" },
      new Date("2025-12-01"),
    ),
    0,
  );
});
test("role matrix restricts safety and engineering actions", () => {
  assert.equal(allowed("viewer", "review"), false);
  assert.equal(allowed("engineer", "review"), false);
  assert.equal(allowed("safety", "progress"), false);
  assert.equal(allowed("safety", "safety"), true);
  assert.equal(allowed("engineer", "daily"), true);
});
test("PPE denominator groups worker observations and excludes unknowns/unreviewed", () => {
  const result = compliance([
    {
      mediaId: "m",
      workerId: "w1",
      assessment: "present",
      verification: "confirmed",
    },
    {
      mediaId: "m",
      workerId: "w1",
      assessment: "present",
      verification: "confirmed",
    },
    {
      mediaId: "m",
      workerId: "w2",
      assessment: "missing",
      verification: "confirmed",
    },
    {
      mediaId: "m",
      workerId: "w3",
      assessment: "unknown",
      verification: "confirmed",
    },
    {
      mediaId: "m",
      workerId: "w4",
      assessment: "present",
      verification: "proposed",
    },
  ]);
  assert.deepEqual(result, {
    present: 1,
    assessable: 2,
    unknown: 2,
    percent: 50,
  });
});
test("foreign and empty citations rejected", () => {
  assert.throws(() => validateCitations([{ evidenceIds: ["foreign"] }], ["m"]));
  assert.throws(() => validateCitations([{ evidenceIds: [] }], ["m"]));
  validateCitations([{ evidenceIds: ["m"] }], ["m"]);
});
test("approved versions and resolution transitions protected", () => {
  assert.throws(() => assertVersionMutable("approved"));
  assertVersionMutable("draft");
  assert.throws(() => resolutionAllowed("proposed", "resolved", "reference"));
  assert.throws(() => resolutionAllowed("confirmed", "resolved", ""));
  resolutionAllowed("confirmed", "open", "reopening");
});
test("upload counts, size, media mix and normalised geometry validated", () => {
  assert.throws(() => validateUploadCount([]));
  assert.throws(() =>
    validateUploadCount(Array(21).fill({ size: 1, type: "image/jpeg" })),
  );
  assert.throws(() =>
    validateUploadCount([{ size: 101 * 1024 * 1024, type: "image/jpeg" }]),
  );
  assert.throws(() =>
    validateUploadCount([
      { size: 1, type: "video/mp4" },
      { size: 1, type: "image/jpeg" },
    ]),
  );
  assert.equal(boxSchema.safeParse([0.8, 0.2, 0.4, 0.2]).success, false);
  assert.equal(boxSchema.safeParse([0.2, 0.2, 0.3, 0.5]).success, true);
});
test("real inference requires provenance and preserves detector class names", () => {
  const parsed = inferenceSchema.parse({
    model: "PPE detector",
    version: "1.0",
    provenance: { license: "MIT", association: "spatial-v2" },
    detections: [
      {
        id: "media-d0",
        class: "no-helmet",
        rawClass: "no-hardhat",
        confidence: 0.8,
        box: [0.1, 0.1, 0.2, 0.3],
        workerId: null,
      },
    ],
    findings: [],
  });
  assert.equal(parsed.detections[0].rawClass, "no-hardhat");
  assert.throws(() =>
    inferenceSchema.parse({
      model: "PPE detector",
      version: "1.0",
      detections: [],
      findings: [],
    }),
  );
});
