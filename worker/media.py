"""Bounded video validation and frame sampling. ffmpeg/ffprobe required."""
import json, os, subprocess, sys

def probe(path):
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',path],timeout=15))
    streams=[s for s in data['streams'] if s['codec_type']=='video']
    if not streams: raise ValueError('No video stream')
    stream=streams[0]; duration=float(data['format'].get('duration',0))
    if duration<=0 or duration>float(os.getenv('MAX_VIDEO_SECONDS','60')): raise ValueError('Video must be between 0 and 60 seconds')
    if stream['width']*stream['height']>3840*2160: raise ValueError('Video exceeds 4K resolution limit')
    if not any(f in data['format']['format_name'] for f in ['mov','mp4','webm','matroska']): raise ValueError('Only MP4, MOV and WebM containers supported')
    return {'duration':duration,'width':stream['width'],'height':stream['height'],'format':data['format']['format_name']}

def extract(path,output):
    info=probe(path); count=min(12,max(1,int(os.getenv('MAX_VIDEO_FRAMES','8')))); count=min(count,max(1,int(info['duration'])+1))
    os.makedirs(output,exist_ok=True);frames=[]
    for n in range(count):
        at=round(info['duration']*n/count,3); target=os.path.join(output,f'frame-{n}.jpg')
        subprocess.run(['ffmpeg','-v','error','-ss',str(at),'-i',path,'-frames:v','1','-vf','scale=min(1600\\,iw):-2','-y',target],check=True,timeout=20)
        frames.append({'path':target,'timestamp':at,'selection':'uniform bounded sampling','sampleIndex':n})
    return {'metadata':info,'frames':frames,'limitation':'Sampled frames may miss events. Observations are not unique people.'}

if __name__=='__main__':
    try: print(json.dumps(probe(sys.argv[2]) if sys.argv[1]=='probe' else extract(sys.argv[2],sys.argv[3])))
    except Exception as e:
        print(json.dumps({'error':str(e)}));sys.exit(1)
