"""Conservative spatial PPE association; proposals only, never confirmed violations."""
def centre_in(box,region):
    x,y,w,h=box;rx,ry,rw,rh=region
    return rx<=x+w/2<=rx+rw and ry<=y+h/2<=ry+rh

def overlap(a,b):
    x,y,w,h=a;u,v,s,t=b
    intersection=max(0,min(x+w,u+s)-max(x,u))*max(0,min(y+h,v+t)-max(y,v))
    return intersection/max(w*h,1e-9)

def centre_distance(a,b):
    x,y,w,h=a;u,v,s,t=b
    return (x+w/2-u-s/2)**2+(y+h/2-v-t/2)**2

def assess(detections,capabilities,media_id,min_confidence=.5):
    findings=[]
    workers=[d for d in detections if d['class']=='worker']
    # A detector observation belongs to at most one worker.
    for item in detections:
        if item['class']=='worker':item['workerId']=item['id'];continue
        candidates=[]
        for w in workers:
            x,y,width,height=w['box']
            if item['class'] in ['helmet','no-helmet','vest','no-vest']:
                region=[x,y,width,height*.25] if item['class'] in ['helmet','no-helmet'] else [x,y+height*.2,width,height*.48]
                if centre_in(item['box'],region):candidates.append((centre_distance(item['box'],region),w['id']))
        item['workerId']=min(candidates)[1] if candidates else None
    for w in workers:
        x,y,width,height=w['box']
        occluded=any(o['id']!=w['id'] and overlap(w['box'],o['box'])>.45 for o in workers)
        visible=height>=.18 and width>=.035 and w['confidence']>=min_confidence and x>.01 and y>.01 and x+width<.99 and y+height<.99 and not occluded
        for kind in ['helmet','vest']:
            candidates=[d for d in detections if d['class']==kind and d.get('workerId')==w['id'] and d['confidence']>=min_confidence]
            negative=[d for d in detections if d['class']=='no-'+kind and d.get('workerId')==w['id'] and d['confidence']>=min_confidence]
            outcome='unknown' if not visible or kind not in capabilities else 'present' if candidates else 'missing'
            title=f'{kind.title()} appears present' if outcome=='present' else f'Possible missing {kind}' if outcome=='missing' else f'Unable to assess {kind}'
            findings.append({'id':w['id']+'-'+kind,'kind':kind,'assessment':outcome,'title':title,'workerId':w['id'],'original':__import__('json').dumps({'worker':w,'equipment':candidates,'negativeCandidates':negative,'rules':'spatial-v3','visibilityEligible':visible,'occluded':occluded,'supported':kind in capabilities,'outcome':outcome})})
    return findings
