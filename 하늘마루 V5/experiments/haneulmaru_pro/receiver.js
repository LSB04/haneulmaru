import {installAI} from './clika-panel.js';
import {signaling,peer,sendData} from './rtc.js';import {updateHUD} from './hud.js';
const $=id=>document.getElementById(id),video=$('remote');let pc=null,id='',pending=[],seq=0,state=null,catalog=null,statsLast=null,rtt=0,streamKey='sharp',hostHidden=false;
const status=s=>$('status').textContent=s,signal=signaling('phone',status),points=new Map();let pinch=0,move={},moveActive=false;
function control(data){if(pc?.channel?.readyState!=='open'){status('PC 연결 시작으로 먼저 연결하세요.');return;}sendData(pc,{type:'control',...data,seq:++seq});}
function data(d){
 if(d.type==='pong'){rtt=Math.round(performance.now()-d.at);return;}if(d.type!=='state'||!d.scenario)return;
 state=d.scenario;hostHidden=d.hostHidden===true;updateHUD(state,catalog);
 $('flight').classList.toggle('active',state.mode==='flight');$('game').classList.toggle('active',state.mode==='game');document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===d.view));
 $('pilot').value=state.pilot;$('movePad').hidden=state.pilot!=='manual';$('spawn').disabled=state.mode!=='game'||state.paused;$('pause').textContent=state.paused?'재생':'일시정지';$('autoArrival').checked=state.auto;$('count').value=d.count;$('countText').textContent=d.count;$('gpu').textContent='PC GPU: '+d.gpu;
 if(d.streamKey){streamKey=d.streamKey;$('streamQuality').value=streamKey;}
 if(d.transport)$('transport').textContent=`송신 ${d.transport.mbps.toFixed(1)} Mbps · 인코딩 ${d.transport.encodeMs.toFixed(1)}ms`;
}
async function start(){pc?.close();pending=[];id=crypto.randomUUID();pc=peer(status,data);const current=pc,thisId=id;statsLast=null;
 pc.onicecandidate=e=>{if(e.candidate)signal.send({type:'ice',session:thisId,candidate:e.candidate.toJSON()}).catch(e=>status(e.message));};
 pc.ontrack=e=>{if(pc!==current)return;video.srcObject=e.streams[0]||new MediaStream([e.track]);video.play().catch(()=>status('영상 재생을 위해 PC 연결 시작을 눌러주세요.'));};
 pc.ondatachannel=e=>{pc.channel=e.channel;e.channel.onmessage=ev=>{try{data(JSON.parse(ev.data));}catch{}};e.channel.onopen=()=>{control({aspect:innerWidth/innerHeight,streamKey});status('연결됨 · 첫 영상 대기');};};
 await signal.send({type:'ready',session:id});status('PC 렌더러 연결 대기');}
$('start').onclick=()=>start().catch(e=>status(e.message));signal.poll(async m=>{if(m.session!==id||!pc)return;if(m.type==='offer'){await pc.setRemoteDescription(m.sdp);for(const c of pending)await pc.addIceCandidate(c);pending=[];await pc.setLocalDescription(await pc.createAnswer());await signal.send({type:'answer',session:id,sdp:pc.localDescription});}if(m.type==='ice'){if(pc.remoteDescription)await pc.addIceCandidate(m.candidate);else pending.push(m.candidate);}});
$('flight').onclick=()=>control({mission:'flight'});$('game').onclick=()=>control({mission:'game'});document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>control({view:b.dataset.view}));
$('selected').onchange=()=>control({selected:$('selected').value});$('pilot').onchange=()=>control({pilot:$('pilot').value});$('spawn').onclick=()=>control({spawn:true});$('pause').onclick=()=>control({paused:!state?.paused});$('reset').onclick=()=>control({reset:true});$('restart').onclick=()=>control({restart:true});$('autoArrival').onchange=()=>control({auto:$('autoArrival').checked});$('count').oninput=()=>control({count:+$('count').value});$('streamQuality').onchange=()=>control({streamKey:$('streamQuality').value});
const touch=$('touch');touch.onpointerdown=e=>{touch.setPointerCapture(e.pointerId);points.set(e.pointerId,[e.clientX,e.clientY]);pinch=0;};touch.onpointermove=e=>{const old=points.get(e.pointerId);if(!old)return;points.set(e.pointerId,[e.clientX,e.clientY]);if(points.size===1)control({dx:(e.clientX-old[0])/innerWidth,dy:(e.clientY-old[1])/innerHeight});else{const [a,b]=[...points.values()],next=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch>0)control({zoom:pinch/next});pinch=next;}};touch.onpointerup=touch.onpointercancel=e=>{points.delete(e.pointerId);pinch=0;};
for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);move={[b.dataset.move]:Number(b.dataset.sign)};moveActive=true;control({move});};b.onpointerup=b.onpointercancel=()=>{move={};moveActive=false;control({move});};}
setInterval(()=>{if(moveActive)control({move});},80);
function stopMove(){move={};moveActive=false;if(pc?.channel?.readyState==='open')control({move});}addEventListener('blur',stopMove);document.addEventListener('visibilitychange',stopMove);
function resize(){if(pc?.channel?.readyState==='open')control({aspect:innerWidth/innerHeight});}addEventListener('resize',resize);screen.orientation?.addEventListener('change',resize);
$('menu').onclick=async()=>{const clean=document.body.classList.toggle('clean');$('menu').textContent=clean?'메뉴 열기':'몰입 화면';if(clean){try{await document.documentElement.requestFullscreen();}catch{}}else if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});};
setInterval(async()=>{if(pc?.connectionState!=='connected')return;sendData(pc,{type:'ping',at:performance.now()});try{for(const s of(await pc.getStats()).values())if(s.type==='inbound-rtp'&&s.kind==='video'){const fps=statsLast?(s.framesDecoded-statsLast.frames)*1000/(s.timestamp-statsLast.at):0;statsLast={frames:s.framesDecoded,at:s.timestamp};$('metric').textContent=`영상 ${fps.toFixed(1)} FPS · 조작 왕복 ${rtt}ms · ${s.frameWidth||0}×${s.frameHeight||0}`;status(hostHidden?'PC 지형 탭을 맨 앞으로 띄우세요.':s.framesDecoded>0?'V5 영상 수신 중':'첫 영상 프레임 대기');}}catch{}},1000);
fetch('game-info.json').then(r=>r.json()).then(d=>catalog=d).catch(()=>{});
addEventListener('pagehide',()=>{stopMove();pc?.close();signal.stop();});

installAI({applyScene(s){if(pc?.channel?.readyState!=="open")throw Error("PC 연결 시작으로 먼저 연결하세요.");control({scene:s});}},signal,()=>null,document.getElementById("phoneControls"));
