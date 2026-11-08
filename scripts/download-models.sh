#!/bin/sh
set -eu

mkdir -p worker/models

curl -L --fail --retry 2 \
  -o worker/models/ppe-compliance-yolov8-a427495.pt \
  https://huggingface.co/innovativeskipper/ppe-compliance-yolov8/resolve/main/best.pt
echo "6db032361801e431912b6df1b20cca8b7d56a3226082240fc4257c6b2703e61c  worker/models/ppe-compliance-yolov8-a427495.pt" | shasum -a 256 -c -

curl -L --fail --retry 2 \
  -o worker/models/yolov8n-coco-person.pt \
  https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt
echo "f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36  worker/models/yolov8n-coco-person.pt" | shasum -a 256 -c -
