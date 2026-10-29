import React,{useEffect,useRef,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {AppLauncher} from '@capacitor/app-launcher';
import {APP_VERSION,RELEASE_PAGE,fetchLatestRelease,isNewerVersion,type ReleaseInfo} from '../utils/releases';
import {AppUpdate,canInstallInApp,installableRelease,type UpdateProgress} from '../utils/appUpdate';
export function ReleaseStatus(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[release,setRelease]=useState<ReleaseInfo|null>(null);
 const [downloading,setDownloading]=useState(false),[progress,setProgress]=useState<UpdateProgress|null>(null),[ready,setReady]=useState('');
 const live=useRef(true),native=canInstallInApp();
 useEffect(()=>{
  live.current=true;if(!native)return()=>{live.current=false;};
  const refresh=()=>AppUpdate.status().then(s=>{if(live.current){setReady(s.ready?s.version:'');setDownloading(s.busy);}}).catch(()=>{});
  refresh();const listener=AppUpdate.addListener('progress',p=>{if(live.current){setProgress(p);if(p.stage==='ready'){setDownloading(false);refresh();}}});
  window.addEventListener('focus',refresh);
  return()=>{live.current=false;listener.then(h=>h.remove());window.removeEventListener('focus',refresh);};
 },[native]);
 const check=async()=>{
  setBusy(true);setRelease(null);
  try{const r=await fetchLatestRelease();if(!live.current)return;setRelease(r);
   setMessage(isNewerVersion(r.version,APP_VERSION)?`发现新版本 ${r.version}。${native&&installableRelease(r)?'可在应用内下载并覆盖安装，保留进度。':'请从下载页面获取安装包。'}`:`当前已是最新版本 ${APP_VERSION}。`);
  }catch{if(live.current)setMessage('更新源暂时无法连接。可以稍后重试，或打开下载页面。');}
  finally{if(live.current)setBusy(false);}
 };
 const download=async()=>{
  if(!release||!installableRelease(release))return;
  setDownloading(true);setReady('');setProgress(null);setMessage('正在下载，完成后会校验安装包。');
  try{await AppUpdate.download({url:release.androidUrl!,version:release.version,sha256:release.androidSha256!,size:release.androidSize!});
   if(live.current){setReady(release.version);setMessage('下载与校验完成。点击安装，由系统确认覆盖安装。');}
  }catch(e){if(live.current)setMessage(e instanceof Error?e.message:'下载失败，请重试。');}
  finally{if(live.current)setDownloading(false);}
 };
 const install=async()=>{
  window.dispatchEvent(new Event('save-progress'));setBusy(true);
  try{const r=await AppUpdate.install();if(live.current)setMessage(r.permissionRequired?'请允许此应用安装更新，然后返回并点击“安装已下载版本”。':'已打开系统安装界面。确认覆盖安装即可保留进度，取消后也可再次安装。');}
  catch(e){if(live.current){setMessage(e instanceof Error?e.message:'无法安装，请重试。');const s=await AppUpdate.status();setReady(s.ready?s.version:'');}}
  finally{if(live.current)setBusy(false);}
 };
 const external=(url:string)=>async(e:React.MouseEvent<HTMLAnchorElement>)=>{
  if(!Capacitor.isNativePlatform())return;e.preventDefault();
  try{const r=await AppLauncher.openUrl({url});if(!r.completed)throw Error('No browser');setMessage('已打开系统浏览器。下载后覆盖安装即可保留进度。');}
  catch{setMessage('无法打开系统浏览器。请在浏览器访问 btbon.cn/parking-master。');}
 };
 const update=release&&isNewerVersion(release.version,APP_VERSION),android=Capacitor.getPlatform()==='android';
 const downloadUrl=android&&release?.androidUrl?release.androidUrl:RELEASE_PAGE;
 return <section><h3>版本与更新</h3><p>老司机是怎样炼成的 <strong>{APP_VERSION}</strong></p>
  <div className="release-actions">
   <button onClick={()=>window.dispatchEvent(new Event('show-release-notes'))}>查看本次更新变化</button>
   <button className="settings-primary" disabled={busy||downloading} onClick={check}>{busy?'正在处理…':'检查新版本'}</button>
   {update&&(!ready||ready!==release.version)&&(native&&installableRelease(release)?<button className="settings-primary" disabled={busy||downloading} onClick={download}>下载更新 · {release.version}</button>:<a className="settings-primary" href={downloadUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={external(downloadUrl)}>下载新版本 · {release.version}</a>)}
   {native&&ready&&<button className="settings-primary" disabled={busy||downloading} onClick={install}>安装已下载版本 · {ready}</button>}
   {downloading&&<button onClick={()=>AppUpdate.cancel().then(()=>{setMessage('正在取消下载…');}).catch(()=>setMessage('取消失败，请稍后重试。'))}>取消下载</button>}
   <a href={RELEASE_PAGE} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={external(RELEASE_PAGE)}>下载页面 ↗</a>
  </div>
  {downloading&&<label className="update-progress">{progress?.stage==='verify'?'正在校验安装包':`下载中 ${progress?Math.floor(progress.received/Math.max(1,progress.total)*100):0}%`}<progress max={progress?.total??1} value={progress?.received??0}/></label>}
  <p role="status" aria-live="polite">{message}</p>
  {release?.notes&&update&&<details><summary>新版本变化</summary><pre className="release-remote-notes">{release.notes}</pre></details>}
  <p className="settings-note">Android 安装更新需要系统确认；首次可能需要允许此应用安装更新。覆盖安装保留此设备的设置和进度，请勿先卸载。iPhone 当前提供 iOS 工程。</p>
 </section>;
}
