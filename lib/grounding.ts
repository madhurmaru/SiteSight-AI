import { z } from "zod";
import { validateCitations } from "./domain";

export const numericFactSchema = z.object({
  value: z.number().finite(),
  unit: z.enum(["percent", "count"]),
  sourceRecordId: z.string().min(1).max(160),
});

export const groundedClaimSchema = z.object({
  text: z.string().min(1).max(900),
  type: z.enum(["verified", "proposal", "unknown", "recommendation"]),
  evidenceIds: z.array(z.string().min(1).max(160)).min(1).max(8),
  sourceRecordIds: z.array(z.string().min(1).max(160)).min(1).max(8),
  verification: z.enum([
    "verified",
    "confirmed",
    "reviewed",
    "proposed",
    "unknown",
    "suggestion",
  ]),
  limitations: z.string().min(1).max(600),
  numericFacts: z.array(numericFactSchema).max(8).default([]),
});

export const providerOutputSchema = z.object({
  claims: z.array(groundedClaimSchema).max(12),
});

export type GroundedClaim = z.infer<typeof groundedClaimSchema>;
export type NumericFact = z.infer<typeof numericFactSchema>;

export type GroundingRecord = {
  id: string;
  kind:
    | "finding"
    | "progress-update"
    | "comparison"
    | "approved-report"
    | "inspection-summary"
    | "workspace-summary";
  text: string;
  evidenceIds: string[];
  verification: "verified" | "proposed" | "unknown";
  version: string;
  numericFacts: Omit<NumericFact, "sourceRecordId">[];
};

export type RecordCitation = {
  id: string;
  kind: GroundingRecord["kind"];
  label: string;
  href: string;
};

const textNumbers = (text: string) =>
  [...text.matchAll(/(?<![A-Za-z0-9_-])-?\d+(?:\.\d+)?/g)].map((m) =>
    Number(m[0]),
  );

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 0.001;

export function validateGroundedClaims(
  claims: GroundedClaim[],
  records: GroundingRecord[],
  authorisedEvidence: string[],
  approved = false,
) {
  validateCitations(
    claims.filter((claim) => claim.evidenceIds.length > 0),
    authorisedEvidence,
  );
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const claim of claims) {
    const cited = claim.sourceRecordIds.map((id) => byId.get(id));
    if (cited.some((record) => !record))
      throw new Error("Invalid source record citation");
    const sourceRecords = cited as GroundingRecord[];
    if (
      !claim.evidenceIds.length &&
      sourceRecords.some(
        (record) =>
          record.kind !== "workspace-summary" &&
          record.kind !== "inspection-summary",
      )
    )
      throw new Error("Operational claims require an evidence citation");
    const supportedEvidence = new Set(
      sourceRecords.flatMap((record) => record.evidenceIds),
    );
    if (claim.evidenceIds.some((id) => !supportedEvidence.has(id)))
      throw new Error("Evidence is not supported by the cited records");
    if (
      claim.type === "verified" &&
      sourceRecords.some((record) => record.verification !== "verified")
    )
      throw new Error("Unverified records cannot support a verified claim");
    if (
      claim.type === "proposal" &&
      !sourceRecords.some((record) => record.verification === "proposed")
    )
      throw new Error("Proposal claim has no proposed source record");
    if (
      claim.type === "unknown" &&
      !sourceRecords.some((record) => record.verification === "unknown")
    )
      throw new Error("Unknown claim has no unknown source record");
    if (claim.type === "recommendation" && claim.verification !== "suggestion")
      throw new Error("Recommendations must be labelled as suggestions");
    if (approved && claim.type !== "verified")
      throw new Error("Approved reports can contain only verified claims");

    for (const fact of claim.numericFacts) {
      if (!claim.sourceRecordIds.includes(fact.sourceRecordId))
        throw new Error("Numerical fact cites an unrelated source record");
      const record = byId.get(fact.sourceRecordId)!;
      if (
        !record.numericFacts.some(
          (allowed) =>
            allowed.unit === fact.unit && sameNumber(allowed.value, fact.value),
        )
      )
        throw new Error("Unsupported numerical claim");
    }
    const declared = claim.numericFacts.map((fact) => fact.value);
    if (
      textNumbers(claim.text).some(
        (value) => !declared.some((candidate) => sameNumber(value, candidate)),
      )
    )
      throw new Error("Numerical text is missing a validated source fact");
  }
  return claims;
}

export function citationForRecord(
  projectId: string | null,
  record: GroundingRecord,
): RecordCitation {
  const rawId = record.id.slice(record.kind.length + 1);
  return {
    id: record.id,
    kind: record.kind,
    label:
      record.kind === "workspace-summary"
        ? "Workspace summary"
        : record.kind === "inspection-summary"
          ? "Inspection summary"
          : record.kind === "approved-report"
            ? "Approved report record"
            : record.kind === "progress-update"
              ? "Milestone update record"
              : record.kind === "comparison"
                ? "Comparison record"
                : "Finding record",
    href:
      record.kind === "workspace-summary"
        ? `/api/ask/records/workspace-summary/${encodeURIComponent(rawId)}`
        : `/api/projects/${encodeURIComponent(projectId || "")}/records/${record.kind}/${encodeURIComponent(rawId)}`,
  };
}

export function sourceRecordVersions(records: GroundingRecord[]) {
  return records.map(({ id, kind, version }) => ({ id, kind, version }));
}

export const groundedOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", maxLength: 900 },
          type: {
            type: "string",
            enum: ["verified", "proposal", "unknown", "recommendation"],
          },
          evidenceIds: {
            type: "array",
            minItems: 0,
            maxItems: 8,
            items: { type: "string" },
          },
          sourceRecordIds: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          verification: {
            type: "string",
            enum: [
              "verified",
              "confirmed",
              "reviewed",
              "proposed",
              "unknown",
              "suggestion",
            ],
          },
          limitations: { type: "string", maxLength: 600 },
          numericFacts: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                value: { type: "number" },
                unit: { type: "string", enum: ["percent", "count"] },
                sourceRecordId: { type: "string" },
              },
              required: ["value", "unit", "sourceRecordId"],
            },
          },
        },
        required: [
          "text",
          "type",
          "evidenceIds",
          "sourceRecordIds",
          "verification",
          "limitations",
          "numericFacts",
        ],
      },
    },
  },
  required: ["claims"],
} as const;
