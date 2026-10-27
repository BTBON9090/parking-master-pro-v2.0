import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const CDN='https://cdn.btbon.cn',COS='https://my-portfolio-1317980685.cos.ap-guangzhou.myqcloud.com';
export function renderDownloadHtml(html,release){
 if(!/^\d+\.\d+\.\d+$/.test(release.version))throw Error('Invalid release version');
 for(const asset of release.assets){
  const u=new URL(asset.url);
  if(u.origin!==COS||u.pathname!==`/parking-master/releases/${release.version}/${asset.name}`||!/^[\w.-]+$/.test(asset.name))throw Error('Invalid asset');
 }
 html=html.replace(/<a\b[^>]*data-(backup-)?platform="([\w-]+)"[^>]*>/g,(tag,backup,platform)=>{
  const asset=release.assets.find(a=>a.platform===platform);if(!asset)throw Error('Missing platform '+platform);
  const u=new URL(asset.url),href=(backup?COS:CDN)+u.pathname;
  return tag.replace(/\s(?:href|aria-disabled|download|referrerpolicy)="[^"]*"/gi,'').replace(/\bdisabled\b/g,'').replace(/>$/,` href="${href}" referrerpolicy="no-referrer">`);
 });
 return html.replace(/(<span[^>]*id="version"[^>]*>)[^<]*(<\/span>)/,`$1v${release.version} · ${release.date}$2`);
}
export function renderDownloadPage(){
 const file='distribution/site/index.html',release=JSON.parse(fs.readFileSync('distribution/site/latest.json','utf8'));
 fs.writeFileSync(file,renderDownloadHtml(fs.readFileSync(file,'utf8'),release));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)renderDownloadPage();
