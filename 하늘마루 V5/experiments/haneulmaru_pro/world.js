import {addAirfield,inAirfield} from './airfield.js';
import * as T from 'three';
import {height,position,seeded,SIZE} from './terrain.js';
export const profiles={low:{segments:96,trees:240,rocks:80,shadow:0,dpr:1},balanced:{segments:192,trees:900,rocks:200,shadow:1024,dpr:1.25},high:{segments:320,trees:2500,rocks:600,shadow:2048,dpr:1.5},ultra:{segments:480,trees:5000,rocks:1100,shadow:4096,dpr:2}};
export function buildWorld(quality='balanced'){
 const profile=profiles[quality],root=new T.Group(),rand=seeded(871),dummy=new T.Object3D();
 const standard=(color,more={})=>new T.MeshStandardMaterial({color,roughness:.88,...more});
 const g=new T.PlaneGeometry(SIZE,SIZE,profile.segments,profile.segments);g.rotateX(-Math.PI/2);
 const a=g.attributes.position,colors=[];
 for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i),h=height(x,z);a.setY(i,h);const slope=Math.hypot(height(x+2,z)-h,height(x,z+2)-h)/2;const c=new T.Color(h<2?0x76846c:slope>1.2?0x77756f:h>130?0xa8a7a0:h>82?0x707c60:0x557551);c.multiplyScalar(.87+rand()*.22);colors.push(c.r,c.g,c.b);}
 g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
 const ground=new T.Mesh(g,standard(0xffffff,{vertexColors:true}));ground.receiveShadow=true;root.add(ground);
 // Fine procedural surface relief in the fragment shader; no external textures/download dependency.
 ground.material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain;').replace('#include <color_fragment>','#include <color_fragment>\nfloat grain=sin(vTerrain.x*1.7)*sin(vTerrain.z*1.9)*0.035+sin(vTerrain.x*.39+vTerrain.z*.72)*0.025;diffuseColor.rgb*=1.0+grain;');};
 function instances(geo,mat,points,cast=true){const mesh=new T.InstancedMesh(geo,mat,points.length);points.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rot||0,0);dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.castShadow=cast;mesh.receiveShadow=true;root.add(mesh);return mesh;}
 const trunks=[],crowns=[],rocks=[];
 for(let i=0;i<profile.trees*3&&trunks.length<profile.trees;i++){const x=(rand()-.5)*1120,z=(rand()-.5)*1120,h=height(x,z);if(inAirfield(x,z,22)||h<9||h>142||Math.abs(height(x+4,z)-h)>5)continue;const s=1+rand()*1.9;trunks.push({x,y:h+2*s,z,sx:s,sy:s,sz:s});crowns.push({x,y:h+7*s,z,sx:s,sy:s,sz:s,rot:rand()*6.28});}
 instances(new T.CylinderGeometry(.45,.8,4,5),standard(0x594b3a),trunks,false);
 const forest=instances(new T.ConeGeometry(3.4,12,7),standard(0x254d3c),crowns);
 crowns.forEach((_,i)=>forest.setColorAt(i,new T.Color().setHSL(.28+rand()*.09,.21+rand()*.2,.16+rand()*.15)));
 for(let i=0;i<profile.rocks;i++){const x=(rand()-.5)*1120,z=(rand()-.5)*1120,s=1.5+rand()*5;if(inAirfield(x,z,22))continue;rocks.push({x,y:height(x,z)+s*.3,z,sx:s,sy:s*.7,sz:s*.9,rot:rand()*6});}
 instances(new T.DodecahedronGeometry(1,0),standard(0x94918a),rocks);
 addAirfield(root);
 const waterMat=new T.ShaderMaterial({transparent:true,opacity:.9,depthWrite:false,uniforms:{time:{value:0}},vertexShader:`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 p;uniform float time;void main(){float w=sin(p.x*.35+time*.9)*sin(p.z*.18-time*.65);float f=pow(max(0.,sin(p.x*.095+p.z*.27+time)),20.);vec3 c=mix(vec3(.06,.26,.31),vec3(.15,.46,.5),w*.3+.5)+f*.09;gl_FragColor=vec4(c,.86);}`});
 const water=new T.Mesh(new T.PlaneGeometry(SIZE,SIZE),waterMat);water.rotation.x=-Math.PI/2;water.position.y=1;root.add(water);
 const mats=[0x379aff,0xff526b,0x54e8a1,0xf5f8ff].map(color=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.3,metalness:.35,roughness:.3}));
 const drones=new T.Group();root.add(drones);const batches=[];
 for(let c=0;c<4;c++){
  const parts=[];for(const [geo,offset,angle]of [[new T.SphereGeometry(1.3,8,6),[0,0,0],0],[new T.BoxGeometry(9,.5,.6),[0,0,0],Math.PI/4],[new T.BoxGeometry(9,.5,.6),[0,0,0],-Math.PI/4],...[[-3,-3],[-3,3],[3,-3],[3,3]].map(([x,z])=>[new T.TorusGeometry(1.3,.18,4,10),[x,.1,z],0])]){const m=new T.InstancedMesh(geo,mats[c],232);m.count=0;m.frustumCulled=false;drones.add(m);parts.push({mesh:m,offset,angle,rotor:geo.type==='TorusGeometry'});}batches.push(parts);
 }
 const temp=new T.Object3D();let count=24;const positions=[];
 const pathG=new T.BufferGeometry(),pathArray=new Float32Array(64*3);pathG.setAttribute('position',new T.BufferAttribute(pathArray,3));const trail=new T.Line(pathG,new T.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.65}));root.add(trail);
 function update(t,agents=[],hiddenId=null){waterMat.uniforms.time.value=t;positions.length=0;const counters=[0,0,0,0];for(const p of agents){positions.push(p);if(p.id===hiddenId)continue;const c=({blue:0,red:1,green:2,unknown:3})[p.color]??3,index=counters[c]++;if(index>=232)continue;for(const part of batches[c]){const heading=p.heading||0,ox=part.offset[0],oz=part.offset[2];temp.position.set(p.x+ox*Math.cos(heading)+oz*Math.sin(heading),p.y+part.offset[1],p.z-ox*Math.sin(heading)+oz*Math.cos(heading));temp.rotation.set(part.rotor?Math.PI/2:0,part.angle+heading,0);temp.scale.setScalar(p.id.startsWith('NEW-')?2:1.5);temp.updateMatrix();part.mesh.setMatrixAt(index,temp.matrix);}}for(let c=0;c<4;c++)for(const part of batches[c]){part.mesh.count=Math.min(counters[c],232);part.mesh.instanceMatrix.needsUpdate=true;}trail.visible=false;}
 function dispose(){const geos=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)materials.add(o.material);});geos.forEach(g=>g.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();});}
 update(0);return {root,update,positions,dispose,profile,ground};
}
