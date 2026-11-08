import { runOneJob } from "../lib/jobs";
async function main() {
  console.log("SiteSight durable queue worker started");
  for (;;) {
    if (!(await runOneJob())) await new Promise((r) => setTimeout(r, 1500));
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
