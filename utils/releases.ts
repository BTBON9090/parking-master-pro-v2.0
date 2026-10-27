export const APP_VERSION='0.22.3';
export const RELEASE_PAGE='https://cdn.btbon.cn/parking-master/index.html';
export const GITHUB_LATEST='https://api.github.com/repos/BTBON9090/parking-master-pro-v2.0/releases/latest';
export function isNewerVersion(next:string,current:string){
 const parse=(s:string)=>/^v?(\d+)\.(\d+)\.(\d+)$/.exec(s)?.slice(1).map(Number);
 const a=parse(next),b=parse(current);if(!a||!b)return false;
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
export async function fetchLatestRelease(){
 const response=await fetch(GITHUB_LATEST,{signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!response.ok)throw new Error('Release unavailable');const data=await response.json();
 if(!/^v?\d+\.\d+\.\d+$/.test(data.tag_name))throw new Error('Invalid release');return {version:data.tag_name.replace(/^v/,'')};
}
