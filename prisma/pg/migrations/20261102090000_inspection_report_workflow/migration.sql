ALTER TABLE "Inspection" ADD COLUMN "humanObservation" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Report" ADD COLUMN "inspectionId" TEXT;
CREATE UNIQUE INDEX "Report_inspectionId_key" ON "Report"("inspectionId");
ALTER TABLE "Report" ADD CONSTRAINT "Report_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
