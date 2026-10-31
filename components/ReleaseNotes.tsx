import React,{useEffect,useRef,useState} from 'react';
import {APP_VERSION} from '../utils/releases';
export const RELEASE_SEEN_KEY='parking-master-release-seen';
const changes=[
 ['高速车流','修复护栏导致车辆停驶；调整主线车道目标速度和变道判断。'],
 ['驾驶流畅度','减少隐藏画面的重复渲染，优化触屏自动画质下的后视镜与阴影。'],
 ['驾驶声音','转向灯增加提示音；发射和爆炸演出使用实录剪辑。'],
 ['地图选点','在全局俯瞰地图缩放、选择并确认发射目标。'],
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
