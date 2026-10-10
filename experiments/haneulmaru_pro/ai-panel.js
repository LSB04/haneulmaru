export function installAI(bridge,signal,getTransport){
 const box=document.createElement('details');box.id='awsPanel';box.style.cssText='padding:12px;border:1px solid #6485ab;margin:12px 0';
 box.innerHTML=`<summary>AWS · 자연어 장면 설정</summary>
 <p>Claude Sonnet 4.6 · us-east-1. 아래 버튼을 누를 때만 AWS를 호출합니다.</p>
 <label>Bedrock 단기 API 키 <input id="awsKey" type="password" autocomplete="off" spellcheck="false" placeholder="PC에서 키 붙여넣기"></label>
 <button id="awsSave">키 연결</button><button id="awsClear">키 지우기</button><p id="awsStatus" role="status"></p>
 <p>키는 이 PC 서버 메모리에만 유지되며 재시작하면 사라집니다. 키 입력만으로 권한 검증이 완료되지는 않습니다.</p>
 <label>가상환경 설정 <textarea id="awsPrompt" rows="3" maxlength="2000" placeholder="비행체 80개, 해질녘, 높은 품질, 2D 지도"></textarea></label>
 <button id="awsAsk">설정 제안 받기</button><button id="awsApply" disabled>제안 적용</button>
 <button id="awsExplain">성능 측정 설명</button><pre id="awsResult" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>
 <p>입력 문장 또는 렌더링·전송 수치만 AWS에 보냅니다. 카메라 영상은 전송하지 않습니다.</p>`;
 document.getElementById('panel').append(box);const $=id=>document.getElementById(id);let proposal=null;
 box.querySelectorAll('input,textarea').forEach(e=>e.style.cssText='width:100%;box-sizing:border-box;background:#102631;color:#e8f6fc;border:1px solid #587887;padding:8px;border-radius:6px');
 box.querySelectorAll('button').forEach(e=>e.style.margin='3px 2px');
 if(new URLSearchParams(location.search).get('aws')==='1'){box.open=true;setTimeout(()=>box.scrollIntoView({block:'start'}),500);}
 const local=location.hostname==='127.0.0.1';
 async function refresh(){if(!local){$('awsStatus').textContent='PC의 로컬 렌더러에서 설정하세요.';box.querySelectorAll('input,button,textarea').forEach(e=>e.disabled=true);return;}try{const s=await signal.api('ai/status');$('awsStatus').textContent=s.configured?'키 입력됨 · 요청 버튼으로 모델 접근 확인':'AWS 키 연결 대기';}catch(e){$('awsStatus').textContent=e.message;}}refresh();
 $('awsSave').onclick=async()=>{const value=$('awsKey').value.trim();if(!value){$('awsStatus').textContent='단기 키를 먼저 붙여넣으세요.';return;}$('awsSave').disabled=true;try{await signal.api('ai/credential',{token:value});$('awsKey').value='';await refresh();}catch(e){$('awsStatus').textContent=e.message+' · 입력값을 유지했습니다. 연결 복구 후 다시 누르세요.';}finally{$('awsSave').disabled=false;}};
 $('awsClear').onclick=async()=>{try{await signal.api('ai/credential',{token:''});$('awsKey').value='';refresh();}catch(e){$('awsStatus').textContent=e.message;}};
 async function ask(kind){proposal=null;$('awsApply').disabled=true;const measured=bridge.benchmarkMetrics(),metrics={...(measured||{}),...(getTransport()||{})};if(kind==='explain'&&!measured){$('awsResult').textContent='먼저 10초 성능 측정을 실행하세요.';return;}
 $('awsAsk').disabled=$('awsExplain').disabled=true;$('awsResult').textContent='AWS 응답 대기…';
 try{const r=await signal.api('ai/request',kind==='scene'?{kind,prompt:$('awsPrompt').value}:{kind,metrics},55000);proposal=r.settings||null;$('awsApply').disabled=!proposal||!Object.keys(proposal).length;$('awsResult').textContent=r.explanation+(proposal?'\n\n'+JSON.stringify(proposal,null,2):'')+'\n\n토큰: 입력 '+(r.usage?.inputTokens??'—')+' / 출력 '+(r.usage?.outputTokens??'—');$('awsStatus').textContent='Bedrock 호출 성공 · '+r.model;}catch(e){$('awsResult').textContent=e.message;}finally{$('awsAsk').disabled=$('awsExplain').disabled=false;}}
 $('awsAsk').onclick=()=>ask('scene');$('awsExplain').onclick=()=>ask('explain');$('awsApply').onclick=()=>{if(proposal){bridge.applyScene(proposal);$('awsApply').disabled=true;$('awsResult').textContent+='\n장면에 적용했습니다.';}};
}
