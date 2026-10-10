"""Fetch a pinned public model locally. No API key, cloud inference, or remote code."""
from pathlib import Path
import hashlib,json,urllib.request

ROOT=Path(__file__).resolve().parent
cfg=json.loads((ROOT/'model-selection.json').read_text(encoding='utf-8'))
dest=ROOT/'models/qwen2.5-0.5b-instruct';dest.mkdir(parents=True,exist_ok=True)
names=['config.json','generation_config.json','merges.txt','tokenizer.json','tokenizer_config.json','vocab.json','LICENSE','README.md','model.safetensors']
for name in names:
    path=dest/name
    if path.is_file():
        if name!='model.safetensors' or hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==cfg['model_file_sha256']:
            print(name+': present',flush=True);continue
    url=f'https://huggingface.co/{cfg["model"]}/resolve/{cfg["revision"]}/{name}'
    temp=path.with_suffix(path.suffix+'.download')
    with urllib.request.urlopen(url,timeout=45) as response,temp.open('wb') as target:
        h=hashlib.sha256();total=0;next_log=100_000_000
        while chunk:=response.read(4*1024*1024):
            target.write(chunk);h.update(chunk);total+=len(chunk)
            if total>=next_log:print(f'{name}: {total//1_000_000} MB',flush=True);next_log+=100_000_000
    if name=='model.safetensors' and h.hexdigest()!=cfg['model_file_sha256']:raise RuntimeError('Model SHA-256 mismatch')
    temp.replace(path);print(name+': verified/downloaded',flush=True)
print('MODEL READY',flush=True)
