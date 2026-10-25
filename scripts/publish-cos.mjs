// Upload only this game's release files/site. Secrets remain local; never printed.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createHmac} from 'node:crypto';
const envPath=process.env.COS_ENV_FILE;
if(!envPath)throw Error('Set COS_ENV_FILE to a private environment file');
const values={};for(const line of fs.readFileSync(envPath,'utf8').split('\n')){const m=line.match(/^(COS_[A-Z_]+)\s*=\s*(.*)$/);if(m)values[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}
const {COS_SECRET_ID:id,COS_SECRET_KEY:key,COS_BUCKET:bucket,COS_REGION:region}=values;
if(!id||!key||!bucket||!region)throw Error('Missing COS configuration');
const host=`${bucket}.cos.${region}.myqcloud.com`;
function auth(method,pathname){const now=Math.floor(Date.now()/1000),time=`${now-60};${now+1800}`;const signKey=createHmac('sha1',key).update(time).digest('hex');const hash=createHash('sha1').update(`${method.toLowerCase()}\n${pathname}\n\nhost=${host}\n`).digest('hex');const signature=createHmac('sha1',signKey).update(`sha1\n${time}\n${hash}\n`).digest('hex');return `q-sign-algorithm=sha1&q-ak=${id}&q-sign-time=${time}&q-key-time=${time}&q-header-list=host&q-url-param-list=&q-signature=${signature}`;}
const mime={'.json':'application/json','.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.png':'image/png','.webp':'image/webp','.dmg':'application/x-apple-diskimage','.exe':'application/octet-stream','.apk':'application/vnd.android.package-archive','.zip':'application/zip','.txt':'text/plain; charset=utf-8'};
async function put(file,objectKey,immutable=false){
 if(!objectKey.startsWith('parking-master/')||objectKey.includes('..'))throw Error('Object outside game prefix');
 const data=fs.readFileSync(file),sha=createHash('sha256').update(data).digest('hex'),pathname='/'+objectKey;
 const old=await fetch(`https://${host}${pathname}`,{method:'HEAD',headers:{Authorization:auth('HEAD',pathname)}});
 if(immutable&&old.ok){if(old.headers.get('x-cos-meta-sha256')!==sha)throw Error(`Version already exists with different content: ${objectKey}`);console.log('Verified existing',objectKey);return;}
 if(!old.ok&&old.status!==404)throw Error(`HEAD ${old.status}: ${objectKey}`);
 const headers={Authorization:auth('PUT',pathname),'Content-Type':mime[path.extname(file)]??'application/octet-stream','Content-Length':String(data.length),'Content-MD5':createHash('md5').update(data).digest('base64'),'x-cos-meta-sha256':sha,'x-cos-acl':'public-read','Cache-Control':immutable?'public,max-age=31536000,immutable':'no-cache'};
 if(/\.(dmg|exe|apk|zip)$/.test(file))headers['Content-Disposition']=`attachment; filename="${path.basename(file)}"`;
 const response=await fetch(`https://${host}${pathname}`,{method:'PUT',headers,body:data});
 if(!response.ok)throw Error(`PUT ${response.status}: ${objectKey}`);
 const verify=await fetch(`https://${host}${pathname}`,{method:'HEAD'});
 if(!verify.ok||Number(verify.headers.get('content-length'))!==data.length||verify.headers.get('x-cos-meta-sha256')!==sha)throw Error('Public upload verification failed: '+objectKey);
 console.log('Uploaded and verified',objectKey,data.length);
}
const release=JSON.parse(fs.readFileSync('distribution/site/latest.json','utf8'));
for(const asset of release.assets){const pathname=new URL(asset.url).pathname.slice(1);await put(path.join('release',asset.name),pathname,true);}
await put('release/SHA256SUMS.txt',`parking-master/releases/${release.version}/SHA256SUMS.txt`,true);
function* files(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())yield* files(p);else yield p;}}
for(const file of files('distribution/site'))if(!file.endsWith('/latest.json'))await put(file,'parking-master/'+path.relative('distribution/site',file));
// Publish the manifest last, after every linked package has passed verification.
await put('distribution/site/latest.json','parking-master/latest.json');
