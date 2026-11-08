import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { db } from "./db";
import { readMedia, putMedia } from "./storage";
const exec = promisify(execFile);
export async function probeVideo(bytes: Buffer) {
  const dir = await mkdtemp(path.join(tmpdir(), "sitesight-probe-"));
  try {
    const file = path.join(dir, "upload");
    await writeFile(file, bytes);
    const { stdout } = await exec(
      process.env.PYTHON_BIN || "python3",
      [path.join(process.cwd(), "worker/media.py"), "probe", file],
      { timeout: 20000, maxBuffer: 1024 * 1024 },
    );
    return JSON.parse(stdout) as {
      duration: number;
      width: number;
      height: number;
    };
  } catch {
    throw new Error(
      "Invalid video: supported MP4/MOV/WebM, maximum 60 seconds and 4K. Python and ffprobe must be installed.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function extractFrames(media: {
  id: string;
  key: string;
  inspectionId: string;
}) {
  const existing = await db.media.findMany({ where: { sourceId: media.id } });
  if (existing.length) return existing;
  const dir = await mkdtemp(path.join(tmpdir(), "sitesight-frames-"));
  try {
    const file = path.join(dir, "video");
    await writeFile(file, await readMedia(media.key));
    const { stdout } = await exec(
      process.env.PYTHON_BIN || "python3",
      [
        path.join(process.cwd(), "worker/media.py"),
        "extract",
        file,
        path.join(dir, "frames"),
      ],
      { timeout: 90000, maxBuffer: 1024 * 1024 },
    );
    const output = JSON.parse(stdout) as {
      frames: {
        path: string;
        timestamp: number;
        selection: string;
        sampleIndex: number;
      }[];
      limitation: string;
    };
    const frames = [];
    for (const f of output.frames) {
      const bytes = await readFile(f.path),
        info = await sharp(bytes).metadata(),
        id = media.id + "-frame-" + f.sampleIndex,
        key = id + ".jpg";
      await putMedia(key, bytes, "image/jpeg");
      frames.push(
        await db.media.upsert({
          where: { id },
          update: {},
          create: {
            id,
            inspectionId: media.inspectionId,
            sourceId: media.id,
            key,
            mime: "image/jpeg",
            width: info.width!,
            height: info.height!,
            timestamp: f.timestamp,
            metadata: JSON.stringify({
              selection: f.selection,
              limitation: output.limitation,
            }),
            fixture: false,
          },
        }),
      );
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
