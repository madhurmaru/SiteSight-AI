ALTER TABLE "Inspection" ADD COLUMN "humanObservation" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Report" ADD COLUMN "inspectionId" TEXT REFERENCES "Inspection"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "Report_inspectionId_key" ON "Report"("inspectionId");
