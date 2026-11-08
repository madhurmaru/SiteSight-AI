# Architecture and invariants

Next.js serves the workspace and a project-scoped API. Prisma persists relational records. The runnable local fixture environment uses SQLite; connected deployments generate the PostgreSQL schema. Both schemas describe users, sessions, memberships, projects, zones, milestones, progress updates, inspections, media/frames, jobs, detections, findings, decisions, evidence links, reports/versions, notifications and audit events.

A separate lightweight Node process polls SQL jobs. This keeps processing out of request lifetimes without introducing Redis. Jobs are claimed using compare-and-swap on state/updatedAt, have a heartbeat lease, and can be reclaimed after two minutes. The queue invokes a Python FFmpeg helper for video sampling and the authenticated Python detector service for real inference. Outputs have stable evidence-scoped IDs and are upserted in a transaction. Retries preserve reviewed findings and original outputs. Cancellation suppresses completion writes; already-running model requests may finish before cancellation is observed.

## Storage and security

Media never lives under `public/`. Fixture evidence is served through a session-authorised route. Connected requests first authorise the evidence, then redirect to a 60-second S3 signed URL. Viewer evidence access requires a link from an approved report version. Provider/worker credentials remain server-only. Logs contain error classes or service-level failures, never keys or uploaded prompt content.

Uploads are stream-bounded to 101 MB including multipart overhead, then validated to a 100 MB payload total. Images must decode as JPEG, PNG or WebP and are limited to 40 megapixels. Orientation is normalised for consistent boxes, while originals are privately retained. Videos are decoded with ffprobe, limited to 60 seconds and 4K, and sampled into at most 12 frames (default 8). Uniform sample timestamps and limitations are persisted.

Passwords use bcrypt with cost 12. Session cookie tokens are 256-bit random; only their SHA-256 digests are stored. Sessions expire after 24 hours, and logout deletes the server session. Production cookies are secure, HTTP-only and SameSite=Lax. Mutations check the configured origin or request host. A per-account process-local limiter bounds sign-in attempts. Deploy with TLS and shared rate limiting.

## Project permission matrix

| Action                                    | Admin | Engineer | Safety officer | Viewer |
| ----------------------------------------- | ----: | -------: | -------------: | -----: |
| Manage project/zones/milestones/members   |   Yes |       No |             No |     No |
| Upload/retry/cancel inspections           |   Yes |      Yes |             No |     No |
| Enter progress and compare evidence       |   Yes |      Yes |             No |     No |
| Verify/correct/manual PPE, resolve/reopen |   Yes |       No |            Yes |     No |
| Generate/approve daily reports            |   Yes |      Yes |             No |     No |
| Generate/approve safety reports           |   Yes |       No |            Yes |     No |
| Read operational inspections              |   Yes |      Yes |            Yes |     No |
| Read approved reports and cited media     |   Yes |      Yes |            Yes |    Yes |

Viewers receive no inspection objects, findings, audit trail or live milestone records. Their Q&A retrieves only approved snapshots. Project existence alone never grants access. Administrative access is per project, not a global bypass.

## Verification, resolution and reports

`verification`: proposed / confirmed / rejected. `resolution`: open / in progress / resolved. Verification does not close a finding. Only confirmed findings may change resolution. Every review decision stores its author, previous state and comment. Corrections have separate fields; original detector JSON is retained.

Progress is always engineer-entered, 0–100%, with supporting media in the same project and a reason. Previous values, actor and timestamps are audited. Weighted verified progress is `sum(weight * completion) / sum(weight)`. Missing/zero total returns unavailable. New weights must be positive. Planned progress is a clamped linear schedule assumption, separately labelled.

PPE percentage groups assessments by media + worker observation. All component assessments must be reviewed and assessable. Unknown, rejected and proposed observations are excluded. A worker is counted as PPE-present only if all assessable components appear present. Manual observations without a worker association do not establish unique-worker identity. Frame observations can repeat people.

Report generation copies reviewed records into a JSON snapshot and stores evidence links and template/model provenance. Approval freezes that version. Later progress changes do not alter it. The API only allows a new version, never editing an approved one. Privileged database operators remain responsible for DB access controls and backups. UTC date filters define capture periods; progress is the latest stored verified update at or before period end.

## AI boundary

The fixture adapter is selected only by explicit `INFERENCE_ADAPTER=fixture`, defaults to local fixture mode, and only accepts media marked as bundled fixtures by the server. Real uploaded media cannot set this flag. `INFERENCE_ADAPTER=worker` can be used with the local SQLite/private-filesystem stack or connected PostgreSQL/S3; inference and infrastructure mode are independent. The worker adapter validates provenance, raw classes, output schema, normalised box bounds and evidence-scoped IDs. Missing PPE is a proposal. Unsupported model classes, small/occluded workers and low visibility are unknown.

Language-model retrieval is scoped by project and role before invocation. Viewers retrieve only approved report snapshots and their linked evidence. Versioned records are passed as bounded untrusted JSON data beneath system instructions; inspection notes and questions cannot override those instructions. Images, member emails and passwords are never sent.

The Groq adapter requests a compact JSON object containing answer text and exact source-record IDs. SiteSight derives evidence IDs, verification status and numerical facts from those authorised records rather than trusting model-supplied labels. Server validation then checks project ownership, record-to-evidence relationships, verification status and every numerical fact. Source record versions are frozen on each report version. Approved reports can contain only verified claims; provider wording remains a draft until the normal submit/approve transition. Citation existence does not prove semantic entailment, so human approval remains required. No vector index is needed for the implemented database-record questions.
