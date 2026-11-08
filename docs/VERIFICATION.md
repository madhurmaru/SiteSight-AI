# Verification results

## Inspection-first workflow verification — 2 November 2026

The inspection workflow now keeps raw model findings as internal provenance. The review screen was exercised with the real uploaded `Test` image and displayed 10 detected objects, including 4 worker boxes, 3 helmets and 3 vests, plus aggregate potential-violation and unable-to-assess counts. No item-by-item finding decisions were required. An optional human observation was stored when the inspection was completed.

Completion created exactly one `Report` linked by the inspection's unique `inspectionId`. Repeating the workflow cannot create a second report for that inspection. The idempotent `npm run db:backfill-reports` command created eight missing drafts for previously reviewed local inspections; a second run created zero. The draft contained the analysis counts, the human observation, evidence reference, model notice and limitations. It was submitted, approved and exported as [the approved two-page PDF](../output/pdf/sitesight-test-inspection-approved.pdf). Inspection reports cannot create later revisions; the approved version remains immutable.

PDF verification used Poppler `pdfinfo`, `pdftotext` and 120-DPI page rendering. The export is A4, 2 pages and 57,230 bytes; SHA-256 is `6b653cab0ba2f892e5ad05e0d15e3a24e496a5ff03eaba4fa3a372ea9c2c7c70`. Extracted text contains the exact analysis counts, human observation, limitations, evidence ID, model/template provenance and immutable version ID. Both rendered pages were visually inspected: the evidence orientation and aspect ratio are correct, text is readable, and headers/footers do not overlap.

Project and selected-inspection Q&A now retrieve inspection report snapshots. A deterministic local query against the approved report returned the stored worker and potential-violation counts with an authorised report-record citation. Viewer retrieval remains approved-only. Overall-workspace questions still use authorised database totals because those administrative counts are not inspection report content.

The Hugging Face route was tested live against `https://router.huggingface.co/v1/chat/completions`. The application submitted the authorised report records using strict JSON-schema output and returned the provider's actual account state: **no remaining Inference Provider credits**. The UI does not display a stale or fallback answer after provider failure. Successful live model wording therefore remains blocked on adding credits or using an eligible Hugging Face plan; mocked structured-output, retry, citation and numerical-validation tests pass.

Current checks:

| Check                                            | Result                                                 |
| ------------------------------------------------ | ------------------------------------------------------ |
| SQLite migration and Prisma generation           | Passed                                                 |
| Inspection completion → unique report → approval | Passed in the local UI                                 |
| PDF structure, text extraction and visual review | Passed                                                 |
| Report-grounded deterministic Q&A                | Passed                                                 |
| Live Hugging Face request                        | Reached provider; blocked by exhausted account credits |
| `npm run typecheck`                              | Passed                                                 |
| `npm run lint`                                   | Passed, no warnings                                    |
| `npm test`                                       | 17 passed                                              |
| isolated `npm run test:e2e`                      | 5 passed                                               |
| `npm run build`                                  | Passed                                                 |

The real detector verification below records the earlier CV integration run and remains applicable to the inference pipeline. Its older item-level review description documents that historical test; the current product workflow uses the aggregate review and one-report-per-inspection behavior described above.

Verified locally on 30 October 2026, macOS, Node.js 22.22.2 and Python 3.11.16.

## Real integration test

A CC BY 4.0 construction photograph from the separately held-out Construction Site Safety test split was uploaded through the normal HTTP endpoint. The application retained the original privately, produced a 1280×720 EXIF-normalised review derivative and queued a durable SQL job. The Python worker ran the pinned PPE and person weights and persisted seven actual detections: three workers, one helmet, one missing-helmet candidate and two missing-vest candidates. Every record includes a raw detector class, confidence, normalised box, worker association, model/version and weight provenance.

The job reached `ready` on attempt 2 after a deliberately retained first failure from an older worker process. The successful retry created no duplicate detections or findings. The evidence overlay was rendered against the persisted image and visually checked for orientation, scale and box placement.

An authorised reviewer then checked all six worker/PPE assessments. Visible missing PPE and visible PPE were confirmed; two low-visibility assessments were corrected to `unknown`. The inspection was completed, a deterministic evidence-grounded report was created, submitted and approved, and approved version 2 was exported to [the two-page PDF](../output/pdf/sitesight-real-ppe-inspection-approved.pdf). It contains three confirmed observations from the real image and excludes the unknown assessments. Version 1 remains unchanged in the database, demonstrating immutable approved versions.

Approved PDF facts:

- A4, 2 pages, 99,132 bytes.
- SHA-256 `ba3aabf132675704d99d45bd338ff8dcb28970636e05bdb82d829cad2d80e000`.
- Both pages rendered with Poppler and were visually inspected; the evidence image has the correct orientation and aspect ratio, tables are readable and footers do not overlap content.
- Report model/source is `deterministic-record-template-v1`. No external LLM generated this report.

The persisted inspection records association rule `spatial-v2`, which exposed one ambiguous missing-helmet association when person boxes overlapped. The final source corrects that defect as `spatial-v3`: negative helmet and vest candidates now use the same anatomical regions as positive candidates. A targeted regression test passes, and a fresh inference check on the same image assigns that missing-helmet candidate to the foreground worker. The approved human decision was already correct and its original detector output was preserved rather than silently rewritten.

## Automated checks

| Check                           | Result                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run typecheck`             | Passed                                                                                           |
| `npm run lint`                  | Passed, no warnings                                                                              |
| `npm test`                      | 27 passed, including inference diagnostics, natural fallback, Groq retry and numeric-guard tests |
| `npm run test:python`           | 7 passed                                                                                         |
| `npm run test:real-inference`   | Passed on 5 real images; wrote `evaluation/results.json`                                         |
| `npm run test:detection-eval`   | Passed on 9 real images; IoU matching and association                                            |
| isolated `npm run test:e2e`     | 5 passed against a copied database and temporary port                                            |
| `npm run build`                 | Passed with Next.js 16.4.3 Webpack production compiler                                           |
| PDF structure and visual review | Passed, 2-page A4 export                                                                         |

The HTTP suite covers sign-in, fixture inspection processing, finding confirm/reject/correct boundaries, progress updates, date-scoped report generation, approval, PDF parsing, frozen version content, retry deduplication, project isolation, viewer approved-only filtering, private evidence access, CSRF, malformed upload contents, video sampling, member roles and repeat fixture reset. It ran against `prisma/e2e.db`, leaving the real inspection in `prisma/demo.db` intact.

Unit coverage includes weighted progress, baseline limits, PPE denominators with unknown/unreviewed exclusions, invalid and cross-project evidence citations, upload limits and geometry, inference provenance/raw classes, approval/resolution guards and project-role actions. Provider tests cover prompt injection containment, fabricated and cross-project citations, unsupported numerical claims, verified claims backed by proposals, retry behavior and no-evidence responses. Python coverage includes unsupported PPE capability, visible/missing/unknown outcomes, small and occluded workers, direct negative candidates remaining proposals and overlapping-worker association.

## Small detector audit

The exact pinned configuration was run at confidence 0.5 over five human-reviewed real images covering visible PPE, possible missing PPE, distance, crowding, partial occlusion, edge clipping and poor lighting.

| Class  | Expected | Predicted | Count overprediction | Count underprediction |
| ------ | -------: | --------: | -------------------: | --------------------: |
| Worker |       18 |        16 |                    0 |                     2 |
| Helmet |       13 |        15 |                    2 |                     0 |
| Vest   |        7 |         7 |                    1 |                     1 |

This is a per-image object-count discrepancy audit. Overprediction and underprediction are not false-positive/false-negative classifications because boxes are not matched. A matching count can still contain a wrong box.

The separate detection evaluation uses nine images, supplied ground-truth boxes and class-aware one-to-one matching at IoU ≥ 0.5:

| Class          |  TP |  FP |  FN | Precision | Recall |
| -------------- | --: | --: | --: | --------: | -----: |
| Worker         |   4 |  15 |   0 |    0.2105 | 1.0000 |
| Helmet         |  10 |   5 |   2 |    0.6667 | 0.8333 |
| Vest           |   0 |   7 |   1 |    0.0000 | 0.0000 |
| Missing helmet |   3 |   1 |   4 |    0.7500 | 0.4286 |
| Missing vest   |   2 |   8 |   1 |    0.2000 | 0.6667 |

These values describe agreement with the supplied labels. Class coverage is sparse on several images, so visible unlabelled objects count as false positives under this protocol. AP and mAP were not calculated. The separate association audit matched all four labelled worker regions; six of eight conservative PPE outcomes agreed, and the one labelled positive equipment link was associated correctly. Two disagreements were the poorly lit worker that human review changed to unable to assess. Neither the detection nor association sample supports production-readiness claims. Full results are in `evaluation/detection-results.json`.

## Language-model verification

The Hugging Face integration is implemented against the documented OpenAI-compatible chat-completion endpoint. General assistant mode uses ordinary chat completion; record-grounded modes use strict structured output. Mocked HTTP tests verified greetings without records, schema parsing, one retry after a 503, citation ownership, source-record validation, numerical validation, explicit empty answers, provider/model incompatibility and exhausted-credit errors. A live request to `openai/gpt-oss-20b:fireworks-ai` returned HTTP 410 because Fireworks no longer supports that model. A second live request using the generic `openai/gpt-oss-20b` route reached Hugging Face and returned HTTP 402 because the configured account has no remaining Inference Provider credits. The localhost API now preserves that 402 response instead of presenting a generic 502; no live model wording is claimed.

The HTTP acceptance suite verifies deterministic project Q&A, clickable authorised record citations, viewer access to approved report records, denial of viewer access to operational finding records, stored source-record versions and verified-only approved claims. Workspace and selected-inspection Q&A were also checked against the local SQLite database: workspace totals returned a workspace-record citation, and one selected inspection returned only its stored counts and citation. Five suggested project questions were also sent to the running local app: unresolved helmet findings, baseline delay, latest approved summary and progress evidence returned cited records; the Zone B comparison returned an explicit insufficient-evidence result because no compatible reviewed comparison was stored. Enabling the provider without a token returned HTTP 503 with setup guidance.

The remaining live step is to add Hugging Face Inference Provider credits or use an eligible plan, then generate a provider report draft, inspect its separated review context, and repeat several cited Q&A questions before approval.

The active localhost provider is now Groq with `openai/gpt-oss-20b`. A live synthetic-record request completed in one attempt. Groq returned answer text and an exact source-record ID; SiteSight derived the verified state and both numerical facts from the trusted record and passed the complete grounding validator. No stored project data was sent during this provider check. Live testing against Riverside project records still requires explicit authorisation to send those retrieved records to Groq.

A second live synthetic test verified automatic routing and temporary follow-up context: the first turn answered that the synthetic workspace contained 2 projects, and the follow-up “And how many inspections?” correctly answered 5 inspections using the prior turn plus the same authorised synthetic record. Both responses were classified as grounded. No conversation was persisted.

Regression tests now cover both Groq failures observed in the browser. A `failed_generation`/JSON-validation response retries once without constrained JSON mode and still passes the server grounding validator. A generated claim containing an unsupported number is omitted and converted into a readable insufficient-evidence chat response rather than an HTTP 422. Provider failure is returned inside the active thread, so it does not discard earlier conversation context.

Automatic chat routing was additionally verified with general prompts (`How can I improve?` and `summarize`), direct record prompts (`summarize the violations` and inspection counts), and a contextual grounded follow-up. General requests use plain chat completion and do not retrieve or transmit project records. Grounded requests retain role-scoped retrieval and evidence validation. When Groq returns HTTP 429 or invalid grounded wording, authorised report excerpts remain available as an explicitly labelled fallback instead of producing an empty answer. This is mocked verification; the current free-tier account's live 429 state was not presented as a successful model response.

The record fallback now condenses relevant inspection summaries, omits zero-result reports from PPE questions, and gives clearly labelled workflow recommendations for action-oriented questions. Grounded provider prompts state that authorised records are already supplied, while the general prompt no longer volunteers a database-access disclaimer. Referential follow-ups such as “How should I handle those?” remain on the grounded path.

## Real, fixture and untested boundaries

Executed real operations:

- SQLite persistence, private local media, sessions and server-side project access control.
- Durable queue, authenticated Python inference, EXIF-normalised real imagery, stored detections and human review.
- Report snapshot/version approval and PDF generation.
- Licensed-weight download checksum verification and five-image detector audit.

Fixture-based operations:

- Bundled illustrated media and deterministic detections used by the general acceptance workflow.
- Deterministic database Q&A and report wording when no model provider is selected.

Implemented but not integration-tested here:

- PostgreSQL and private S3/MinIO connected deployment. Prisma schemas and adapters exist, but Docker services were not used for the real image run.
- Successful live Hugging Face model calls. The configured account currently has no remaining Inference Provider credits; provider errors remain explicit, and the existing real approved report remains labelled deterministic.

Remaining limits include no cross-frame identity tracking, no unique-person claims, no automatic completion measurement, simple spatial association, a small source-domain-close audit and no production malware scanning or object-storage lifecycle validation.
