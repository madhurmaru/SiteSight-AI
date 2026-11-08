# Detector and model-provider setup

## Bundled fixture adapter

`lib/fixture.ts` defines six detections and four assessments for each original synthetic site illustration. Coordinates are normalised `[x, y, width, height]`. Model name: `SiteSight illustrated fixture`, version `1.0`. This is deterministic fixture output, not ML inference or evidence of accuracy. Fixture media is clearly labelled on screen and in PDFs.

## Verified real detector configuration

`worker/app.py` exposes authenticated `/health` and `POST /analyse` endpoints. Local private files are sent as bounded base64; connected object storage uses a 60-second signed URL restricted to configured hosts, without redirects. The worker decodes the actual image, applies EXIF orientation before inference and produces normalised `[x, y, width, height]` boxes against that oriented image.

The tested configuration is deliberately two-stage:

| Purpose | File/version                                       | Verified classes used                                    | Source and licence                                                                                                                 |
| ------- | -------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PPE     | `ppe-compliance-yolov8-a427495.pt`                 | `Hardhat`, `Safety Vest`, `NO-Hardhat`, `NO-Safety Vest` | `innovativeskipper/ppe-compliance-yolov8`; model card says MIT; its stated Construction Site Safety v27 training data is CC BY 4.0 |
| Workers | `yolov8n-coco-person.pt`, Ultralytics asset v8.3.0 | `person` only                                            | Ultralytics YOLOv8n COCO weights/runtime; AGPL-3.0 or Enterprise terms apply to the Ultralytics distribution                       |

The PPE file also declares `Mask`, `NO-Mask`, `Person`, `Safety Cone`, `machinery` and `vehicle`, but SiteSight maps only the four PPE classes above. A separate COCO person model is used because the PPE file's `Person` detections did not cover workers consistently in the audit. Generic COCO weights supply only the worker boxes; they are never treated as helmet or vest capability.

Pinned SHA-256 values:

- PPE: `6db032361801e431912b6df1b20cca8b7d56a3226082240fc4257c6b2703e61c`
- person: `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`

`npm run models:download` downloads both files and fails if either checksum differs. The files are ignored by Git. Review the model card, dataset attribution and Ultralytics licence for the intended commercial deployment; SiteSight does not grant additional rights.

Only exact class names in `DETECTOR_CLASS_MAP` are accepted. `/health` loads the files, checks that the worker class exists, and reports capabilities plus provenance; it is not an accuracy endpoint. Missing files, unsupported classes or invalid outputs fail honestly and do not fall back to fixtures.

## Spatial association (`spatial-v3`)

- Worker head region: upper 25% of worker box.
- Worker torso region: 20% to 68% of worker height.
- Positive and negative helmet candidates must have their centre in the corresponding head region; positive and negative vest candidates use the torso region. If multiple workers qualify, associate to the closest region centre; one detector observation belongs to at most one worker. This prevents a large overlapping background worker box from stealing a foreground missing-PPE observation.
- A worker is assessable only when height ≥ 18% and width ≥ 3.5% of the image, confidence meets the project threshold, the box is not edge-clipped, and another worker does not overlap more than 45% of its area.
- Supported, visible equipment → appears present. Supported, assessable region without equipment → possible missing PPE. Otherwise → unable to assess.

Direct `NO-Hardhat` and `NO-Safety Vest` detections are retained as supporting candidates, but do not confirm a violation. Absence of a positive detection can only create a proposal for a visible, assessable worker. These simple rules do not model every occlusion and never confirm a violation automatically. No cross-frame tracking is implemented.

## Small evaluation

`evaluation/` contains a five-image audit from the separately held-out Construction Site Safety test split, licensed CC BY 4.0. It covers visible PPE, missing PPE, distance, poor lighting, edge clipping, crowding and partial occlusion. At confidence 0.5, human-reviewed count differences were:

| Class  | Expected | Predicted | Count overprediction | Count underprediction |
| ------ | -------: | --------: | -------------------: | --------------------: |
| Worker |       18 |        16 |                    0 |                     2 |
| Helmet |       13 |        15 |                    2 |                     0 |
| Vest   |        7 |         7 |                    1 |                     1 |

These are per-image count discrepancies, not false-positive/false-negative classifications. Equal counts can conceal a localisation error.

`evaluation/detection-results.json` is the separate box evaluation. It uses class-aware confidence-ordered one-to-one matching at IoU ≥ 0.5 over nine images and reports precision/recall from TP/FP/FN matches. It does not calculate AP or mAP. Supplied annotations have sparse class coverage on several images, so results describe agreement with that annotation policy. Worker–PPE association is reported independently against four human-labelled worker regions: all four workers matched, six of eight component outcomes agreed and the one labelled positive equipment link was correct. These small, source-domain-close samples cannot establish production readiness.

## Video

`worker/media.py` validates containers and extracts bounded uniform samples. `lib/video.ts` persists each frame with its timestamp, source media ID, sample index and selection description. Reprocessing uses stable frame IDs. The original clip remains private. Sampling may miss events; observations from multiple frames are not unique people.

## LLM

`lib/reports.ts` contains role-scoped report retrieval, deterministic inspection report templates and a Groq adapter using its OpenAI-compatible chat-completion endpoint. A local intent router sends ordinary conversation to plain chat completion, where Groq can use its general knowledge without receiving project data. Record-related questions retrieve authorised workspace totals or project report snapshots first, then require a compact JSON object containing exact source-record IDs. SiteSight derives verification state, evidence IDs and numerical facts from trusted records and applies the complete grounding validator. Invalid generated wording and provider rate limits fall back to direct authorised record excerpts when records exist. `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` are server-only. The browser supplies temporary follow-up context; those turns are not persisted and clear on refresh or navigation. Requests use bounded record and per-turn text, a configurable 3–60 second timeout, at most two retries for timeouts/429/5xx, and bounded output size.

Provider claims contain text, type, evidence IDs, source-record IDs, verification, limitations and declared numerical facts. SiteSight validates the shape, project-owned evidence, record ownership, evidence-to-record links, source verification and numeric values. Prompt injection text remains data in the user message. Invalid output produces a failure state and is not stored.

Inspection reports use `deterministic-inspection-template-v1` / `inspection-report-v1` and store exact source-record versions. The chatbot can use `qa-grounding-v2` to turn authorised report records into concise answers. The PDF is rendered from the same structured snapshot; it is not parsed back into lossy text at runtime. Mocked responses cover structured-output behavior. A successful live request still requires a valid fine-grained token with **Make calls to Inference Providers** permission and available provider credits.
