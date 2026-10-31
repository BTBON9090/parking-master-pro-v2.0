import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
export function HintSlot({children}:{children:React.ReactNode}){
 const [node,setNode]=useState<HTMLElement|null>(null);
 useEffect(()=>{setNode(document.getElementById('driving-hint-content'));},[]);
 return node?createPortal(children,node):null;
}
export function DrivingHints(){
 const root=useRef<HTMLElement>(null);const [closed,setClosed]=useState(false);
 useEffect(()=>{const place=()=>{const mirrors=[...document.querySelectorAll<HTMLElement>('.side-mirror-frame')].map(n=>n.getBoundingClientRect()).sort((a,b)=>a.left-b.left),r=mirrors[0];if(!root.current)return;const tall=!!r&&r.height>r.width*1.2,bar=document.querySelector<HTMLElement>('.mobile-topbar')?.getBoundingClientRect();root.current.style.left=(r?(tall?r.right+5:r.left):12)+'px';root.current.style.top=(r?(tall?Math.max(r.top,(bar?.bottom??r.top)+3):r.bottom+3):100)+'px';root.current.style.width=Math.min(window.innerWidth*.31,Math.max(210,(r?.width??180)+70))+'px';const content=root.current.querySelector<HTMLElement>('#driving-hint-content'),steer=document.querySelector<HTMLElement>('.mobile-steer-zone')?.getBoundingClientRect();if(content){const top=root.current.getBoundingClientRect().top,header=root.current.querySelector('button')?.getBoundingClientRect().height??20;content.style.maxHeight=steer?Math.max(0,steer.top-top-header-8)+'px':'';}};place();const t=setInterval(place,300);return()=>clearInterval(t);},[]);
 return <aside ref={root} className="driving-hints" data-ui-control><button aria-expanded={!closed} onClick={()=>setClosed(v=>!v)}>行车提示 <span>{closed?'展开 ＋':'收起 −'}</span></button><div id="driving-hint-content" hidden={closed}/></aside>;
}
