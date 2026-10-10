"""Bedrock text-only scene assistant. Credentials are held only in RAM."""
import json
import math
import threading
import urllib.request
import urllib.error

REGION = 'us-east-1'
MODEL = 'us.anthropic.claude-sonnet-4-6'
_token = ''
_lock = threading.Lock()
_busy = threading.Lock()

def credential(value):
    global _token
    if not isinstance(value, str) or len(value) > 20000 or any(c.isspace() for c in value):
        raise ValueError('키 형식이 올바르지 않습니다. 공백 없이 키만 붙여넣으세요.')
    with _lock:
        _token = value
    return status()

def status():
    with _lock:
        configured = bool(_token)
    return {'configured': configured, 'region': REGION, 'model': MODEL,
            'note': '키 입력 여부이며, 모델 접근 성공 여부는 실제 요청으로 확인합니다.'}

def validate_scene(value):
    if not isinstance(value, dict) or set(value) - {'count','quality','speed','sun','top','paused'}:
        raise ValueError('허용되지 않은 장면 설정입니다.')
    for key, item in value.items():
        valid = False
        if key == 'count': valid = type(item) is int and 1 <= item <= 200
        elif key == 'quality': valid = isinstance(item,str) and item in ('low','balanced','high','ultra')
        elif key == 'speed': valid = type(item) in (int,float) and item in (.25,1,2)
        elif key == 'sun': valid = type(item) in (int,float) and math.isfinite(item) and 10 <= item <= 80
        elif key in ('top','paused'): valid = type(item) is bool
        if not valid: raise ValueError('장면 설정 범위를 벗어났습니다: '+key)
    return value

def metrics_only(value):
    if not isinstance(value,dict): raise ValueError('성능 지표 형식 오류')
    allowed = {'meanFps','p95FrameMs','width','height','frames','count','quality','gpu','software','fps','mbps','encodeMs','reason','encoder'}
    result = {}
    for key,item in value.items():
        if key not in allowed: continue
        if isinstance(item,str): result[key]=item[:240]
        elif type(item) is bool: result[key]=item
        elif type(item) in (int,float) and math.isfinite(item): result[key]=item
    return result

def converse(system, prompt):
    with _lock: token = _token
    if not token: raise ValueError('PC 입력창에 Bedrock 단기 API 키를 먼저 넣으세요.')
    body = {'system':[{'text':system}], 'messages':[{'role':'user','content':[{'text':prompt}]}],
            'inferenceConfig':{'maxTokens':900,'temperature':0.2}}
    req = urllib.request.Request(
        'https://bedrock-runtime.'+REGION+'.amazonaws.com/model/'+MODEL+'/converse',
        data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=45) as response:
            data=json.loads(response.read(200000))
    except urllib.error.HTTPError as exc:
        # Never return request headers, tokens or raw AWS error payloads.
        hints={401:'키가 만료되었거나 잘못되었습니다.',403:'계정 권한·모델 접근 또는 키 만료를 확인하세요.',
               404:'해당 리전의 모델 접근을 확인하세요.',429:'호출 한도에 도달했습니다. 잠시 뒤 다시 시도하세요.',
               400:'모델 사용 설정·요청 지원 여부를 확인하세요.'}
        raise ValueError('Bedrock HTTP '+str(exc.code)+': '+hints.get(exc.code,'AWS 서비스 응답 오류입니다.')) from None
    except (urllib.error.URLError,TimeoutError):
        raise ValueError('AWS 연결 시간 초과 또는 네트워크 오류입니다.') from None
    try:
        text='\n'.join(c['text'] for c in data['output']['message']['content'] if 'text' in c)
        return text, data.get('usage',{})
    except (KeyError,TypeError): raise ValueError('모델 응답 형식을 읽지 못했습니다.') from None

def request(data):
    if not isinstance(data,dict): raise ValueError('요청 형식 오류')
    kind=data.get('kind')
    if kind not in ('scene','explain'): raise ValueError('지원하지 않는 요청')
    if not _busy.acquire(blocking=False): raise ValueError('앞선 AWS 요청을 처리 중입니다.')
    try:
        if kind=='scene':
            prompt=data.get('prompt','')
            if not isinstance(prompt,str) or not 1<=len(prompt.strip())<=2000: raise ValueError('설정을 1~2000자로 입력하세요.')
            system='''You configure a purely synthetic 3D graphics demo. Return ONLY JSON with keys settings and explanation (Korean).
settings can include ONLY count (integer 1..200 synthetic objects), quality (low/balanced/high/ultra), speed (0.25/1/2), sun (10..80 degrees), top (boolean, true=2D), paused (boolean).
Only change requested supported settings. Unsupported requests must be explained and not invented. Terrain geography, camera hardware and real aircraft detection are not supported.
Never execute code or suggest targeting, weapons or real-world operational actions. No markdown. Example: {"settings":{"count":50,"sun":20},"explanation":"합성 비행체 50개와 해질녘 조명입니다."}'''
            raw,usage=converse(system,prompt)
            if raw.strip().startswith('```'):
                raw=raw.strip().split('\n',1)[1].rsplit('```',1)[0]
            try: parsed=json.loads(raw)
            except (ValueError,TypeError): raise ValueError('모델이 설정 JSON을 반환하지 않았습니다. 다시 요청하세요.') from None
            if not isinstance(parsed,dict): raise ValueError('장면 응답 형식 오류')
            settings=validate_scene(parsed.get('settings'))
            explanation=parsed.get('explanation','')
            if not isinstance(explanation,str): raise ValueError('장면 설명 형식 오류')
            return {'settings':settings,'explanation':explanation[:3000],'usage':usage,'model':MODEL}
        metrics=metrics_only(data.get('metrics'))
        if not metrics: raise ValueError('10초 측정 또는 영상 연결 후 사용하세요.')
        system='''Explain the supplied synthetic graphics benchmark in Korean, briefly. Distinguish WebGL rendering from CUDA, rendering FPS from encoding FPS, and round-trip time from camera-to-display latency. Do not claim measured speedup without comparable before/after data. Missing metrics are unknown. Offer at most three concrete next checks. No claims about detection or weapons performance.'''
        answer,usage=converse(system,json.dumps(metrics,ensure_ascii=False))
        return {'explanation':answer[:6000],'usage':usage,'model':MODEL}
    finally: _busy.release()
