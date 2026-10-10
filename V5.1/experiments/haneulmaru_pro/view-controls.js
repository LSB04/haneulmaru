const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));

// Zoom is independent of IMU rotation. A disabled OrbitControls must not reset
// the orientation supplied by the sensor when changing the overview distance.
export function applyCameraZoom(state,ratio){
 if(!Number.isFinite(ratio)||ratio<=.2||ratio>=5)return state.chaseDistance;
 const {view,camera,ortho,controls}=state;
 if(view==='chase')return clamp(state.chaseDistance*ratio,15,150);
 if(view==='overview'){
  camera.position.sub(controls.target).multiplyScalar(ratio).clampLength(12,1900).add(controls.target);
  if(controls.enabled)controls.update();
 }
 if(view==='map'){ortho.zoom=clamp(ortho.zoom/ratio,.5,12);ortho.updateProjectionMatrix();}
 if(view==='cockpit'){camera.zoom=clamp(camera.zoom/ratio,1,4);camera.updateProjectionMatrix();}
 return state.chaseDistance;
}

export class ViewGesture {
 constructor(){this.points=new Map();}
 down(id,x,y){this.points.set(id,[x,y]);}
 up(id){this.points.delete(id);}
 clear(){this.points.clear();}
 distance(){const [a,b]=[...this.points.values()];return b?Math.hypot(a[0]-b[0],a[1]-b[1]):0;}
 move(id,x,y,width,height){
  const old=this.points.get(id);if(!old)return null;
  const before=this.distance();this.points.set(id,[x,y]);
  if(this.points.size===1)return width>0&&height>0?{dx:(x-old[0])/width,dy:(y-old[1])/height}:null;
  const after=this.distance();return before>5&&after>5?{zoom:clamp(before/after,.25,4)}:null;
 }
}
