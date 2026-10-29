import React,{useEffect,useRef,useState} from 'react';
import {APP_VERSION} from '../utils/releases';
export const RELEASE_SEEN_KEY='parking-master-release-seen';
const changes=[
 ['山路、地库和高速连起来了','城东通道自动前往地库或高速；地库南端新增 B1—B3 螺旋坡道，云顶加入升降机与山腹涵洞。'],
 ['驾驶进度会留下来','自动保存车辆、地图、位置、奖励与训练成绩；主菜单可继续上次驾驶，驾驶设置也可手动保存。'],
 ['落指更稳，转向更细','手指落下时锚定当前方向，随后相对移动；刻度仍然随速度自适应。'],
 ['设置和更新更容易找到','首页右上角也可打开设置；Android 可在应用内下载更新并交给系统安装。'],
 ['考试说明跟着位置走','可以自行选择考点顺序。说明上移，试验场隐藏中间后视镜，保留两侧后视镜。'],
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
  <header><span>版本 {APP_VERSION}</span><h2 id="release-notes-title">这次更新了什么</h2><p>关闭后，可在「设置 → 关于我的介绍」再次查看。</p></header>
  <ol>{changes.map(([title,detail])=><li key={title}><strong>{title}</strong><p>{detail}</p></li>)}</ol>
  <footer><small>进度保存在此设备；覆盖安装可保留，卸载或清除应用数据会删除。</small><button className="settings-primary" onClick={close}>知道了，继续</button></footer>
 </div></div>;
}
