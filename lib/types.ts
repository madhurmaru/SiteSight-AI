import type { Prisma } from "@prisma/client";
export const projectInclude = {
  zones: true,
  milestones: {
    include: {
      zone: true,
      updates: { include: { media: { select: { inspectionId: true } } } },
    },
  },
  memberships: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
} as const;
export type ProjectData = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
}>;
export type InspectionData = Prisma.InspectionGetPayload<{
  include: {
    zone: true;
    media: { include: { detections: true } };
    findings: { include: { decisions: true } };
    job: true;
  };
}>;
export type FindingData = InspectionData["findings"][number] & {
  inspectionTitle?: string;
  zone?: string;
  captureTime?: string;
};
export type ReportData = Prisma.ReportGetPayload<{
  include: { versions: true };
}>;
export type StateData = {
  project: ProjectData;
  role: string;
  inspections: InspectionData[];
  findings: FindingData[];
  reports: ReportData[];
  audits: Prisma.AuditEventGetPayload<object>[];
  notifications: Prisma.NotificationGetPayload<object>[];
};
export type SessionData = {
  user: { id: string; name: string; email: string };
  mode: string;
  projects: { id: string; name: string; memberships: { role: string }[] }[];
};
