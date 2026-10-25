(async()=>{
 const status=document.getElementById('status');
 try{
  const response=await fetch('./latest.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error();const release=await response.json();
  if(!/^\d+\.\d+\.\d+$/.test(release.version))throw Error();
  document.getElementById('version').textContent='v'+release.version+' · '+release.date;
  const origin='https://my-portfolio-1317980685.cos.ap-guangzhou.myqcloud.com';
  for(const link of document.querySelectorAll('[data-platform]')){
   const asset=release.assets.find(a=>a.platform===link.dataset.platform);if(!asset)continue;
   const url=new URL(asset.url);if(url.origin!==origin||!url.pathname.startsWith('/parking-master/releases/'))continue;
   link.href=url.href;link.classList.remove('disabled');link.removeAttribute('aria-disabled');link.setAttribute('download',asset.name);link.title=`${Math.round(asset.size/1024/1024)} MB · SHA-256 ${asset.sha256}`;
  }
  status.textContent='安装包与校验值已就绪。'+(release.notes??'');
  document.getElementById('checksums').href=release.githubRelease;
 }catch{document.getElementById('version').textContent='版本信息暂不可用';status.textContent='暂时无法读取下载列表，请稍后刷新，或使用下方 GitHub 备用下载。';}
})();
