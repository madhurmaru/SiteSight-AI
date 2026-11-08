import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { readMedia } from "./storage";
import type { Claim } from "./reports";
type Snapshot = {
  period: string;
  author: string;
  claims: Claim[];
  progress: { name: string; completion: number }[];
  limitations: string[];
  followUp: string[];
  inspectionSummary?: {
    title: string;
    zone: string;
    captureTime: string;
    evidenceCount: number;
    detectionCount: number;
    classCounts: Record<string, number>;
    potentialViolations: number;
    unableToAssess: number;
    humanObservation: string;
    modelNotice: string;
  };
};
export async function renderReport(input: {
  title: string;
  project: string;
  version: number;
  versionId: string;
  approvedAt: Date;
  approvedBy: string;
  model: string;
  promptVersion: string;
  content: Snapshot;
  evidence: { id: string; key: string; fixture: boolean; mime: string }[];
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.12, 0.21, 0.27),
    grey = rgb(0.38, 0.46, 0.51),
    orange = rgb(0.85, 0.43, 0.22);
  let page = pdf.addPage([595, 842]),
    y = 762;
  const clean = (s: string) =>
    s.replace(/[–—]/g, "-").replace(/[^\x20-\x7e]/g, " ");
  const header = () => {
    page.drawRectangle({ x: 0, y: 800, width: 595, height: 42, color: navy });
    page.drawText("SITESIGHT AI", {
      x: 48,
      y: 816,
      size: 11,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("APPROVED INSPECTION RECORD", {
      x: 335,
      y: 817,
      size: 8,
      font,
      color: rgb(0.76, 0.83, 0.86),
    });
    page.drawRectangle({ x: 48, y: 780, width: 30, height: 3, color: orange });
  };
  header();
  const newPage = () => {
    page = pdf.addPage([595, 842]);
    y = 762;
    header();
  };
  const space = (height: number) => {
    if (y - height < 72) newPage();
  };
  const line = (text: string, size = 10, strong = false) => {
    let row = "";
    const use = strong ? bold : font;
    for (const word of clean(text).split(" ")) {
      if (use.widthOfTextAtSize(row + " " + word, size) > 495) {
        space(size + 7);
        page.drawText(row, {
          x: 48,
          y,
          size,
          font: use,
          color: strong ? navy : grey,
        });
        y -= size + 7;
        row = word;
      } else row += (row ? " " : "") + word;
    }
    space(size + 7);
    page.drawText(row, {
      x: 48,
      y,
      size,
      font: use,
      color: strong ? navy : grey,
    });
    y -= size + 12;
  };
  const heading = (text: string) => {
    space(70);
    y -= 8;
    line(text, 13, true);
  };
  line(input.title, 23, true);
  line(input.project, 12, true);
  line(
    `Version ${input.version} | Approved ${input.approvedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    9,
  );
  line(
    `Period: ${input.content.period} | Author: ${input.content.author} | Approver: ${input.approvedBy}`,
    9,
  );
  if (input.content.inspectionSummary) {
    const summary = input.content.inspectionSummary;
    heading("Inspection analysis summary");
    line(`${summary.zone} | ${summary.evidenceCount} evidence items`, 10, true);
    line(
      `${summary.detectionCount} detected objects | ${summary.classCounts.worker || 0} workers | ${summary.classCounts.helmet || 0} helmets | ${summary.classCounts.vest || 0} safety vests`,
      10,
    );
    line(
      `${summary.potentialViolations} potential PPE violations | ${summary.unableToAssess} unable to assess`,
      10,
    );
    line(summary.modelNotice, 8);
    heading("Human observation");
    line(
      summary.humanObservation ||
        "No additional human observation was recorded for this inspection.",
      10,
    );
  }
  heading("Verified observations");
  for (const [n, c] of input.content.claims.entries()) {
    space(65);
    line(`${n + 1}. ${c.text}`, 10);
    line(`Evidence: ${c.evidenceIds.join(", ")}`, 8);
    line(c.limitations, 8);
  }
  heading("Verified milestone progress");
  if (!input.content.progress.length)
    line("No verified milestone updates fall within this report period.", 9);
  else {
    space(30);
    page.drawRectangle({
      x: 48,
      y: y - 9,
      width: 499,
      height: 25,
      color: rgb(0.94, 0.96, 0.97),
    });
    page.drawText("MILESTONE", { x: 58, y, size: 9, font: bold, color: navy });
    page.drawText("VERIFIED COMPLETION", {
      x: 410,
      y,
      size: 8,
      font: bold,
      color: navy,
    });
    y -= 31;
    for (const m of input.content.progress) {
      space(30);
      page.drawText(clean(m.name).slice(0, 65), {
        x: 58,
        y,
        size: 10,
        font,
        color: grey,
      });
      page.drawText(`${m.completion}%`, {
        x: 470,
        y,
        size: 10,
        font: bold,
        color: navy,
      });
      page.drawLine({
        start: { x: 48, y: y - 10 },
        end: { x: 547, y: y - 10 },
        thickness: 0.5,
        color: rgb(0.87, 0.9, 0.92),
      });
      y -= 29;
    }
  }
  heading("Limitations and recommended follow-up");
  for (const l of [...input.content.limitations, ...input.content.followUp])
    line("- " + l, 9);
  heading("Provenance");
  line(`Model / source: ${input.model}`, 9);
  line(
    `Template: ${input.promptVersion} | Immutable version ID: ${input.versionId}`,
    8,
  );
  for (const evidence of input.evidence
    .filter((m) => !m.mime.startsWith("video/"))
    .slice(0, 8)) {
    newPage();
    line("Supporting evidence", 17, true);
    line("Reference: " + evidence.id, 9);
    const bytes = await readMedia(evidence.key);
    const img = await pdf.embedJpg(await sharp(bytes).jpeg().toBuffer());
    const height = Math.min(560, (499 * img.height) / img.width);
    page.drawImage(img, { x: 48, y: y - height, width: 499, height });
    y -= height + 23;
    line(
      evidence.fixture
        ? "Synthetic fixture illustration - original SiteSight artwork, CC0."
        : "Private uploaded inspection evidence. Original stored separately when normalised.",
      9,
    );
    line(
      "Evidence supports the recorded observation only. It does not certify engineering quality.",
      9,
    );
  }
  pdf.getPages().forEach((p, n) => {
    p.drawLine({
      start: { x: 48, y: 45 },
      end: { x: 547, y: 45 },
      thickness: 0.5,
      color: rgb(0.85, 0.89, 0.91),
    });
    p.drawText(`SiteSight AI | ${clean(input.project)}`, {
      x: 48,
      y: 29,
      size: 8,
      font,
      color: grey,
    });
    p.drawText(`Page ${n + 1} of ${pdf.getPageCount()}`, {
      x: 480,
      y: 29,
      size: 8,
      font,
      color: grey,
    });
  });
  pdf.setTitle(input.title);
  pdf.setAuthor(input.content.author);
  pdf.setProducer("SiteSight AI / approved snapshot exporter v1");
  return new Uint8Array(await pdf.save());
}
