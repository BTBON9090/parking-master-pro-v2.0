import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {MobileControls} from '../components/MobileControls';
import {mergeMobileInput,type MobileSnapshot} from '../utils/mobileInput';
import {CarType,type InputState} from '../types';
import {hudStyle,resolveHudLayout} from '../utils/mobileLayout';

const initial:InputState={steeringWheelAngle:0,gear:1,parkingBrake:false,handbrake:false,throttle:0,gasPressed:false,shiftPressed:false,brake:0,lights:false,engineStarted:true};
let live={...initial};let immediateCount=0,moves=0;
const keys={w:false,s:false,shift:false,handbrake:false};
function Harness(){
 const [input,setInput]=useState(initial),[result,setResult]=useState('等待检查');
 const accept=(s:MobileSnapshot,immediate:boolean)=>{live=mergeMobileInput(live,s,keys);if(immediate)immediateCount++;else moves++;setInput(live);};
 const run=()=>{
  try{
   const steer=document.querySelector<HTMLElement>('.mobile-steer-zone')!,brake=document.querySelector<HTMLElement>('.mobile-brake')!;
   const a=steer.getBoundingClientRect(),b=brake.getBoundingClientRect();
   // Synthetic pointers exercise actual React handlers; capture is stubbed
   // because browser security only permits capture for hardware pointers.
   for(const el of [steer,brake])el.setPointerCapture=()=>{};
   const fire=(el:HTMLElement,type:string,id:number,x:number,y:number)=>flushSync(()=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y,buttons:type==='pointerup'||type==='pointercancel'?0:1})));
   fire(steer,'pointerdown',11,a.left+a.width*.7,a.top+a.height*.3);
   fire(brake,'pointerdown',22,b.left+b.width/2,b.top+b.height*.75);
   fire(brake,'pointermove',22,b.left+b.width/2,b.top+b.height*.1);
   fire(steer,'pointermove',11,a.left+a.width*.9,a.top+a.height*.55);
   const combined=live.brake>.5&&live.steeringWheelAngle>1;
   fire(brake,'pointercancel',22,b.left,b.top);const survives=live.brake===0&&live.steeringWheelAngle>1;
   fire(steer,'pointercancel',11,a.left,a.top);const released=live.brake===0;
   setResult(combined&&survives&&released&&moves>=2?'PASS：双指刹车转向、单指取消与另一指保留、最终释放':'FAIL：双指状态异常');
  }catch(e){setResult('FAIL: '+String(e));}
 };
 const r=resolveHudLayout(innerWidth,innerHeight,false);
 return <><div style={{position:'fixed',top:0,left:'35%',zIndex:200,background:'#fff',color:'#000',padding:12}}><button id="run" onClick={run}>执行浏览器触控回归</button><p id="result">{result}</p><p>immediate {immediateCount} · moves {moves}</p></div><MobileControls input={input} update={setInput} onTouchInput={accept} readInput={()=>live} car={CarType.SUV} speedKmh={130} layout={id=>hudStyle(r[id],innerWidth,innerHeight)} disabled={false} settings={()=>{}} camera={()=>{}} map={()=>{}} reset={()=>{}}/></>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
