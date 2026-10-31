import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
export function HintSlot({children}:{children:React.ReactNode}){
 const [node,setNode]=useState<HTMLElement|null>(null);
 useEffect(()=>{setNode(document.getElementById('driving-hint-content'));},[]);
 return node?createPortal(children,node):null;
}
export function DrivingHints(){
 const root=useRef<HTMLElement>(null);const [closed,setClosed]=useState(false);
 useEffect(()=>{const place=()=>{const mirror=document.querySelector<HTMLElement>('.side-mirror-frame');const r=mirror?.getBoundingClientRect();if(!root.current)return;root.current.style.left=(r?.left??12)+'px';root.current.style.top=(r?r.bottom+3:100)+'px';root.current.style.width=Math.min(window.innerWidth*.31,Math.max(210,(r?.width??180)+70))+'px';};place();const t=setInterval(place,300);return()=>clearInterval(t);},[]);
 return <aside ref={root} className="driving-hints" data-ui-control><button aria-expanded={!closed} onClick={()=>setClosed(v=>!v)}>行车提示 <span>{closed?'展开 ＋':'收起 −'}</span></button><div id="driving-hint-content" hidden={closed}/></aside>;
}
