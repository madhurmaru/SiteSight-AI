# SiteSight AI

A persistent construction inspection MVP: create a project, capture evidence, review an aggregate AI summary, add an optional human observation, approve the inspection's report and export its PDF.

**AI detects and explains. Engineers verify and decide.** Visible work does not certify quality, and image detection does not measure completion.

## Run the complete local workspace

Requirements: Node.js 22+, npm, Python 3.11+, and FFmpeg/ffprobe for videos. The fixture image workflow does not require Docker, an API key or detector weights.

```sh
npm ci
npm run db:setup
npm run dev
```

In another terminal:

```sh
npm run worker
```

Open **http://127.0.0.1:3001** for the SiteSight product landing page. Select **Open workspace** to sign in. `db:setup` creates `.env` from `.env.example` if absent, applies the SQLite migration, generates the bundled original illustrations and seeds the sample project. The worker must stay running; jobs survive web/worker restarts.

Workspace sections use direct, reload-safe URLs: `/dashboard`, `/projects`, `/projects/summary`, `/inspections`, `/inspections/:id`, `/progress`, `/reports`, `/ask` and `/settings`. Landing-page project and inspection actions preserve their intent through sign-in and open the corresponding creation form.

| Sample account           | Password       | Project role   |
| ------------------------ | -------------- | -------------- |
| admin@sitesight.local    | SiteSight2026! | Admin          |
| engineer@sitesight.local | SiteSight2026! | Engineer       |
| safety@sitesight.local   | SiteSight2026! | Safety officer |
| viewer@sitesight.local   | SiteSight2026! | Viewer         |

The Settings role switcher signs into these separate accounts and exists only in local fixture mode. **Settings → Restore sample project → Restore fixtures** resets only fictional Riverside Heights records. Do not deploy the sample accounts as a real project.

### Local walkthrough

1. Sign in as admin. The project begins at **58.75% verified progress**: `(25×100 + 35×65 + 25×35 + 15×15) / 100`.
2. New inspection → select a zone, capture time and viewpoint → keep **Use bundled synthetic fixture evidence** checked → Upload & analyse.
3. Open the inspection after processing. Toggle overlays, filter classes/confidence, zoom and drag the image. The right panel shows aggregate object, worker, PPE, potential-violation and unable-to-assess counts; raw model findings remain internal audit data.
4. Add an optional human observation and choose **Complete inspection & create report**. This creates the inspection's single report draft without item-by-item finding review.
5. Open Reports, inspect the cited draft → Submit for approval → Approve report → Export PDF.
6. Ask SiteSight about the current project or a selected inspection. Project and inspection answers retrieve report snapshots; overall workspace questions retrieve authorised database totals.
7. Sign in as viewer. Only approved report versions and the evidence linked to them are returned by the server.

Bundled detections and media are synthetic, explicit fixtures. Uploaded real media is accepted and privately persisted, but **never receives fixture analysis**. With `INFERENCE_ADAPTER=worker`, the same local SQLite database and private filesystem storage send the normalised review image to the Python service over an authenticated server-to-server request. Without configured weights its job fails with setup guidance, retaining media for manual review. Video frames are sampled even when downstream inference is unavailable.

After upgrading an existing database, run `npm run db:backfill-reports` once. It creates one draft for each already-reviewed inspection that has no linked report and is idempotent; it never changes an approved report.

## Run a real local image inspection

The pinned PPE configuration is reproducible but its licences still need review for the intended deployment. It combines PPE-specific weights with a separate COCO person detector because the PPE model's `Person` class did not reliably cover the audit images.

```sh
python3 -m venv worker/.venv
worker/.venv/bin/pip install -r worker/requirements.txt
npm run models:download
```

Keep `APP_MODE=demo` to retain SQLite and local private media. Add these values to `.env`, replacing the secret with a long local value:

```dotenv
INFERENCE_ADAPTER=worker
INFERENCE_URL=http://127.0.0.1:8001
WORKER_SECRET=replace-with-a-long-random-local-secret
DETECTOR_WEIGHTS=worker/models/ppe-compliance-yolov8-a427495.pt
WORKER_DETECTOR_WEIGHTS=worker/models/yolov8n-coco-person.pt
WORKER_CLASS_NAME=person
DETECTOR_NAME=PPE Compliance YOLOv8n + YOLOv8n COCO person
DETECTOR_VERSION=ppe-a427495+coco-v8.3.0
DETECTOR_SOURCE=innovativeskipper/ppe-compliance-yolov8 + Ultralytics yolov8n COCO
DETECTOR_LICENSE=MIT model card; training dataset CC BY 4.0
DETECTOR_RUNTIME_LICENSE=Ultralytics AGPL-3.0 or Enterprise
```

Start three processes after the web server:

```sh
npm run worker:inference
npm run worker
```

Upload a JPEG, PNG or WebP without selecting bundled fixture evidence. The durable job will move through preprocessing and detection, then persist the model/version/provenance, raw detector classes, confidence scores and normalised boxes. The UI presents aggregate results and preserves raw findings internally for provenance. The local worker receives the private image as bounded base64; connected S3 mode uses a short-lived authorised URL.

## Working features

- Project creation/editing, zones, weighted milestones, membership role editing, project switching.
- Password authentication using bcrypt, random opaque server-side sessions, HTTP-only cookies, same-origin mutation checks and a basic login limiter.
- Project-scoped server permissions on queries, mutations, job controls, evidence and PDFs.
- Multiple images or a short video; bounded upload size, decoded image validation, FFprobe video validation, EXIF-normalised review images and privately retained originals.
- Durable SQL queue with leases, retries, cancellation, stage/status/error display and deterministic idempotency keys.
- Real licensed-weight adapter with pinned checksums, EXIF-normalised inference, normalised annotations, worker/PPE association, aggregate inspection summaries and preserved original output.
- Same-zone visual comparison, viewpoint warnings and reviewer-authored observations.
- Engineer progress updates, weighted analytics, linear schedule baseline labelling, reviewed PPE denominators and unknown exclusions.
- One report record per completed inspection. Drafts can be submitted and approved; the approved snapshot is immutable. PDFs include analysis counts, the human observation, evidence images, page numbers and provenance.
- Unified authorised Q&A that automatically distinguishes general conversation from workspace, project and inspection questions; record-based answers include clickable citations and use the server-side Groq adapter.
- Notifications, audit events, mobile layouts, native accessible forms/dialogs and reduced-motion support.

## Connected mode

Local fixture mode uses SQLite plus private filesystem storage without external credentials. Connected mode uses the **same Prisma entity model on PostgreSQL**, private S3-compatible storage, a queue process and Python inference. Migration histories are separate; they are not an automatic SQLite-to-PostgreSQL data transfer.

1. Copy `.env.example` to `.env`. Set `APP_MODE=connected`, PostgreSQL `DATABASE_URL` and exact public `APP_ORIGIN`.
2. Fill `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`. Start Docker Desktop, then `docker compose up -d postgres minio`.
3. Create a **private** `sitesight-private` bucket using MinIO Console at http://localhost:9001. Create a scoped application access key and put it in `S3_ACCESS_KEY`/`S3_SECRET_KEY`. Never enable anonymous bucket reads.
4. Configure `S3_ENDPOINT` for server access. Set `S3_PUBLIC_ENDPOINT` to a browser-reachable endpoint for signed download URLs. URLs expire after 60 seconds. In the Compose network, the server uses `http://minio:9000`; the browser uses `http://localhost:9000` in local development.
5. Generate/apply the PostgreSQL schema:

```sh
npx prisma generate --schema prisma/pg/schema.prisma
npx prisma migrate deploy --schema prisma/pg/schema.prisma
```

6. Provision an account in a trusted terminal. Set `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` (12+ characters) in the process environment, then run `node --env-file=.env --import tsx scripts/create-user.ts`. The script never logs the password. Sign in and create your first project. There is no public signup or billing.
7. Supply licensed detector weights, class map, provenance and `WORKER_SECRET` as described in [model integration](docs/MODELS.md). Start the Python service and the SQL queue worker.
8. Start the web app. For a local production build: `npm run build && npm run start`. For all container services: `docker compose --profile connected up --build`.

`prisma/pg/schema.prisma` must be generated before using PostgreSQL. To return to local fixture mode, restore `APP_MODE=demo` and `DATABASE_URL=file:./demo.db`, then run `npx prisma generate` and `npm run db:setup`.

### Groq language model provider

Create a Groq API key and keep it server-side. SiteSight uses Groq's OpenAI-compatible chat-completions endpoint:

```dotenv
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_your_private_key
LLM_MODEL=openai/gpt-oss-20b
```

Restart the web process, then open Ask SiteSight or select **Generate draft wording with the configured model provider** when creating a report. SiteSight routes greetings, general knowledge and ordinary advice to a plain Groq chat request, so the model can answer from its own knowledge without receiving project records. Questions that mention projects, inspections, reports, PPE, violations, progress or other stored records use the evidence-grounded path. For Groq GPT-OSS, grounded requests use JSON-object mode and SiteSight validates citations and every numerical claim on the server. SiteSight sends bounded structured records only when the question needs them, never images or member details. The token never enters browser responses or logs.

`LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES`, and `LLM_MAX_OUTPUT_TOKENS` are bounded in code to 3–60 seconds, 0–2 retries, and 64–2400 output tokens; increasing them cannot fix an unsupported model, invalid key or exhausted quota.

Every returned claim must cite authorised evidence and versioned source records. SiteSight rejects fabricated citations, cross-project references, unsupported numbers and verified claims backed by unverified sources. Provider drafts remain drafts; proposals, unknown assessments and recommendations are separated from client-facing verified claims. Provider failure is explicit and never silently substitutes deterministic text.

Without a key, Q&A and report generation use the explicitly labelled deterministic record path. Legacy `HF_*` variables remain accepted for backwards compatibility, but the documented localhost configuration uses Groq through `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL`.

Ask SiteSight uses one conversational input and automatically chooses the general or record-grounded path. General conversation can use the model's own knowledge but cannot claim access to project facts. Workspace totals and current-project inspection report snapshots are retrieved under the signed-in user's permissions; viewers receive approved reports only. Short follow-ups remain grounded after a cited answer. If Groq is rate-limited or its grounded wording fails validation, SiteSight shows the authorised record excerpts directly when records are available. The browser sends the active conversation for follow-up context. This history is held only in component memory, is not written to the database, and clears when the user leaves or refreshes the page.

Groq free-tier HTTP `429` responses are provider rate limits. Increasing `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES` or `LLM_MAX_OUTPUT_TOKENS` does not increase the account quota. Plain general chat uses a smaller request than grounded Q&A, and retries are intentionally bounded to avoid making rate limits worse.

The structured immutable report snapshot is the canonical chatbot source. The PDF is a presentation rendering of that same snapshot, so runtime Q&A does not re-parse its own PDF and risk losing citation or number structure. PDF text extraction and rendered-page inspection are used in verification to ensure the export matches the snapshot.

## Validation

Start the web server, then:

```sh
npm run typecheck
npm run lint
npm test
npm run test:python
npm run test:real-inference
npm run test:detection-eval
npm run test:e2e
npm run build
```

The Playwright suite exercises the real HTTP API and persisted database, not mocked handlers. It covers the complete workflow, PDF parsing, role isolation, invalid uploads, CSRF, retry deduplication and frozen versions. UI flows are separately exercised in the browser at desktop/mobile widths. Tests add clearly named acceptance records; restore the sample records afterwards if desired.

See [verification results](docs/VERIFICATION.md), [architecture and permissions](docs/ARCHITECTURE.md) and [deployment guidance](docs/DEPLOYMENT.md).

## Locked stack

The committed npm lockfile records the tested versions: Next.js **16.4.3**, React **19.3.1**, TypeScript **5.9.3**, Tailwind **4.3.3**, Prisma Client/CLI **6.19.0**, Recharts **3.10.1**, Sharp **0.35.5**, Playwright **1.64.1**. Prisma 6 is deliberately pinned to keep the SQLite/PostgreSQL schema and classic migration workflow consistent. Patched `effect` and `deepmerge-ts` overrides address transitive tooling advisories. The real local workflow was tested with Python **3.11.16**, Ultralytics **8.4.193**, FastAPI **0.135.1**, Pillow **12.1.1** and the exact weight hashes in [model integration](docs/MODELS.md).

## Known boundaries

- The real detector was exercised with local SQLite and private filesystem storage. Docker PostgreSQL/MinIO and an external LLM provider were not exercised; their adapters remain integration code rather than validated deployments.
- No live cameras, structural certification, automatic completion measurement, tracking of unique people, billing or public signup.
- No production accuracy claim: the count audit and nine-image IoU evaluation are both small and close to the model's source domain. The IoU evaluation reports class-aware one-to-one matched precision and recall at IoU 0.5; it does not calculate AP or mAP. Weights and evaluation images are downloaded/local artefacts and are not committed.
- Worker observations are separate samples. Temporal identity/grouping across video frames is not implemented. Metrics say **observations**, never unique workers.
- Resolution evidence is a required free-text inspection/document reference; it is not automatically verified as proof of resolution.
- Registered users can be added by email and assigned project roles in Settings; new connected accounts are provisioned by the trusted CLI. Full invitation/recovery/SSO administration is outside this academic implementation.
- Local SQL sessions and bcrypt authentication are implemented directly; production identity federation and account recovery are not implemented. Rate limiting is per-process; use a shared ingress limiter for multiple instances.
- Sample restoration removes database records but retains unreferenced private fixture files. Production storage retention/orphan cleanup and malware scanning are not implemented.
- Approved reports export the first eight cited images to keep PDF size bounded; all evidence IDs remain in the report body. Original video is retained; exports include sampled images, not playable video.
- Workspace navigation has direct, reload-safe URLs while sharing one permission-aware client shell.

Fixture media is original generated SVG artwork rasterised at seed time, dedicated to CC0; see [media attribution](docs/MEDIA.md).
