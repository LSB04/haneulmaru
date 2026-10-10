"""PC rendered WebRTC mode, separate from 8790 and 8791. Signaling only."""
import server
import bedrock_bridge
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
import secrets,json,threading,subprocess,sys,re,webbrowser,base64,time,argparse,os
from collections import deque
HOST=secrets.token_urlsafe(24);PHONE=secrets.token_urlsafe(24);URL='';LOCK=threading.Lock();MESSAGES=deque(maxlen=256);SEQ=0
PORT=8792;TELEMETRY={}
ASSETS=dict(server.ASSETS)
ASSETS.update({'/'+n:server.ROOT/n for n in ['rtc.js','host-stream.js','receiver.js','receiver.html','ai-panel.js']})
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
   # Only this exact loopback origin may recover a host session; never return AWS credentials.
   return self.send_json(200,{'key':HOST})
  if path.startswith('/stream/'):
   role=self.role()
   if not role:return self.send_json(401,{'error':'unauthorized'})
   if path in ('/stream/ai/status','/stream/telemetry'):
    if role!='host' or not self.local_host():return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
    if path.endswith('status'):return self.send_json(200,bedrock_bridge.status())
    with LOCK:value=dict(TELEMETRY)
    return self.send_json(200,value)
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
  kind={'js':'text/javascript','webmanifest':'application/manifest+json'}.get(f.suffix[1:],server.mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
  return self.send(200,f.read_bytes(),kind)
 def do_POST(self):
  global SEQ
  role=self.role()
  if not role:return self.send_json(401,{})
  path=urlsplit(self.path).path
  if path in ('/stream/ai/credential','/stream/ai/request','/stream/telemetry'):
   if role!='host' or not self.local_host():return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<=30000:raise ValueError('요청 크기 오류')
    data=json.loads(self.rfile.read(size))
    if not isinstance(data,dict):raise ValueError('요청 형식 오류')
    if path.endswith('credential'):result=bedrock_bridge.credential(data.get('token'))
    elif path.endswith('request'):result=bedrock_bridge.request(data)
    else:
     value=bedrock_bridge.metrics_only(data.get('metrics',{}));value['receivedAt']=time.time()
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
 global URL,PORT
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8792);parser.add_argument('--no-browser',action='store_true');parser.add_argument('--local',action='store_true');parser.add_argument('--gpu-browser',action='store_true');parser.add_argument('--benchmark',action='store_true');args=parser.parse_args();PORT=args.port
 try:http=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
 except OSError:print('Port '+str(PORT)+' occupied. Existing stream server may be running.',flush=True);return 1
 threading.Thread(target=http.serve_forever,daemon=True).start();host='http://127.0.0.1:'+str(PORT)+'/host'+('?benchmark=compare' if args.benchmark else '')+'#'+HOST
 print('PC: '+host,flush=True)
 if not args.no_browser:
  chrome=next((p for p in [os.path.join(os.environ.get('PROGRAMFILES',''),'Google/Chrome/Application/chrome.exe'),os.path.join(os.environ.get('LOCALAPPDATA',''),'Google/Chrome/Application/chrome.exe')] if os.path.isfile(p)),None)
  if args.gpu_browser and chrome:
   profile=server.ROOT.parents[1]/'output/gpu_browser_profile'
   subprocess.Popen([chrome,'--user-data-dir='+str(profile),'--force-high-performance-gpu','--no-first-run','--no-default-browser-check','--new-window',host])
  else:webbrowser.open(host)
 if args.local:
  try:threading.Event().wait()
  except KeyboardInterrupt:pass
  finally:http.shutdown();http.server_close()
  return 0
 exe=server.ROOT.parents[1]/'tools/cloudflared/cloudflared.exe'
 child=subprocess.Popen([str(exe),'tunnel','--no-autoupdate','--url','http://127.0.0.1:'+str(PORT),'--protocol','http2'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
 try:
  for line in child.stdout:
   m=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',line)
   if m and not URL:URL=m.group(0);print('PHONE: '+URL+'/phone#'+PHONE,flush=True)
   if 'ERR' in line:print(line.strip(),flush=True)
 except KeyboardInterrupt:pass
 finally:
  child.terminate()
  try:child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.kill();child.wait()
  http.shutdown();http.server_close()
 return 0
if __name__=='__main__':sys.exit(main())
