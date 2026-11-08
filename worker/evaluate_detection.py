"""Class-aware box matching and separate worker–PPE association audit."""
import base64, json, os, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'worker'))
from app import Input, analyse

IOU_THRESHOLD=.5
CLASS_MAP={'person':'worker','hardhat':'helmet','safety vest':'vest','no-hardhat':'no-helmet','no-safety vest':'no-vest'}

def iou(a,b):
    x,y,w,h=a;u,v,s,t=b
    intersection=max(0,min(x+w,u+s)-max(x,u))*max(0,min(y+h,v+t)-max(y,v))
    union=w*h+s*t-intersection
    return intersection/union if union else 0

def match_class(predictions,truth,threshold=IOU_THRESHOLD):
    pairs=[];used=set()
    for pred in sorted(predictions,key=lambda item:item.get('confidence',1),reverse=True):
        candidates=[(iou(pred['box'],box),index) for index,box in enumerate(truth) if index not in used]
        score,index=max(candidates,default=(0,-1))
        if score>=threshold:used.add(index);pairs.append({'iou':score,'prediction':pred,'truthIndex':index})
    return {'truePositives':len(pairs),'falsePositives':len(predictions)-len(pairs),'falseNegatives':len(truth)-len(pairs),'pairs':pairs}

def infer(path,index):
    body=Input(mediaId=f'box-eval-{index}',inspectionId='box-evaluation',contentBase64=base64.b64encode(path.read_bytes()).decode(),mime='image/jpeg',threshold=.5)
    return analyse(body,'Bearer '+os.environ['WORKER_SECRET'])

metadata=json.loads((ROOT/'evaluation/source/test-rows.json').read_text())
rows={row['row_idx']:row['row'] for row in metadata['rows']}
category_names=metadata['features'][4]['type']['category']['feature']['names']
image_paths=sorted((ROOT/'evaluation/source/images').glob('*.jpg'))
classes=list(CLASS_MAP.values())
totals={name:{'truePositives':0,'falsePositives':0,'falseNegatives':0} for name in classes}
image_results=[];outputs={}
for index,path in enumerate(image_paths):
    row_index=int(path.stem.split('-')[1]);row=rows[row_index];width=row['width'];height=row['height']
    truth={name:[] for name in classes}
    for box,category_index in zip(row['objects']['bbox'],row['objects']['category']):
        category=category_names[category_index]
        mapped=CLASS_MAP.get(category)
        if mapped:
            x,y,w,h=box;truth[mapped].append([x/width,y/height,w/width,h/height])
    output=infer(path,index);outputs[path.name]=output
    per_class={}
    for name in classes:
        matched=match_class([d for d in output['detections'] if d['class']==name],truth[name])
        per_class[name]={key:value for key,value in matched.items() if key!='pairs'}
        per_class[name]['matchedIoU']=[round(pair['iou'],4) for pair in matched['pairs']]
        for key in totals[name]:totals[name][key]+=matched[key]
    image_results.append({'file':str(path.relative_to(ROOT/'evaluation')),'classes':per_class})

metrics={}
for name,counts in totals.items():
    tp=counts['truePositives'];fp=counts['falsePositives'];fn=counts['falseNegatives']
    metrics[name]={**counts,'precision':round(tp/(tp+fp),4) if tp+fp else None,'recall':round(tp/(tp+fn),4) if tp+fn else None}

association_labels=json.loads((ROOT/'evaluation/association-labels.json').read_text())
association={'workerLabels':0,'matchedWorkers':0,'componentLabels':0,'correctComponentOutcomes':0,'positiveEquipmentLinks':0,'correctPositiveEquipmentLinks':0,'details':[]}
for item in association_labels['images']:
    output=outputs[Path(item['file']).name];workers=[d for d in output['detections'] if d['class']=='worker'];used=set()
    findings={f['workerId']+'-'+f['kind']:f for f in output['findings']}
    details=[]
    for label in item['workers']:
        association['workerLabels']+=1
        candidates=[(iou(label['box'],worker['box']),index,worker) for index,worker in enumerate(workers) if index not in used]
        score,index,worker=max(candidates,default=(0,-1,None))
        matched=score>=association_labels['iouThreshold']
        outcomes={}
        if matched:
            used.add(index);association['matchedWorkers']+=1
            for kind in ['helmet','vest']:
                association['componentLabels']+=1
                actual=findings[worker['id']+'-'+kind]['assessment'];expected=label[kind]
                correct=actual==expected;association['correctComponentOutcomes']+=int(correct)
                if expected=='present':
                    association['positiveEquipmentLinks']+=1
                    association['correctPositiveEquipmentLinks']+=int(actual=='present')
                outcomes[kind]={'expected':expected,'actual':actual,'correct':correct}
        details.append({'workerIoU':round(score,4),'matched':matched,'outcomes':outcomes})
    association['details'].append({'file':item['file'],'workers':details})
association['workerMatchRate']=round(association['matchedWorkers']/association['workerLabels'],4) if association['workerLabels'] else None
association['componentOutcomeAccuracy']=round(association['correctComponentOutcomes']/association['componentLabels'],4) if association['componentLabels'] else None
association['positiveEquipmentLinkAccuracy']=round(association['correctPositiveEquipmentLinks']/association['positiveEquipmentLinks'],4) if association['positiveEquipmentLinks'] else None

report={'dataset':'Construction Site Safety test split','license':'CC BY 4.0','images':len(image_paths),'confidenceThreshold':.5,'iouThreshold':IOU_THRESHOLD,'matching':'Class-aware, confidence-ordered, one-to-one matching to the highest-IoU unmatched ground-truth box. Precision and recall are calculated from these matches. AP and mAP are not calculated.','metrics':metrics,'perImage':image_results,'association':{'method':association_labels['method'],**association},'model':outputs[image_paths[0].name]['model'],'version':outputs[image_paths[0].name]['version'],'provenance':outputs[image_paths[0].name]['provenance']}
(ROOT/'evaluation/detection-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
