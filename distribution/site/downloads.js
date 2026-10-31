(async()=>{
 const status=document.getElementById('status');
 const cdn='https://cdn.btbon.cn',cos='https://my-portfolio-1317980685.cos.ap-guangzhou.myqcloud.com';
 async function read(url){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;let timer;
  try{return await Promise.race([
   fetch(url,{cache:'no-store',referrerPolicy:'no-referrer',signal:controller?controller.signal:undefined}).then(r=>{if(!r.ok)throw Error();return r.json();}),
   new Promise((_,reject)=>{timer=setTimeout(()=>{if(controller)controller.abort();reject(Error('timeout'));},5000);}),
  ]);}finally{clearTimeout(timer);}
 }
 try{
  let release;
  for(const source of [cdn+'/parking-master/latest.json','./latest.json']){
   try{const r=await read(source);if(!/^\d+\.\d+\.\d+$/.test(r.version)||!Array.isArray(r.assets))throw Error();release=r;break;}catch{}
  }
  if(!release)throw Error();
  document.getElementById('version').textContent='v'+release.version+' · '+release.date;
  for(const link of document.querySelectorAll('[data-platform], [data-backup-platform]')){
   const backup=link.dataset.backupPlatform,asset=release.assets.find(a=>a.platform===(backup||link.dataset.platform));if(!asset)continue;
   const url=new URL(asset.url);if(![cos,cdn].includes(url.origin)||url.pathname!==`/parking-master/releases/${release.version}/${asset.name}`||!/^[\w.-]+$/.test(asset.name))continue;
   link.href=backup?`https://github.com/BTBON9090/parking-master-pro-v2.0/releases/download/v${release.version}/${asset.name}`:cdn+url.pathname;link.classList.remove('disabled');link.removeAttribute('aria-disabled');link.removeAttribute('download');link.setAttribute('referrerpolicy','no-referrer');link.title=`${Math.round(asset.size/1024/1024)} MB · SHA-256 ${asset.sha256}`;
  }
  status.textContent='Mac、Windows 和 Android 提供安装包；iPhone / iPad 暂无可安装版本，iOS ZIP 仅供开发者使用。'+(release.notes||'');
  document.getElementById('checksums').href='https://github.com/BTBON9090/parking-master-pro-v2.0/releases/tag/v'+release.version;
 }catch{status.textContent='在线版本检查暂不可用。Mac、Windows 和 Android 可使用下方安装包；iOS ZIP 是开发工程，不能直接安装。';}
})();
