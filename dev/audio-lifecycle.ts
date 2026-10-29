import {AudioPlaybackGate} from '../utils/audioPlaybackGate';
let ctx:AudioContext|null=null,gate:AudioPlaybackGate|null=null;
const history:string[]=[];
const report=(event:string)=>{history.push(event+': '+(ctx?.state??'none'));document.querySelector('output')!.textContent=history.slice(-15).join('\n');};
document.querySelector('#start')!.addEventListener('click',()=>{
 if(ctx)return;
 ctx=new AudioContext();gate=new AudioPlaybackGate(ctx);ctx.addEventListener('statechange',()=>report('statechange'));
 gate.setActive(true,true);report('start');
});
document.querySelector('#pause')!.addEventListener('click',()=>{gate?.setActive(false);report('pause');});
document.querySelector('#resume')!.addEventListener('click',()=>{gate?.setActive(true,true);report('resume');});
document.querySelector('#dispose')!.addEventListener('click',()=>{gate?.dispose();void ctx?.close().then(()=>report('close'));});
window.addEventListener('pagehide',()=>{gate?.dispose();void ctx?.close();});

document.querySelector('#direct')!.addEventListener('click',()=>{report('direct request');void ctx?.resume().then(()=>report('direct resolved'),()=>report('direct rejected'));});
