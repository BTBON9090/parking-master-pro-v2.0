import React,{useEffect,useRef,useState} from 'react';
import {APP_VERSION} from '../utils/releases';
export const RELEASE_SEEN_KEY='parking-master-release-seen';
const changes=[
 ['跨地图继续驾驶','传送门提前准备下一张地图，保留车速与挡位；修复青岚山入口遮挡和地库螺旋掉层，新增窄螺旋车道。'],
 ['看清夜路与下一个弯','加强近远光及隧道受光，补充连续转弯箭头、高速虚线、加减速段与出口预告；扩大驾驶座视点调节。'],
 ['声音与抓地反馈','新增真实通用车辆录音分层、车内外混音和双声道；冰面驱动轮会空转，跑车增加随速度变化的下压力。'],
 ['两辆新座驾','加入东风风格大三轮和16轮运输起竖车；支持停稳起竖、地图选点、5秒倒数与飞行落点镜头演出。'],
 ['界面让出驾驶视野','提示集中在左镜下方，可折叠和滚动；右镜下方为车头朝上的1公里路线图，仪表贴底。暂停菜单支持继续、换车保留进程与重新开始，加载时展示操作说明图。'],
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
