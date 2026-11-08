# Small PPE configuration audit

This directory contains a five-image, human-reviewed count audit for the exact detector configuration used by the local real-inference workflow. It covers visible PPE, possible missing PPE, partial occlusion, distant workers, crowding, edge clipping and poor lighting.

The images are selected from the separately held-out test split of the [Construction Site Safety dataset](https://huggingface.co/datasets/keremberke/construction-safety-object-detection), published by Roboflow Universe Projects under CC BY 4.0. The source dataset supplies object annotations; `labels.json` records the smaller set of PPE classes and scenario labels reviewed for this application.

Run `npm run test:real-inference` after downloading weights and configuring the worker environment. This audit reports **count overprediction and underprediction**, not false positives and false negatives. It is not a localisation benchmark: matching counts can still hide a wrong box.

Run `npm run test:detection-eval` for the separate box evaluation. It uses the supplied test-split boxes, class-aware confidence-ordered one-to-one matching and IoU ≥ 0.5. `detection-results.json` reports precision and recall from matched detections only. It does not calculate AP or mAP. The dataset's class coverage is sparse on some images—for example, images may contain visible people but annotate only PPE—so per-class results describe agreement with those supplied labels, not exhaustive scene accuracy.

Worker–PPE association is evaluated separately against `association-labels.json`, a small human-reviewed set of worker regions and conservative present/missing/unknown outcomes. This is an association-policy check, not a detector benchmark.

Five images are far too small and too close to the model's source domain to support a general accuracy or production-readiness claim.
