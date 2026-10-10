import {position,height,seeded} from './terrain.js';
const sampleNow={},sampleNext={};

export const COLORS={blue:0x379aff,red:0xff526b,green:0x54e8a1,unknown:0xf5f8ff};
export const LABELS={blue:'A · 합류',red:'B · 게임 제거',green:'C · 경고 후 퇴장',unknown:'흰색 · 미확인'};
export const EFFECT_RADIUS=24; // Arbitrary visual units, not a weapon damage model.
export class Scenario {
  constructor(seed=42,count=24){this.seed=seed>>>0;this.count=count;this.mode='flight';this.paused=false;this.auto=true;this.reset();}
  reset(){this.time=0;this.rng=seeded(this.seed);this.intruders=[];this.effects=[];this.events=[];this.serial=0;this.nextSpawn=6;this.selected='SIM-001';this.pilot='auto';this.manual=null;this.totals={blue:0,green:0,red:0,hits:0,exits:0};this.log('시나리오 초기화 · 기본 드론은 모두 파랑');}
  log(text,color='blue',id=null){this.events.unshift({at:this.time,text,color,id});this.events.length=Math.min(40,this.events.length);}
  setMode(mode){if(!['flight','game'].includes(mode))return;this.mode=mode;this.log(mode==='game'?'합성 드론 게임 시작':'드론 시점 모드');}
  setCount(n){if(!Number.isInteger(n)||n<1||n>200)return;this.count=n;if(!this.agents().some(a=>a.id===this.selected))this.select('SIM-001');}
  select(id){if(this.agents().some(a=>a.id===id)){this.selected=id;this.pilot='auto';this.manual=null;return true;}return false;}
  spawn(){
    if(this.mode!=='game'||this.paused)return false;
    this.intruders=this.intruders.filter(a=>!a.hitAt||this.time-a.hitAt<3);
    if(this.intruders.length>=32){this.log('미확인 객체 한도 32개 · 초기화로 새 실험 시작','unknown');return false;}
    const serial=++this.serial,id='NEW-'+String(serial).padStart(3,'0');
    this.intruders.push({id,index:serial+500,color:'unknown',born:this.time,resultAt:null,hitAt:null});
    this.log(id+' 등장 · 가상 식별 대기','unknown',id);return id;
  }
  step(dt,input={}){
    if(this.paused)return;
    dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));this.time+=dt;
    if(this.mode==='game'){
      if(this.auto&&this.time>=this.nextSpawn){this.spawn();this.nextSpawn=this.time+9;}
      for(const a of this.intruders){
        if(a.color==='unknown'&&this.time-a.born>=3){
          const p=this.agent(a.index,a.id,a.color);a.classifiedPoint={x:p.x,y:p.y,z:p.z};
          a.color=['blue','red','green'][Math.floor(this.rng()*3)];a.resultAt=this.time;
          a.leaderIndex=a.index%this.count;
          a.exitPoint={x:p.x>=0?680:-680,y:p.y,z:p.z};
          this.totals[a.color]++;this.log(a.id+' → '+LABELS[a.color]+' (게임 난수)',a.color,a.id);
        }
        if(a.color==='green'&&!a.hitAt&&this.time-a.resultAt>=4){a.hitAt=this.time;this.totals.exits++;this.log(a.id+' 경고 종료 · 게임 영역에서 퇴장','green',a.id);}
        if(a.color==='red'&&!a.launchAt&&this.time-a.resultAt>=2){
          const target=this.agent(a.index,a.id,a.color),blue=this.agents().filter(b=>b.color==='blue');
          const source=blue.reduce((best,b)=>Math.hypot(b.x-target.x,b.y-target.y,b.z-target.z)<Math.hypot(best.x-target.x,best.y-target.y,best.z-target.z)?b:best,blue[0]);
          if(source){a.launchAt=this.time;a.frozenPoint={x:target.x,y:target.y,z:target.z};this.effects.push({id:a.id,x:target.x,y:target.y,z:target.z,from:{x:source.x,y:source.y,z:source.z},sourceId:source.id,at:this.time,radius:EFFECT_RADIUS});this.log(source.id+' → '+a.id+' A→B 게임 레이저 효과','red',a.id);}
        }
        if(a.launchAt&& !a.hitAt&&this.time-a.launchAt>=1){a.hitAt=this.time;this.totals.hits++;this.log(a.id+' 게임 객체 제거 · 점수 +1','red',a.id);}
      }
    }
    this.effects=this.effects.filter(e=>this.time-e.at<2.2);
    if(this.pilot==='manual'&&this.manual){
      const m=this.manual;const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));const axis=k=>Number.isFinite(input[k])?clamp(input[k],-1,1):0;
      m.heading+=axis('turn')*dt;
      const forward=axis('forward')*55*dt,side=axis('side')*55*dt;
      m.x=clamp(m.x-Math.sin(m.heading)*forward+Math.cos(m.heading)*side,-550,550);
      m.z=clamp(m.z-Math.cos(m.heading)*forward-Math.sin(m.heading)*side,-550,550);
      m.y=clamp(m.y+axis('up')*40*dt,height(m.x,m.z)+12,450);
    }
  }
  agent(index,id,color,extra={}){
    const p=position(index,this.time,sampleNow),next=position(index,this.time+.12,sampleNext);
    return {id,index,color,...p,heading:Math.atan2(-(next.x-p.x),-(next.z-p.z)),...extra};
  }
  agents(){
    const base=Array.from({length:this.count},(_,i)=>this.agent(i,'SIM-'+String(i+1).padStart(3,'0'),'blue'));
    if(this.manual&&this.pilot==='manual'){const a=base.find(a=>a.id===this.selected);if(a)Object.assign(a,this.manual);}
    const extra=this.intruders.filter(a=>!a.hitAt).map(a=>{
      const p=this.agent(a.index,a.id,a.color,{...a.frozenPoint,born:a.born,warningRemaining:a.color==='green'?Math.max(0,4-(this.time-a.resultAt)):null});
      if(a.classifiedPoint&&(a.color==='blue'||a.color==='green')){
        const leader=base[a.leaderIndex%base.length],dest=a.color==='blue'?{x:leader.x+18,y:leader.y+10,z:leader.z+18}:a.exitPoint;
        const t=Math.min(1,Math.max(0,(this.time-a.resultAt)/(a.color==='blue'?2:4))),blend=t*t*(3-2*t),from=a.classifiedPoint;
        p.x=from.x+(dest.x-from.x)*blend;p.z=from.z+(dest.z-from.z)*blend;
        p.y=Math.max(from.y+(dest.y-from.y)*blend,height(p.x,p.z)+20);
        p.heading=a.color==='blue'?leader.heading:Math.atan2(-(dest.x-from.x),-(dest.z-from.z));
      }
      return p;
    });
    return base.concat(extra);
  }
  setPilot(mode){
    if(!['auto','manual'].includes(mode))return;
    if(mode==='manual'){
      const a=this.agents().find(a=>a.id===this.selected);
      if(!a||!a.id.startsWith('SIM-'))return;
      this.manual={x:a.x,y:a.y,z:a.z,heading:a.heading};
    }else this.manual=null;
    this.pilot=mode;
  }
  summary(){return {mode:this.mode,paused:this.paused,auto:this.auto,time:this.time,seed:this.seed,selected:this.selected,pilot:this.pilot,totals:{...this.totals},events:this.events.slice(0,8),agents:this.agents().map(a=>({id:a.id,color:a.color,x:a.x,y:a.y,z:a.z,heading:a.heading,warningRemaining:a.warningRemaining})),effects:this.effects.map(e=>({...e}))};}
}
