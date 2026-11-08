import { z } from "zod";
export const boxSchema = z
  .tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().positive().max(1),
    z.number().positive().max(1),
  ])
  .refine(
    ([x, y, w, h]) => x + w <= 1.001 && y + h <= 1.001,
    "Box exceeds image",
  );
export const inferenceSchema = z.object({
  model: z.string(),
  version: z.string(),
  provenance: z.record(z.string(), z.unknown()),
  detections: z.array(
    z.object({
      id: z.string(),
      class: z.enum(["worker", "helmet", "vest", "no-helmet", "no-vest"]),
      rawClass: z.string(),
      confidence: z.number().min(0).max(1),
      box: boxSchema,
      workerId: z.string().nullable(),
    }),
  ),
  findings: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      assessment: z.enum(["present", "missing", "unknown"]),
      title: z.string(),
      workerId: z.string().nullable(),
      original: z.string(),
    }),
  ),
});
export function validateUploadCount(files: { size: number; type: string }[]) {
  if (!files.length || files.length > 20)
    throw new Error("Upload 1–20 images or one video");
  if (
    files.some((f) => f.size > 100 * 1024 * 1024) ||
    files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024
  )
    throw new Error("Maximum inspection upload is 100 MB");
  if (files.some((f) => f.type.startsWith("video/")) && files.length !== 1)
    throw new Error("Videos must be uploaded individually");
}
