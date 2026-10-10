import {ViewGesture} from './view-controls.js';
import {parseConnectionLink} from './connection-link.js';
import {installMovementPad} from './manual-controls.js';
import {installAI} from './clika-panel.js';
import {signaling,peer,sendData} from './rtc.js';import {updateHUD} from './hud.js';
const $=id=>document.getElementById(id),video=$('remote');let pc=null,id='',pending=[],seq=0,state=null,catalog=null,statsLast=null,rtt=0,streamKey='sharp',hostHidden=false;
const status=s=>$('status').textContent=s,signal=signaling('phone',status),gesture=new ViewGesture();
function control(data){if(pc?.channel?.readyState!=='open'){status('PC 연결 시작으로 먼저 연결하세요.');return;}sendData(pc,{type:'control',...data,seq:++seq});}
const pad=installMovementPad($('movePad'),control);
function padState(){const manual=state?.pilot==='manual';$('movePad').hidden=!manual;document.body.classList.toggle('manual-flight',manual);pad.setEnabled(manual&&!state.paused&&pc?.channel?.readyState==='open');$('moveHint').textContent=state?.paused?'일시정지 · 재생 후 이동':'왼쪽 이동 · 오른쪽 높이 / 센서는 시선';}
function data(d){
 if(d.type==='pong'){rtt=Math.round(performance.now()-d.at);return;}if(d.type!=='state'||!d.scenario)return;
 state=d.scenario;hostHidden=d.hostHidden===true;updateHUD(state,catalog);
 $('flight').classList.toggle('active',state.mode==='flight');$('game').classList.toggle('active',state.mode==='game');document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===d.view));
 $('pilot').value=state.pilot;padState();$('spawn').disabled=state.mode!=='game'||state.paused;$('pause').textContent=state.paused?'재생':'일시정지';$('autoArrival').checked=state.auto;$('count').value=d.count;$('countText').textContent=d.count;$('gpu').textContent='PC GPU: '+d.gpu;
 if(d.streamKey){streamKey=d.streamKey;$('streamQuality').value=streamKey;}
 if(d.transport)$('transport').textContent=`송신 ${d.transport.mbps.toFixed(1)} Mbps · 인코딩 ${d.transport.encodeMs.toFixed(1)}ms`;
}
async function start(){pad.stop();pad.setEnabled(false);pc?.close();pending=[];id=crypto.randomUUID();pc=peer(status,data);const current=pc,thisId=id;statsLast=null;
 pc.onicecandidate=e=>{if(e.candidate)signal.send({type:'ice',session:thisId,candidate:e.candidate.toJSON()}).catch(e=>status(e.message));};
 pc.ontrack=e=>{if(pc!==current)return;video.srcObject=e.streams[0]||new MediaStream([e.track]);video.play().catch(()=>status('영상 재생을 위해 PC 연결 시작을 눌러주세요.'));};
 pc.ondatachannel=e=>{pc.channel=e.channel;e.channel.onclose=()=>pad.setEnabled(false);e.channel.onmessage=ev=>{try{data(JSON.parse(ev.data));}catch{}};e.channel.onopen=()=>{control({aspect:innerWidth/innerHeight,streamKey});status('연결됨 · 첫 영상 대기');};};
 await signal.send({type:'ready',session:id});status('PC 렌더러 연결 대기');}
$('start').onclick=()=>start().catch(e=>status(e.message));signal.poll(async m=>{if(m.session!==id||!pc)return;if(m.type==='offer'){await pc.setRemoteDescription(m.sdp);for(const c of pending)await pc.addIceCandidate(c);pending=[];await pc.setLocalDescription(await pc.createAnswer());await signal.send({type:'answer',session:id,sdp:pc.localDescription});}if(m.type==='ice'){if(pc.remoteDescription)await pc.addIceCandidate(m.candidate);else pending.push(m.candidate);}});
$('flight').onclick=()=>control({mission:'flight'});$('game').onclick=()=>control({mission:'game'});document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>control({view:b.dataset.view}));
$('selected').onchange=()=>{pad.stop();control({selected:$('selected').value});};$('pilot').onchange=()=>{pad.stop();control({pilot:$('pilot').value,...($('pilot').value==='manual'?{paused:false,view:'cockpit'}:{})});};$('spawn').onclick=()=>control({spawn:true});$('pause').onclick=()=>control({paused:!state?.paused});$('reset').onclick=()=>control({reset:true});$('restart').onclick=()=>control({restart:true});$('autoArrival').onchange=()=>control({auto:$('autoArrival').checked});$('count').oninput=()=>control({count:+$('count').value});$('streamQuality').onchange=()=>control({streamKey:$('streamQuality').value});
const touch=$('touch');
touch.onpointerdown=e=>{touch.setPointerCapture(e.pointerId);gesture.down(e.pointerId,e.clientX,e.clientY);};
touch.onpointermove=e=>{const d=gesture.move(e.pointerId,e.clientX,e.clientY,innerWidth,innerHeight);if(d)control(d);};
touch.onpointerup=touch.onpointercancel=touch.onlostpointercapture=e=>gesture.up(e.pointerId);
addEventListener('blur',()=>gesture.clear());
$('zoomIn').onclick=()=>control({zoom:.8});$('zoomOut').onclick=()=>control({zoom:1.25});
$('connectAddress').onclick=()=>{try{location.assign(parseConnectionLink($('qrAddress').value));}catch(e){status(e.message);}};
$('copyAddress').onclick=async()=>{const url=signal.connectionUrl();if(!url){status('PC의 최신 QR 주소를 먼저 입력하세요.');return;}$('qrAddress').value=url;try{await navigator.clipboard.writeText(url);status('연결키를 포함한 주소 복사됨 · 앱 주소칸에 붙여넣으세요.');}catch{$('qrAddress').focus();$('qrAddress').select();status('주소칸의 전체 주소를 복사하세요.');}};
function resize(){if(pc?.channel?.readyState==='open')control({aspect:innerWidth/innerHeight});}addEventListener('resize',resize);screen.orientation?.addEventListener('change',resize);
$('moveStop').onclick=()=>{pad.stop();control({pilot:'auto'});};
$('menu').onclick=async()=>{const clean=document.body.classList.toggle('clean');$('menu').textContent=clean?'메뉴 열기':'몰입 화면';if(clean){try{await document.documentElement.requestFullscreen();}catch{}}else if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});};
setInterval(async()=>{if(pc?.connectionState!=='connected')return;sendData(pc,{type:'ping',at:performance.now()});try{for(const s of(await pc.getStats()).values())if(s.type==='inbound-rtp'&&s.kind==='video'){const fps=statsLast?(s.framesDecoded-statsLast.frames)*1000/(s.timestamp-statsLast.at):0;statsLast={frames:s.framesDecoded,at:s.timestamp};$('metric').textContent=`영상 ${fps.toFixed(1)} FPS · 조작 왕복 ${rtt}ms · ${s.frameWidth||0}×${s.frameHeight||0}`;status(hostHidden?'PC 지형 탭을 맨 앞으로 띄우세요.':s.framesDecoded>0?'V5.1 영상 수신 중':'첫 영상 프레임 대기');}}catch{}},1000);
fetch('game-info.json').then(r=>r.json()).then(d=>catalog=d).catch(()=>{});
addEventListener('pagehide',()=>{pad.destroy();pc?.close();signal.stop();});

installAI({applyScene(s){if(pc?.channel?.readyState!=="open")throw Error("PC 연결 시작으로 먼저 연결하세요.");control({scene:s});}},signal,()=>null,document.getElementById("phoneControls"));
