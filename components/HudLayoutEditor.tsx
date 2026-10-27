import React,{useRef,useState} from 'react';
import {HUD_NAMES,HudId,HudLayout,HudRect,clampRect,hudStyle} from '../utils/mobileLayout';
export function HudLayoutEditor(p:{rects:Record<HudId,HudRect>;width:number;height:number;change:(v:HudLayout)=>void;save:()=>void;cancel:()=>void;reset:()=>void}){
 const [selected,setSelected]=useState<HudId>('steer');
 const drag=useRef<{id:HudId;pointer:number;x:number;y:number;rect:HudRect}|null>(null);
 const update=(id:HudId,rect:HudRect)=>p.change({[id]:clampRect(rect)});
 return <div className="hud-editor" role="dialog" aria-modal="true" aria-label="编辑操控布局" data-ui-control>
  {(Object.keys(HUD_NAMES) as HudId[]).map(id=><button key={id} className="hud-edit-box hud-positioned" style={hudStyle(p.rects[id],p.width,p.height)} aria-label={'移动'+HUD_NAMES[id]} aria-pressed={selected===id}
    onPointerDown={e=>{e.preventDefault();setSelected(id);e.currentTarget.setPointerCapture(e.pointerId);drag.current={id,pointer:e.pointerId,x:e.clientX,y:e.clientY,rect:p.rects[id]};}}
    onPointerMove={e=>{const d=drag.current;if(d?.pointer===e.pointerId)update(d.id,{...d.rect,x:d.rect.x+(e.clientX-d.x)/p.width,y:d.rect.y+(e.clientY-d.y)/p.height});}}
    onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}
    onKeyDown={e=>{if(e.key.startsWith('Arrow')){e.preventDefault();const r=p.rects[id];update(id,{...r,x:r.x+(e.key==='ArrowRight'?.01:e.key==='ArrowLeft'?-.01:0),y:r.y+(e.key==='ArrowDown'?.01:e.key==='ArrowUp'?-.01:0)});}}}>
    <span>{HUD_NAMES[id]}</span></button>)}
  <section className="hud-editor-panel"><strong>调整布局 · {HUD_NAMES[selected]}</strong><small>拖动控件；分别调整宽度和高度。设置会保存在此设备。</small>
   {(['width','height'] as const).map(key=><label key={key}>{key==='width'?'宽度':'高度'}<input aria-label={'控件'+(key==='width'?'宽度':'高度')} type="range" min={key==='width'?.035:.04} max={.8} step={.005} value={p.rects[selected][key]} onChange={e=>update(selected,{...p.rects[selected],[key]:+e.target.value})}/><output>{Math.round(p.rects[selected][key]*(key==='width'?p.width:p.height))} px</output></label>)}
   <div><button onClick={p.reset}>恢复默认</button><button onClick={p.cancel}>取消</button><button className="primary" onClick={p.save}>保存布局</button></div>
  </section>
 </div>;
}
