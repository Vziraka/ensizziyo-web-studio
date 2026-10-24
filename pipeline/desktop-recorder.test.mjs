import test from 'node:test';import assert from 'node:assert/strict';import {createDesktopRecorder} from './lifecycle-ui/call-audio.js';
test('desktop recording starts only audio, stops tracks, retains playback bytes and enforces a bounded duration',async()=>{
 let time=Date.parse('2026-10-24T05:00:00Z'),tick,tracksStopped=0,instance,timerCleared=false;
 const stream={getTracks:()=>[{stop:()=>tracksStopped++}]};
 class Recorder{static isTypeSupported(value){return value.startsWith('audio/webm');}constructor(source,options){assert.equal(source,stream);assert.equal(options.audioBitsPerSecond,24000);this.mimeType=options.mimeType;instance=this;}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,...Array(20).fill(0)])])});this.onstop();}}
 const capture=createDesktopRecorder({getUserMedia:async constraints=>{assert.deepEqual(constraints,{audio:true,video:false});return stream;},Recorder,now:()=>new Date(time),timer:fn=>{tick=fn;return 1;},clearTimer:()=>{timerCleared=true;}});
 await capture.start();assert.equal(capture.state.status,'Recording');time+=20*60_000;tick();assert.equal(capture.state.status,'Recorded');assert.equal(capture.state.limitReached,true);assert.equal(instance.state,'inactive');assert.equal(tracksStopped,1);assert.equal(timerCleared,true);assert.equal(capture.state.blob.size,24);assert.equal(capture.state.ended_at,'2026-10-24T05:20:00.000Z');
});
test('microphone denial is visible and recorder-start failures release the microphone',async()=>{
 const denied=createDesktopRecorder({getUserMedia:async()=>{throw Object.assign(Error('Denied'),{name:'NotAllowedError'});},Recorder:class{}});await denied.start();assert.equal(denied.state.status,'Error');assert.match(denied.state.error,/permission was denied/);
 let stopped=0;const broken=createDesktopRecorder({getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]}),Recorder:class{static isTypeSupported(){return true;}constructor(){throw Error('Unavailable');}}});await broken.start();assert.equal(broken.state.status,'Error');assert.equal(stopped,1);
});
