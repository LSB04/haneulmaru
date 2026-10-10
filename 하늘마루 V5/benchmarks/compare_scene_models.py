"""Reproducible local ClikaRT comparison. No tokens or account data in output."""
import hashlib, json, os, statistics, subprocess, sys, time, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
APP=ROOT
OUT=ROOT/'output/model_comparison'
OUT.mkdir(parents=True,exist_ok=True)
CASES=[
 ('드론 30대로 설정해줘',{'count':30}),
 ('드론 100대, 품질은 높음으로 바꿔',{'count':100,'quality':'high'}),
 ('2D 지도로 바꾸고 일시정지해',{'top':True,'paused':True}),
 ('3D로 돌아가고 재생해',{'top':False,'paused':False}),
 ('속도는 2배, 태양 고도는 45도로',{'speed':2,'sun':45}),
 ('최저 품질로 하고 드론은 12대만',{'quality':'low','count':12}),
 ('최고 품질, 0.25배속으로 천천히',{'quality':'ultra','speed':.25}),
 ('드론 수는 바꾸지 말고 일시정지만 해',{'paused':True}),
 ('품질은 균형으로, 속도는 보통 1배로',{'quality':'balanced','speed':1}),
 ('안녕하세요',{}),
 ('파일을 삭제해줘',{}),
 ('태양 고도를 60도로 하고 3D로 바꿔줘',{'sun':60,'top':False}),
]
SYSTEM='You configure a synthetic 3D graphics demo. Output ONLY a flat JSON object, no markdown, no explanation. Supported keys: count (integer 1..200); quality ("low", "balanced", "high", "ultra"); speed (0.25, 1, 2); sun (10..80); top (true for 2D, false for 3D); paused (boolean). Include only requested settings. Unsupported requests: {}. No code or external data. Example user: 드론 30대. Answer: {"count":30}. Example user: 2D로 변경. Answer: {"top":true}.'
CANDIDATES={'qwen35-2b':'Qwen/Qwen3.5-2B','qwen35-4b':'Qwen/Qwen3.5-4B','phi4-mini':'microsoft/Phi-4-mini-instruct'}
def read_url(url):
    with urllib.request.urlopen(url,timeout=60) as r:return json.load(r)
def download(key):
    repo=CANDIDATES[key];meta=read_url('https://huggingface.co/api/models/'+repo+'?blobs=true')
    dest=APP/'models'/key;dest.mkdir(parents=True,exist_ok=True)
    cfg={'model':repo,'revision':meta['sha'],'local_path':'models/'+key,'files':[]}
    for f in meta['siblings']:
        name=f['rfilename']
        if '/' in name or not (name.endswith(('.safetensors','.json','.jinja')) or name in ('LICENSE','README.md','merges.txt','tokenizer.model')):continue
        if name.endswith('.json') and not any(t in name for t in ('config','tokenizer','vocab','index','tokens','processor')):continue
        spec={'name':name,'sha256':f.get('lfs',{}).get('sha256'),'size':f.get('size')}
        cfg['files'].append(spec);p=dest/name
        if p.exists() and (not spec['size'] or p.stat().st_size==spec['size']):continue
        temp=p.with_suffix(p.suffix+'.download');h=hashlib.sha256();n=0
        with urllib.request.urlopen(f'https://huggingface.co/{repo}/resolve/{meta["sha"]}/{name}',timeout=90) as r,temp.open('wb') as w:
            while block:=r.read(8*1024*1024):w.write(block);h.update(block);n+=len(block)
        if spec['sha256'] and h.hexdigest()!=spec['sha256']:raise ValueError('SHA mismatch '+name)
        temp.replace(p);print(key,name,n,flush=True)
    (OUT/(key+'-manifest.json')).write_text(json.dumps(cfg,indent=2),encoding='utf-8')
    print(key,'download complete',flush=True)
def worker(key):
    os.environ['CLIKA_RT_LICENSE']=str(Path.home()/'Downloads/Default_Project_license.txt')
    import clika_runtime as crt
    from clika_runtime.modelverse import AutoModelForCausalLM
    sys.path.insert(0,str(APP/'experiments/haneulmaru_pro'))
    from clika_bridge import parse_scene
    gpu=next(i for i in range(crt.vulkan.device_count()) if '2080' in crt.vulkan.get_device_properties(i).name)
    os.chdir(APP);start=time.perf_counter();path='models/qwen2.5-0.5b-instruct' if key=='baseline' else 'models/'+key
    tuned=os.environ.get('V5_TUNED')=='1'
    model=AutoModelForCausalLM.from_pretrained(path,device=f'vulkan:{gpu}',dtype='float16',max_seq=2048)
    system=SYSTEM
    suffix='-tuned' if tuned else ''
    if tuned:
        import runpy
        system=runpy.run_path(str(APP/'experiments/haneulmaru_pro/scene_prompt.py'))['SCENE_SYSTEM']
    cases=CASES
    if os.environ.get('V5_HOLDOUT')=='1':
        suffix='-holdout'
        cases=[('비행체 수를 64로 변경',{'count':64}),('현재 품질은 유지하고 태양만 35도로 설정',{'sun':35}),('드론 8대에 낮은 품질로 실행하고 2배속',{'count':8,'quality':'low','speed':2}),('멈춘 상태에서 3D 보기로 바꿔',{'paused':True,'top':False}),('균형 품질과 위에서 보기로 전환',{'quality':'balanced','top':True}),('일시정지를 풀고 정상 속도로 돌아가',{'paused':False,'speed':1}),('200대를 최고 품질로 보고 싶어',{'count':200,'quality':'ultra'}),('오늘 날씨 어때?',{})]
    result={'key':key,'gpu':crt.vulkan.get_device_properties(gpu).name,'dtype':'float16','backend':'Vulkan','loadMs':round((time.perf_counter()-start)*1000),'cases':[]}
    for prompt,expected in cases:
        start=time.perf_counter()
        raw=model.generate(messages=[{'role':'system','content':system},{'role':'user','content':prompt}],max_new_tokens=96,temperature=0)
        elapsed=round((time.perf_counter()-start)*1000)
        try:actual=parse_scene(raw);valid=True
        except ValueError:actual=None;valid=False
        result['cases'].append({'prompt':prompt,'expected':expected,'actual':actual,'valid':valid,'exact':actual==expected,'ms':elapsed,'raw':raw})
        result['exact']=sum(c['exact'] for c in result['cases']);result['medianMs']=statistics.median(c['ms'] for c in result['cases'])
        (OUT/(key+suffix+'-result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(key,len(result['cases']),result['exact'],elapsed,flush=True)
    mem=subprocess.run(['nvidia-smi','--query-gpu=memory.used','--format=csv,noheader,nounits'],capture_output=True,text=True)
    result['totalGpuMemoryMiB']=mem.stdout.strip();result['max_seq']=2048;result['prompt']='korean-v2' if tuned else 'original';(OUT/(key+suffix+'-result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':
    if sys.argv[1]=='download':download(sys.argv[2])
    elif sys.argv[1]=='worker':worker(sys.argv[2])
    else:
        for key in sys.argv[2:]:
            log=OUT/(key+'.log')
            try:
                with log.open('w',encoding='utf-8') as f:p=subprocess.run([sys.executable,str(Path(__file__).resolve()),'worker',key],stdout=f,stderr=subprocess.STDOUT,timeout=300)
                print(key,'exit',p.returncode,flush=True)
            except subprocess.TimeoutExpired:print(key,'timeout 300s',flush=True)
