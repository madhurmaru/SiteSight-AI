import fs from "node:fs/promises";
const base = "http://127.0.0.1:3001";
const auth = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@sitesight.local",
    password: "SiteSight2026!",
  }),
});
if (!auth.ok) throw new Error("Sample account sign-in failed");
const cookie = auth.headers.get("set-cookie").split(";")[0];
const pdf = await fetch(
  base + "/api/projects/riverside/reports/report-approved/pdf",
  { headers: { Cookie: cookie } },
);
if (!pdf.ok) throw new Error("PDF export failed");
await fs.mkdir("output/pdf", { recursive: true });
await fs.writeFile(
  "output/pdf/sitesight-approved-demo.pdf",
  Buffer.from(await pdf.arrayBuffer()),
);
console.log("Approved PDF exported successfully");
