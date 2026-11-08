import os, io, secrets, json, base64, hashlib
from urllib.parse import urlparse
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field, model_validator
from PIL import Image, ImageOps
import requests
from association import assess
app=FastAPI(title='SiteSight inference worker')
ppe_model=None
worker_model=None
mapping=json.loads(os.getenv('DETECTOR_CLASS_MAP','{"Hardhat":"helmet","Safety Vest":"vest","NO-Hardhat":"no-helmet","NO-Safety Vest":"no-vest"}'))
capabilities=[]
class Input(BaseModel):
    mediaId:str
    inspectionId:str
    url:str|None=None
    contentBase64:str|None=None
    mime:str
    threshold:float=Field(ge=.1,le=.95)

    @model_validator(mode='after')
    def one_source(self):
        if bool(self.url)==bool(self.contentBase64):raise ValueError('Provide exactly one private evidence source')
        return self

def auth(header):
    secret=os.getenv('WORKER_SECRET','')
    if not secret or not secrets.compare_digest(header or '', 'Bearer '+secret):raise HTTPException(401,'Unauthorized')

def detectors():
    global ppe_model,worker_model,capabilities
    if ppe_model is None:
        weights=os.getenv('DETECTOR_WEIGHTS','')
        if not weights or not os.path.isfile(weights):raise HTTPException(503,'Licensed PPE detector weights are not configured')
        from ultralytics import YOLO
        ppe_model=YOLO(weights)
        worker_weights=os.getenv('WORKER_DETECTOR_WEIGHTS','')
        worker_model=YOLO(worker_weights) if worker_weights else ppe_model
        mapped=set(mapping[n] for n in ppe_model.names.values() if n in mapping)
        capabilities=sorted(c for c in mapped if c in ['helmet','vest'])
        worker_name=os.getenv('WORKER_CLASS_NAME','person')
        if worker_name not in worker_model.names.values():raise HTTPException(503,f'Worker detector has no {worker_name!r} class')
    return ppe_model,worker_model

def file_sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def provenance():
    ppe=os.getenv('DETECTOR_WEIGHTS',''); worker=os.getenv('WORKER_DETECTOR_WEIGHTS','') or ppe
    return {
        'source':os.getenv('DETECTOR_SOURCE','not provided'),
        'license':os.getenv('DETECTOR_LICENSE','not provided'),
        'runtimeLicense':os.getenv('DETECTOR_RUNTIME_LICENSE','not provided'),
        'ppeWeightsSha256':file_sha256(ppe) if ppe and os.path.isfile(ppe) else None,
        'workerWeightsSha256':file_sha256(worker) if worker and os.path.isfile(worker) else None,
        'classMap':mapping,
        'association':'spatial-v3',
    }

def evidence_bytes(body):
    if body.contentBase64:
        if len(body.contentBase64)>140*1024*1024:raise HTTPException(413,'Evidence exceeds limit')
        try:data=base64.b64decode(body.contentBase64,validate=True)
        except Exception:raise HTTPException(400,'Evidence is not valid base64')
        if len(data)>100*1024*1024:raise HTTPException(413,'Evidence exceeds limit')
        return data
    host=urlparse(body.url).hostname
    allowed=[h.strip() for h in os.getenv('STORAGE_ALLOWED_HOSTS','minio,localhost,127.0.0.1').split(',')]
    if host not in allowed or urlparse(body.url).scheme not in ['http','https']:raise HTTPException(400,'Storage host is not authorised')
    response=requests.get(body.url,timeout=30,stream=True,allow_redirects=False)
    if response.status_code!=200:raise HTTPException(502,'Unable to read private evidence')
    data=bytearray()
    for chunk in response.iter_content(65536):
        data.extend(chunk)
        if len(data)>100*1024*1024:raise HTTPException(413,'Evidence exceeds limit')
    return bytes(data)

@app.get('/health')
def health(authorization:str|None=Header(default=None)):
    auth(authorization)
    configured=bool(os.getenv('DETECTOR_WEIGHTS') and os.path.isfile(os.getenv('DETECTOR_WEIGHTS')))
    if configured:detectors()
    return {'configured':configured,'capabilities':capabilities,'model':os.getenv('DETECTOR_NAME','unconfigured'),'version':os.getenv('DETECTOR_VERSION','unconfigured'),'provenance':provenance()}
@app.post('/analyse')
def analyse(body:Input,authorization:str|None=Header(default=None)):
    auth(authorization);ppe,workers=detectors();data=evidence_bytes(body)
    Image.MAX_IMAGE_PIXELS=40000000
    try:image=ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB')
    except Exception:raise HTTPException(400,'Evidence is not a supported image')
    detections=[]
    worker_name=os.getenv('WORKER_CLASS_NAME','person')
    worker_ids=[i for i,n in workers.names.items() if n==worker_name]
    worker_result=workers.predict(image,conf=max(.15,body.threshold),classes=worker_ids,verbose=False)[0]
    ppe_result=ppe.predict(image,conf=body.threshold,verbose=False)[0]
    combined=[('worker',worker_name,b) for b in worker_result.boxes]
    combined += [(mapping.get(ppe.names[int(b.cls.item())]),ppe.names[int(b.cls.item())],b) for b in ppe_result.boxes]
    for cls,raw_class,box in combined:
        if cls not in ['worker','helmet','vest','no-helmet','no-vest']:continue
        x1,y1,x2,y2=box.xyxyn[0].tolist();x1=max(0,min(1,x1));y1=max(0,min(1,y1));x2=max(x1,min(1,x2));y2=max(y1,min(1,y2))
        if x1==x2 or y1==y2:continue
        detections.append({'id':f'{body.mediaId}-d{len(detections)}','class':cls,'rawClass':raw_class,'confidence':float(box.conf.item()),'box':[x1,y1,x2-x1,y2-y1],'workerId':None})
    findings=assess(detections,capabilities,body.mediaId,body.threshold)
    return {'model':os.getenv('DETECTOR_NAME','licensed-yolo-adapter'),'version':os.getenv('DETECTOR_VERSION','unspecified'),'provenance':provenance(),'detections':detections,'findings':findings}
