import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {COS_ORIGIN,DOWNLOAD_ORIGIN,RELEASE_SOURCES,fetchLatestRelease,fetchReleaseJson,parseRelease,isNewerVersion} from '../utils/releases';
import {renderDownloadHtml} from '../scripts/render-download-links.mjs';

const name='Parking-Master-Pro-0.22.4-android.apk';
const path=`/parking-master/releases/0.22.4/${name}`;
const manifest={version:'0.22.4',assets:[{name,url:COS_ORIGIN+path}]};
assert.equal(parseRelease(manifest).androidUrl,DOWNLOAD_ORIGIN+path);
assert(isNewerVersion('0.22.4','0.22.3'));
assert(!isNewerVersion('0.22.3','0.22.4'));
for(const url of ['javascript:alert(1)','https://evil.example'+path,COS_ORIGIN+path+'?redirect=x',COS_ORIGIN+'/wrong.apk','https://user:password@github.com/BTBON9090/parking-master-pro-v2.0/releases/download/v0.22.4/'+name]){
 assert.equal(parseRelease({version:'0.22.4',assets:[{name,url}]}).androidUrl,undefined);
}
for(const failCount of [0,1,2]){
 const calls:string[]=[];
 const r=await fetchLatestRelease(async url=>{
  calls.push(url);if(calls.length<=failCount)throw Error('offline');
  return calls.length===3?{tag_name:'v0.22.4',assets:[{name,url:'https://api.github.com/assets/123',browser_download_url:'https://github.com/BTBON9090/parking-master-pro-v2.0/releases/download/v0.22.4/'+name}]}:manifest;
 });
 assert.equal(r.version,'0.22.4');assert(r.androidUrl?.endsWith(name));
 assert.deepEqual(calls,RELEASE_SOURCES.slice(0,failCount+1));
}
await assert.rejects(()=>fetchLatestRelease(async()=>({version:'invalid'})));
await assert.rejects(()=>fetchLatestRelease(async()=>{throw Error('offline');}));

const originalFetch=globalThis.fetch;
try{
 // No dependency on AbortSignal.timeout, including body parsing stalls.
 globalThis.fetch=async()=>new Response(JSON.stringify(manifest));
 assert.deepEqual(await fetchReleaseJson('https://test.invalid'),manifest);
 globalThis.fetch=async()=>new Response(null,{status:403});
 await assert.rejects(()=>fetchReleaseJson('https://test.invalid'),/403/);
 globalThis.fetch=async()=>new Response(new ReadableStream({start(){}}));
 await assert.rejects(()=>fetchReleaseJson('https://test.invalid',15),/timed out/);
 globalThis.fetch=(()=>new Promise(()=>{})) as typeof fetch;
 await assert.rejects(()=>fetchReleaseJson('https://test.invalid',15),/timed out/);
}finally{globalThis.fetch=originalFetch;}

const html=fs.readFileSync('distribution/site/index.html','utf8');
const release=JSON.parse(fs.readFileSync('distribution/site/latest.json','utf8'));
const rendered=renderDownloadHtml(html,release);
assert.equal(renderDownloadHtml(rendered,release),rendered,'release assembly is idempotent');
const tags=rendered.match(/<a\b[^>]*data-(?:backup-)?platform="[^"]+"[^>]*>/g)!;
assert.equal(tags.length,6);
for(const tag of tags){
 assert(tag.includes('href="https://'));assert(tag.includes('referrerpolicy="no-referrer"'));
 assert(!tag.includes('aria-disabled'));assert(!/class="[^"]*\bdisabled\b/.test(tag));
 assert(tag.includes(tag.includes('data-backup-platform')?COS_ORIGIN:DOWNLOAD_ORIGIN));
}

// Run the real website script without AbortController or AbortSignal, as an
// older WebView would. Network failure must not erase static download links.
const js=fs.readFileSync('distribution/site/downloads.js','utf8');
for(const online of [false,true]){
 const status={textContent:''},version={textContent:''},checksums={href:''};
 const links=release.assets.map((a:any)=>({dataset:{platform:a.platform},href:DOWNLOAD_ORIGIN+new URL(a.url).pathname,classList:{remove(){}},removeAttribute(){},setAttribute(){}}));
 const before=links.map((l:any)=>l.href);
 await vm.runInNewContext(js,{URL,Promise,setTimeout,clearTimeout,fetch:async()=>{if(!online)throw Error('offline');return {ok:true,json:async()=>release};},document:{getElementById:(id:string)=>({status,version,checksums}[id]),querySelectorAll:()=>links}});
 assert.deepEqual(links.map((l:any)=>l.href),before);
 assert(status.textContent.includes(online?'可直接下载':'仍可直接下载'));
}
console.log('Release PASS: native-source fallback, bounded requests, trusted APK URLs, static downloads and older-WebView website fallback.');
