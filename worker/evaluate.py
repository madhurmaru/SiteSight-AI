"""Small count-discrepancy audit for the pinned SiteSight PPE configuration.

This is deliberately not an accuracy benchmark. Human-reviewed object counts are
compared with mapped detections at one threshold; equal counts do not prove box
localisation. The report therefore keeps per-image outputs for visual review.
"""
import base64, json, os, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'worker'))
from app import Input, analyse

labels=json.loads((ROOT/'evaluation/labels.json').read_text())
classes=labels['classes']; totals={c:{'expected':0,'predicted':0,'countOverprediction':0,'countUnderprediction':0} for c in classes}
images=[]
secret=os.environ.get('WORKER_SECRET','')
if not secret:raise SystemExit('WORKER_SECRET is required')

for index,item in enumerate(labels['images']):
    path=ROOT/'evaluation'/item['file']
    body=Input(mediaId=f'eval-{index}',inspectionId='evaluation',contentBase64=base64.b64encode(path.read_bytes()).decode(),mime='image/jpeg',threshold=labels['threshold'])
    output=analyse(body,'Bearer '+secret)
    predicted={c:sum(d['class']==c for d in output['detections']) for c in classes}
    comparison={}
    for c in classes:
        expected=item['expected'][c]; actual=predicted[c]
        fp=max(0,actual-expected);fn=max(0,expected-actual)
        comparison[c]={'expected':expected,'predicted':actual,'countOverprediction':fp,'countUnderprediction':fn}
        for key,value in comparison[c].items():totals[c][key]+=value
    images.append({'file':item['file'],'scenario':item['scenario'],'counts':comparison,'assessments':[{'kind':f['kind'],'assessment':f['assessment'],'title':f['title']} for f in output['findings']]})

report={
    'dataset':labels['dataset'],'source':labels['source'],'license':labels['license'],
    'size':len(images),'threshold':labels['threshold'],'classes':classes,
    'method':'Human-reviewed per-image object counts; count discrepancies only. Overprediction and underprediction are not false-positive/false-negative classifications because boxes are not matched. This is not mAP, precision, recall, or a production-readiness evaluation.',
    'model':output['model'],'version':output['version'],'provenance':output['provenance'],
    'totals':totals,'images':images,
}
target=ROOT/'evaluation/results.json';target.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
