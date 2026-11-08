# Deployment

Deploy four process/service roles: Next.js web, PostgreSQL, private S3-compatible storage, and a background queue process with the Python detector service. The web and queue use the same Prisma client and database. Python can run on CPU for a small academic trial or on a separately provisioned GPU host.

## Local Docker

`compose.yaml` starts PostgreSQL 16 and MinIO by default. The `connected` profile additionally builds web, queue and Python inference images. Set the required environment values first; `docker compose config` intentionally fails if passwords are blank. The bucket is created privately by the operator, never automatically made public.

The web image applies PostgreSQL migrations before starting. Provision at least one user via `scripts/create-user.ts`. There is no connected-mode seed or anonymous signup. Map licensed weights read-only into `/weights`. Keep `WORKER_SECRET` out of client code, source control and logs.

## Hosted deployment

1. Provision managed PostgreSQL and back it up. Use a dedicated app account; do not expose the database port publicly.
2. Provision a private bucket with encryption, retention policy and narrowly scoped credentials. Configure internal/public storage endpoints consistently for presigned URLs.
3. Build with `npx prisma generate --schema prisma/pg/schema.prisma` and `npm run build`. Run migrations as a controlled release step.
4. Deploy `npm run start` behind HTTPS, setting `APP_MODE=connected`, exact `APP_ORIGIN`, database and storage variables. Cookies are secure in production.
5. Deploy the Node queue (`node --import tsx scripts/worker.ts`) continuously. Serverless request handlers are not a substitute for this process.
6. Deploy `uvicorn app:app --host 0.0.0.0 --port 8001` from `worker/`, on a private network. Configure its storage allowlist and bearer secret.
7. Set request limits/timeouts for 100 MB uploads; protect authentication with shared rate limiting. Restrict worker egress to the private object store and approved endpoints.
8. To enable language-model drafts, store `LLM_API_KEY` in the platform secret manager and set `LLM_BASE_URL=https://api.groq.com/openai/v1` and `LLM_MODEL=openai/gpt-oss-20b` on the web process. Do not expose these variables through `NEXT_PUBLIC_*` values.
9. Run the acceptance suite against a non-production project and independently evaluate detector performance before real operational use.

## Operational limits

The MVP does not include malware scanning, password reset, email invitations, SSO/MFA, per-user notification receipts, multi-region queue scheduling, long-term orphan object cleanup or high-load benchmarking. Never expose the local fixture environment publicly with default credentials. Job leases and output validation are implemented, but production capacity and failure recovery need deployment-specific exercise.

No connected PostgreSQL/S3 deployment was performed in this task because Docker Desktop's daemon was unavailable. The licensed PPE detector was exercised locally with real images. No Hugging Face token was available, so the provider adapter was verified with mocked HTTP responses and its live model output remains untested.
