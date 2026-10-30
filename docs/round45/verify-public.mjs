import fs from 'node:fs';
import crypto from 'node:crypto';
const local=JSON.parse(fs.readFileSync('distribution/site/latest.json','utf8'));
if(local.version!=='0.29.1')throw Error('Wrong release manifest');
const report={version:local.version,checks:[],assets:[]};
for(const origin of ['https://cdn.btbon.cn','https://my-portfolio-1317980685.cos.ap-guangzhou.myqcloud.com']){
 const r=await fetch(origin+'/parking-master/latest.json',{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Manifest '+r.status);
 const d=await r.json();if(JSON.stringify(d)!==JSON.stringify(local))throw Error('Public manifest mismatch');report.checks.push(origin+' manifest exact');
}
for(const file of ['index.html','features.html','development-review.html']){
 const r=await fetch('https://cdn.btbon.cn/parking-master/'+file,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok||await r.text()!==fs.readFileSync('distribution/site/'+file,'utf8'))throw Error('Page mismatch '+file);report.checks.push(file+' exact');
}
for(const asset of local.assets){
 const url='https://cdn.btbon.cn'+new URL(asset.url).pathname;
 const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(30000)});if(!r.ok||Number(r.headers.get('content-length'))!==asset.size||r.headers.get('x-cos-meta-sha256')!==asset.sha256)throw Error('Asset mismatch '+asset.name);
 report.assets.push({name:asset.name,size:asset.size,sha256:asset.sha256,status:r.status});
 if(asset.platform==='android'){
  const d=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!d.ok)throw Error('APK download failed');const hash=crypto.createHash('sha256');let n=0;for await(const chunk of d.body){hash.update(chunk);n+=chunk.length;}
  if(n!==asset.size||hash.digest('hex')!==asset.sha256)throw Error('Downloaded APK mismatch');report.checks.push('Full public CDN Android APK SHA256 matched');
 }
}
report.result='PASS';fs.writeFileSync('docs/round45/public-release-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
