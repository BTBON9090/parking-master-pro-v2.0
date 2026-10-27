import React,{useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {AppLauncher} from '@capacitor/app-launcher';
import {APP_VERSION,RELEASE_PAGE,fetchLatestRelease,isNewerVersion,type ReleaseInfo} from '../utils/releases';
export function ReleaseStatus(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[release,setRelease]=useState<ReleaseInfo|null>(null);
 const check=async()=>{
  setBusy(true);setRelease(null);
  try{
   const r=await fetchLatestRelease();setRelease(r);
   setMessage(isNewerVersion(r.version,APP_VERSION)?`发现新版本 ${r.version}。点击下载安装包，再打开下载完成的文件覆盖安装。`:`当前已是最新版本 ${APP_VERSION}。`);
  }catch{setMessage('更新源暂时无法连接。仍可打开下载页面，使用页面上的直接下载或备用下载。');}
  finally{setBusy(false);}
 };
 const external=(url:string)=>async(e:React.MouseEvent<HTMLAnchorElement>)=>{
  if(!Capacitor.isNativePlatform())return;
  e.preventDefault();
  try{
   const r=await AppLauncher.openUrl({url});
   if(!r.completed)throw Error('No browser');
   setMessage('已交给系统浏览器打开。下载完成后打开安装包覆盖安装，保留现有应用和设置。');
  }catch{setMessage('无法打开系统浏览器。请手动在浏览器访问 btbon.cn/parking-master，下载安装包。');}
 };
 const update=release&&isNewerVersion(release.version,APP_VERSION);
 const android=Capacitor.getPlatform()==='android';
 const downloadUrl=android&&release?.androidUrl?release.androidUrl:RELEASE_PAGE;
 return <section><h3>版本与更新</h3><p>停车大师 Pro <strong>{APP_VERSION}</strong></p>
  <div className="release-actions">
   <button className="settings-primary" disabled={busy} onClick={check}>{busy?'正在检查…':'检查新版本'}</button>
   {update&&<a className="settings-primary" href={downloadUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={external(downloadUrl)}>{android?'下载 Android 更新':'下载新版本'} · {release.version}</a>}
   <a href={RELEASE_PAGE} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={external(RELEASE_PAGE)}>下载与更新说明 ↗</a>
  </div><p role="status">{message}</p>
  <p className="settings-note">检查更新不会自动安装。Android 请在系统浏览器下载 APK，完成后覆盖安装，不要先卸载。iPhone 安装版尚未发布，当前提供 iOS 工程。</p>
 </section>;
}
