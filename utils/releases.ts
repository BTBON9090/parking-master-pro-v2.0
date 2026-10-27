import {Capacitor,CapacitorHttp} from '@capacitor/core';
export const APP_VERSION='0.22.4';
export const RELEASE_PAGE='https://btbon.cn/parking-master/index.html#download';
export const DOWNLOAD_ORIGIN='https://cdn.btbon.cn';
export const COS_ORIGIN='https://my-portfolio-1317980685.cos.ap-guangzhou.myqcloud.com';
export const GITHUB_LATEST='https://api.github.com/repos/BTBON9090/parking-master-pro-v2.0/releases/latest';
export const RELEASE_SOURCES=[DOWNLOAD_ORIGIN+'/parking-master/latest.json',COS_ORIGIN+'/parking-master/latest.json',GITHUB_LATEST];
export interface ReleaseInfo {version:string;androidUrl?:string}
export function isNewerVersion(next:string,current:string){
 const parse=(s:string)=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(s)?.slice(1).map(Number);
 const a=parse(next),b=parse(current);if(!a||!b)return false;
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
export function parseRelease(data:unknown):ReleaseInfo {
 if(!data||typeof data!=='object')throw Error('Invalid release');
 const d=data as Record<string,unknown>,raw=d.version??d.tag_name;
 if(typeof raw!=='string'||!/^v?\d+\.\d+\.\d+$/.test(raw))throw Error('Invalid version');
 const version=raw.replace(/^v/,''),name=`Parking-Master-Pro-${version}-android.apk`;
 const asset=Array.isArray(d.assets)?d.assets.find(a=>a&&a.name===name):undefined;
 let androidUrl:string|undefined;
 if(asset){
  const address=typeof d.tag_name==='string'?asset.browser_download_url:asset.url;
  try {
   const u=new URL(address),expected=`/parking-master/releases/${version}/${name}`;
   if(u.username||u.password)throw Error('Invalid asset URL');
   if([COS_ORIGIN,DOWNLOAD_ORIGIN].includes(u.origin)&&u.pathname===expected&&!u.search&&!u.hash)
    androidUrl=DOWNLOAD_ORIGIN+expected;
   else if(u.origin==='https://github.com'&&u.pathname===`/BTBON9090/parking-master-pro-v2.0/releases/download/v${version}/${name}`&&!u.search&&!u.hash)
    androidUrl=u.href;
  }catch{}
 }
 return {version,androidUrl};
}
// Older Android WebViews may lack AbortSignal.timeout. Bound the entire
// request, including body parsing, and keep native HTTP out of WebView CORS.
export async function fetchReleaseJson(url:string,timeoutMs=5000):Promise<unknown>{
 const controller=typeof AbortController!=='undefined'?new AbortController():undefined;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  return await Promise.race([
   (async()=>{
    if(Capacitor.isNativePlatform()){
     const r=await CapacitorHttp.get({url,responseType:'json',connectTimeout:timeoutMs,readTimeout:timeoutMs,headers:{'Cache-Control':'no-cache'}});
     if(r.status<200||r.status>=300)throw Error('Release HTTP '+r.status);
     return typeof r.data==='string'?JSON.parse(r.data):r.data;
    }
    const r=await fetch(url,{signal:controller?.signal,cache:'no-store',referrerPolicy:'no-referrer'});
    if(!r.ok)throw Error('Release HTTP '+r.status);return r.json();
   })(),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('Release request timed out'));},timeoutMs);}),
  ]);
 }finally{if(timer)clearTimeout(timer);}
}
export async function fetchLatestRelease(readJson:(url:string)=>Promise<unknown>=fetchReleaseJson):Promise<ReleaseInfo>{
 for(const source of RELEASE_SOURCES){try{return parseRelease(await readJson(source));}catch{}}
 throw Error('All release sources unavailable');
}
