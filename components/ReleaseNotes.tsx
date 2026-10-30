import React,{useEffect,useRef,useState} from 'react';
import {APP_VERSION} from '../utils/releases';
export const RELEASE_SEEN_KEY='parking-master-release-seen';
const changes=[
 ['山路分块渲染','青岚山道路、路肩和标线分区渲染，减少远处路面在主画面和后视镜中的重复绘制。首次加载仍需要构建地图，实际表现取决于设备。'],
 ['山顶与隧道出口','调整山顶最后一段缓坡，将地下隧道出口改接城市北侧道路，并清理路缘和树木。'],
 ['运输起竖车动作修复','修复发射筒和支撑腿与活动轴分离的问题，新增外部观察镜头、音效、飞行环视及风格化蘑菇云；加宽轮胎并增加侧面储箱。'],
 ['驾校与城市','调整驾校 S 弯和标牌位置，改善树木避让；城市两条主街增加平缓起伏。'],
];
export function ReleaseNotes(){
 const [open,setOpen]=useState(()=>{try{return localStorage.getItem(RELEASE_SEEN_KEY)!==APP_VERSION;}catch{return true;}});
 const root=useRef<HTMLDivElement>(null);
 const close=()=>{try{localStorage.setItem(RELEASE_SEEN_KEY,APP_VERSION);}catch{}setOpen(false);};
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('show-release-notes',show);window.addEventListener('close-release-notes',close);return()=>{window.removeEventListener('show-release-notes',show);window.removeEventListener('close-release-notes',close);};},[]);
 useEffect(()=>{
  if(!open)return;document.body.dataset.releaseNotes='open';const previous=document.activeElement as HTMLElement|null;root.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
   if(e.key==='Tab'){e.preventDefault();root.current?.querySelector<HTMLButtonElement>('button')?.focus();}};
  window.addEventListener('keydown',key,true);
  return()=>{delete document.body.dataset.releaseNotes;window.removeEventListener('keydown',key,true);previous?.focus();};
 },[open]);
 if(!open)return null;
 return <div className="release-notes-backdrop" data-ui-control onPointerDown={e=>e.stopPropagation()}><div className="release-notes" ref={root} role="dialog" aria-modal="true" aria-labelledby="release-notes-title">
  <header><span>版本 {APP_VERSION}</span><h2 id="release-notes-title">这次更新了什么</h2><p>关闭后，可在「暂停 → 关于我的介绍」再次查看。</p></header>
  <ol>{changes.map(([title,detail])=><li key={title}><strong>{title}</strong><p>{detail}</p></li>)}</ol>
  <footer><small>进度保存在此设备；覆盖安装可保留，卸载或清除应用数据会删除。</small><button className="settings-primary" onClick={close}>知道了，继续</button></footer>
 </div></div>;
}
