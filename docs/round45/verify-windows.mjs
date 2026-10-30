import fs from 'node:fs';import path from 'node:path';import asar from '@electron/asar';
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):e.name!=='.DS_Store'?[path.join(dir,e.name)]:[])}
const bundle='release/win-0291-app/resources/app.asar',assets=files('dist');
const version=JSON.parse(asar.extractFile(bundle,'package.json').toString()).version;if(version!=='0.29.1')throw Error(version);
const report={version,assetCount:assets.length,exact:0,lineEndingOnly:[],htmlBlankLines:[]};
for(const file of assets){const a=fs.readFileSync(file),b=asar.extractFile(bundle,file);if(a.equals(b)){report.exact++;continue;}
 if(file.endsWith('.html')&&a.toString().split(/[\r\n]+/).filter(l=>l.trim()).join('\n')===b.toString().split(/[\r\n]+/).filter(l=>l.trim()).join('\n')){report.htmlBlankLines.push(file);continue;}
 if(!/\.(md|txt|svg|html)$/.test(file)||a.toString().replace(/\r\n/g,'\n')!==b.toString().replace(/\r\n/g,'\n'))throw Error('Windows resource mismatch: '+file);report.lineEndingOnly.push(file);
}
fs.writeFileSync('docs/round45/windows-package-check.json',JSON.stringify(report,null,2)+'\n');console.log(report);
