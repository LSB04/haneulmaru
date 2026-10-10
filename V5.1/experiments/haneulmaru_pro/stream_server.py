"""PC rendered WebRTC mode, separate from 8790 and 8791. Signaling plus authenticated NU40 input."""
import server
import clika_bridge
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
import secrets,json,threading,subprocess,sys,re,webbrowser,base64,time,argparse,os
from collections import deque
import shutil
from nu40_imu import ImuHub
from multidevice_app.phone_imu import PhoneImu
PHONE_IMU=PhoneImu()
IMU=None
MODEL=server.ROOT.parents[1]/"+imu data"/"nu40-imu-direction-training(1).json"
HOST=secrets.token_urlsafe(24);PHONE=secrets.token_urlsafe(24);URL='';LOCK=threading.Lock();MESSAGES=deque(maxlen=256);SEQ=0
PORT=8795;TELEMETRY={}
ASSETS=dict(server.ASSETS)
ASSETS.update({'/'+n:server.ROOT/n for n in ['rtc.js','host-stream.js','receiver.js','receiver.html','clika-panel.js']})
ASSETS.update({'/'+n:server.ROOT/n for n in ['scenario.js','hud.js','game-info.json']})
ASSETS['/android-app.apk']=server.ROOT.parents[1]/'android-usb'/'dist'/'haneulmaru-v51-usb.apk'

ASSETS['/host']=server.ROOT/'index.html';ASSETS['/phone']=server.ROOT/'receiver.html';ASSETS['/']=server.ROOT/'receiver.html'
class Handler(server.Handler):
 def local_host(self):
  origin='http://127.0.0.1:'+str(PORT)
  return (self.client_address[0]=='127.0.0.1' and self.headers.get('Host')=='127.0.0.1:'+str(PORT)
   and self.headers.get('Origin',origin)==origin and self.headers.get('Sec-Fetch-Site','same-origin') in ('same-origin','none')
   and not any(self.headers.get(h) for h in ('CF-Ray','Forwarded','X-Forwarded-For','X-Forwarded-Host')))
 def role(self):
  value=self.headers.get('Authorization','')
  if secrets.compare_digest(value,'Bearer '+HOST):return 'host'
  if secrets.compare_digest(value,'Bearer '+PHONE):return 'phone'
 def send_json(self,status,value):return self.send(status,json.dumps(value).encode(),'application/json')
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/stream/host-session':
   if not self.local_host():return self.send_json(403,{'error':'PC 로컬 주소에서만 접속할 수 있습니다.'})
   # Only this exact loopback origin may recover a host session; never return CLIKA credentials.
   return self.send_json(200,{'key':HOST})
  if path.startswith('/stream/'):
   role=self.role()
   if not role:return self.send_json(401,{'error':'unauthorized'})
   if path=='/stream/ai/status':return self.send_json(200,clika_bridge.status())
   if path=='/stream/ai/job':return self.send_json(200,clika_bridge.job_status(parse_qs(urlsplit(self.path).query).get('id',[''])[0]))
   if path=='/stream/telemetry':
    if role!='host' or not self.local_host():return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
    with LOCK:value=dict(TELEMETRY)
    return self.send_json(200,value)
   if path in ('/stream/imu','/stream/imu-model'):
    if role!='host' or not self.local_host():return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
    if path=='/stream/imu':
     if IMU is None:return self.send_json(503,{'error':'IMU 입력이 비활성화되어 있습니다. (--no-imu)'})
     return self.send_json(200,PHONE_IMU.merge(IMU.snapshot()))
    try:
     model=json.loads(MODEL.read_text(encoding='utf-8-sig'))
     return self.send_json(200,{key:model[key] for key in ('format','schema_version','units','directions','rate_threshold_dps','similarity_threshold')})
    except (OSError,ValueError,KeyError,TypeError):return self.send_json(503,{'error':'IMU 방향 모델 파일을 확인하세요.'})
   if path=='/stream/info' and role=='host':
    url=(URL or 'http://127.0.0.1:'+str(PORT))+'/phone#'+PHONE
    from reportlab.graphics.barcode import qr
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics import renderSVG
    code=qr.QrCodeWidget(url);x,y,w,h=code.getBounds();drawing=Drawing(w,h);drawing.add(code)
    return self.send_json(200,{'url':url,'qr':base64.b64encode(renderSVG.drawToString(drawing).encode()).decode()})
   if path=='/stream/signal':
    try:after=int(parse_qs(urlsplit(self.path).query).get('after',['0'])[0])
    except ValueError:return self.send_json(400,{'error':'cursor'})
    with LOCK:messages=[{'id':i,'message':m} for i,r,m,t in MESSAGES if r!=role and i>after and time.monotonic()-t<300]
    return self.send_json(200,messages)
   return self.send_json(404,{})
  f=ASSETS.get(path)
  if not f or not f.is_file():return self.send(404,b'Not found','text/plain')
  kind={'js':'text/javascript','webmanifest':'application/manifest+json','apk':'application/vnd.android.package-archive'}.get(f.suffix[1:],server.mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
  return self.send(200,f.read_bytes(),kind)
 def do_POST(self):
  global SEQ
  role=self.role()
  if not role:return self.send_json(401,{})
  path=urlsplit(self.path).path
  if path=='/stream/phone-imu':
   if role!='phone':return self.send_json(403,{'error':'phone role required'})
   if IMU is None:return self.send_json(503,{'error':'IMU disabled on PC'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<=2048:raise ValueError('request too large')
    data=json.loads(self.rfile.read(size))
    return self.send_json(200,PHONE_IMU.accept(data))
   except (ValueError,TypeError):return self.send_json(400,{'error':'invalid, stale or competing sensor sample'})
  if path in ('/stream/ai/request','/stream/telemetry'):
   if path=='/stream/telemetry' and (role!='host' or not self.local_host()):return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<=30000:raise ValueError('요청 크기 오류')
    data=json.loads(self.rfile.read(size))
    if not isinstance(data,dict):raise ValueError('요청 형식 오류')
    if path.endswith('request'):
     if data.get('kind')=='explain':
      with LOCK:data['metrics']=dict(TELEMETRY)
     result=clika_bridge.request(data)
    else:
     value=clika_bridge.metrics_only(data.get('metrics',{}));value['receivedAt']=time.time()
     with LOCK:TELEMETRY.clear();TELEMETRY.update(value)
     result={'ok':True}
    return self.send_json(200,result)
   except (ValueError,TypeError) as e:return self.send_json(400,{'error':str(e)})
  if path!='/stream/signal':return self.send_json(404,{})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=200000:raise ValueError()
   message=json.loads(self.rfile.read(size))
   if not isinstance(message,dict) or message.get('type') not in ({'offer','ice'} if role=='host' else {'ready','answer','ice'}):raise ValueError()
   if not isinstance(message.get('session'),str) or not 1<=len(message['session'])<=80:raise ValueError()
  except (ValueError,TypeError):return self.send_json(400,{'error':'invalid signal'})
  with LOCK:SEQ+=1;MESSAGES.append((SEQ,role,message,time.monotonic()))
  return self.send_json(200,{'ok':True})
def main():
 global URL,PORT,IMU
 parser=argparse.ArgumentParser()
 parser.add_argument('--port',type=int,default=8795)
 parser.add_argument('--no-browser',action='store_true')
 parser.add_argument('--local',action='store_true')
 parser.add_argument('--gpu-browser',action='store_true')
 parser.add_argument('--benchmark',action='store_true')
 parser.add_argument('--imu-port')
 parser.add_argument('--ble-address')
 parser.add_argument('--no-imu',action='store_true')
 parser.add_argument('--no-ble',action='store_true')
 args=parser.parse_args();PORT=args.port
 try:http=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
 except OSError:print('Port '+str(PORT)+' occupied. Existing stream server may be running.',flush=True);return 1
 threading.Thread(target=http.serve_forever,daemon=True).start()
 child=None
 try:
  if not args.no_imu:
   try:
    IMU=ImuHub(port=args.imu_port,ble_address=args.ble_address,ble=not args.no_ble)
    IMU.start()
   except Exception:
    if IMU:
     try:IMU.stop()
     except Exception:pass
    IMU=None
    print('Optional IMU unavailable; the game server continues without sensor input.',flush=True)
  host='http://127.0.0.1:'+str(PORT)+'/host'+('?benchmark=compare' if args.benchmark else '')+'#'+HOST
  print('PC: '+host,flush=True)
  if not args.no_browser:
   chrome=next((p for p in [os.path.join(os.environ.get('PROGRAMFILES',''),'Google/Chrome/Application/chrome.exe'),os.path.join(os.environ.get('LOCALAPPDATA',''),'Google/Chrome/Application/chrome.exe')] if os.path.isfile(p)),None)
   if args.gpu_browser and chrome:
    from gpu_browser import launch
    launch(host,server.ROOT.parents[1])
   else:webbrowser.open(host)
  bundled=server.ROOT.parents[1]/'tools/cloudflared/cloudflared.exe'
  exe=str(bundled) if bundled.is_file() else shutil.which('cloudflared')
  if args.local or not exe or not server.Path(exe).is_file():
   print('Local mode: no public HTTPS tunnel. Keep this server running.',flush=True)
   threading.Event().wait()
  else:
   child=subprocess.Popen([str(exe),'tunnel','--no-autoupdate','--url',f'http://127.0.0.1:{args.port}','--protocol','http2'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
   for line in child.stdout:
    m=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',line)
    if m and not URL:URL=m.group(0);print('PHONE: '+URL+'/phone#'+PHONE,flush=True)
    if 'ERR' in line:print(line.strip(),flush=True)
 except KeyboardInterrupt:pass
 finally:
  if child:
   child.terminate()
   try:child.wait(timeout=5)
   except subprocess.TimeoutExpired:child.kill();child.wait()
  clika_bridge.stop()
  if IMU:IMU.stop()
  http.shutdown();http.server_close()
 return 0
if __name__=='__main__':sys.exit(main())
