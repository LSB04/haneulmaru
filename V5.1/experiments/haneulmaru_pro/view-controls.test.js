import test from 'node:test';import assert from 'node:assert/strict';
import {Vector3,PerspectiveCamera,OrthographicCamera} from './vendor/three.core.min.js';
import {applyCameraZoom,ViewGesture} from './view-controls.js';
test('overview zoom works with IMU rotation and keeps that orientation',()=>{
 const camera=new PerspectiveCamera();camera.position.set(0,100,200);camera.rotation.set(.1,.4,0);
 const orientation=camera.quaternion.clone(),target=new Vector3(0,0,0);
 const s={view:'overview',camera,ortho:new OrthographicCamera(),controls:{target,enabled:false,update(){throw Error('must preserve IMU orientation');}},chaseDistance:40};
 const before=camera.position.length();applyCameraZoom(s,.5);
 assert.ok(Math.abs(camera.position.length()-before*.5)<1e-8);assert.ok(camera.quaternion.equals(orientation));
 for(let i=0;i<30;i++)applyCameraZoom(s,4);assert.equal(Math.round(camera.position.length()),1900);
 for(let i=0;i<30;i++)applyCameraZoom(s,.25);assert.equal(Math.round(camera.position.length()),12);
});
test('map, chase and cockpit zoom stay bounded; invalid input has no effect',()=>{
 const s={camera:new PerspectiveCamera(),ortho:new OrthographicCamera(),controls:{},chaseDistance:40};
 s.view='map';applyCameraZoom(s,.5);assert.equal(s.ortho.zoom,2);
 s.view='cockpit';applyCameraZoom(s,.5);assert.equal(s.camera.zoom,2);
 s.view='chase';assert.equal(applyCameraZoom(s,.5),20);assert.equal(applyCameraZoom(s,4),150);
 assert.equal(applyCameraZoom(s,NaN),40);assert.equal(applyCameraZoom(s,0),40);
});
test('pinch starts on first movement and returns to drag after release',()=>{
 const g=new ViewGesture();g.down(1,0,0);g.down(2,100,0);
 assert.deepEqual(g.move(2,200,0,400,400),{zoom:.5});
 assert.deepEqual(g.move(2,100,0,400,400),{zoom:2});
 g.up(2);assert.deepEqual(g.move(1,20,10,400,400),{dx:.05,dy:.025});
 g.clear();assert.equal(g.move(1,30,10,400,400),null);
});
