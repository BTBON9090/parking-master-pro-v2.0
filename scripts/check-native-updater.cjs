const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const tabs=await(await fetch('http://127.0.0.1:9223/json/list')).json();const ws=new WebSocket(tabs[0].webSocketDebuggerUrl),pending=new Map();let sequence=0;await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id&&pending.has(d.id)){const {resolve,reject}=pending.get(d.id);pending.delete(d.id);d.error?reject(d.error):resolve(d.result);}});
const evaluate=async expression=>{const id=++sequence,p=new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));const r=await p;if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const call=(method,data={})=>evaluate(`window.Capacitor.nativePromise('AppUpdate',${JSON.stringify(method)},${JSON.stringify(data)}).then(value=>({ok:true,value}),e=>({ok:false,error:e.message}))`);
const out={environment:'Android API36.1 local emulator; signed temporary test host with WebView inspection enabled only in its unshipped config',checks:[]};
try{
 const status=await call('status');assert(status.ok);out.initial=status.value;
 if(process.env.CAR_UPDATE_APK_MANIFEST){
  const r=JSON.parse(fs.readFileSync(process.env.CAR_UPDATE_APK_MANIFEST,'utf8')),a=r.assets.find(a=>a.platform==='android');
  const d={url:'https://cdn.btbon.cn'+new URL(a.url).pathname,version:r.version,sha256:a.sha256,size:a.size};
  await evaluate(`localStorage.setItem('parking-master-progress-v1',JSON.stringify({schema:1,worldRevision:43,savedAt:Date.now(),car:'SUV',levelId:6,money:4321,camera:'HOOD',pose:{x:850,y:500,rotation:0,elevation:-96},maps:{6:{completedSpots:['garage-1-bay-0-3']}}}));true`);
  const downloaded=await call('download',d);assert(downloaded.ok,JSON.stringify(downloaded));out.downloaded=await call('status');
  out.install=await call('install');assert(out.install.ok,JSON.stringify(out.install));
  out.checks.push('Trusted newer signed APK downloaded, byte count / SHA256 / package / version / signer checks passed; install requested.');
 }else{
  const r=JSON.parse(fs.readFileSync('distribution/site/latest.json','utf8')),a=r.assets.find(a=>a.platform==='android'),d={url:'https://cdn.btbon.cn'+new URL(a.url).pathname,version:r.version,sha256:a.sha256,size:a.size};
  for(const patch of [{url:'http://cdn.btbon.cn/x.apk'},{url:'https://evil.example/app.apk'},{sha256:'bad'},{size:500*1024*1024}]){const v=await call('download',{...d,...patch});assert(!v.ok);if(patch.url)assert(v.error.includes('不受信任'));out.checks.push(v.error);}
  const missing=await call('install');assert(!missing.ok);out.checks.push(missing.error);
  const downloading=call('download',d);await new Promise(r=>setTimeout(r,250));await call('cancel');const cancelled=await downloading;assert(!cancelled.ok);assert(cancelled.error.includes('取消'),JSON.stringify(cancelled));out.checks.push(cancelled.error);
  const final=await call('status');assert(!final.value.ready);assert(!final.value.busy);out.final=final.value;
  // Leave a durable game marker for the later upgrade-retention assertion.
  await evaluate(`localStorage.setItem('parking-master-upgrade-probe','retain-0.28.0');true`);
 }
 out.result='PASS';
}finally{fs.writeFileSync('docs/round43/native-updater'+(process.env.CAR_UPDATE_APK_MANIFEST?'-install':'-guards')+'.json',JSON.stringify(out,null,2));ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
