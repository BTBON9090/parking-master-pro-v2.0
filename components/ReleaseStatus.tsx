import React,{useState} from 'react';
import {APP_VERSION,RELEASE_PAGE,fetchLatestRelease,isNewerVersion} from '../utils/releases';
export function ReleaseStatus(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[url,setUrl]=useState('');
 const check=async()=>{setBusy(true);setUrl('');try{const r=await fetchLatestRelease();const newer=isNewerVersion(r.version,APP_VERSION);setMessage(newer?`发现新版本 ${r.version}，下载后安装即可更新。`:`当前已是最新版本 ${APP_VERSION}`);if(newer)setUrl(RELEASE_PAGE);}catch{setMessage('暂时无法检查更新，请稍后重试，或查看下载页面。');}finally{setBusy(false);}};
 return <section><h3>版本与更新</h3><p>停车大师 Pro <strong>{APP_VERSION}</strong></p><div className="release-actions"><button className="settings-primary" disabled={busy} onClick={check}>{busy?'正在检查…':'检查新版本'}</button><a href={url||RELEASE_PAGE} target="_blank" rel="noreferrer">下载与更新说明 ↗</a></div><p role="status">{message}</p><p className="settings-note">更新安装包保留本机设置。iPhone 安装版尚未发布，本轮提供 iOS 工程。</p></section>;
}
