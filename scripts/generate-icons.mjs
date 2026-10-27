// Generate platform renditions from the approved imagegen artwork.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const source='build/app-icon-source.png';
async function png(file,size){fs.mkdirSync(path.dirname(file),{recursive:true});await sharp(source).resize(size,size).removeAlpha().png().toFile(file);}
await png('build/icon.png',1024);
await png('public/app-icon.png',512);
await png('public/favicon.png',64);
await png('distribution/site/assets/icon.png',512);
for(const [density,scale] of [['mdpi',1],['hdpi',1.5],['xhdpi',2],['xxhdpi',3],['xxxhdpi',4]]){
 const dir=`android/app/src/main/res/mipmap-${density}`;
 await png(`${dir}/ic_launcher.png`,48*scale);
 await png(`${dir}/ic_launcher_round.png`,48*scale);
 await png(`${dir}/ic_launcher_foreground.png`,108*scale);
}
await png('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',1024);
for(const size of [16,32,128,256,512]){
 await png(`build/icon.iconset/icon_${size}x${size}.png`,size);
 await png(`build/icon.iconset/icon_${size}x${size}@2x.png`,size*2);
}
if(process.platform==='darwin')execFileSync('iconutil',['-c','icns','build/icon.iconset','-o','build/icon.icns']);
console.log('Updated Mac, Windows, Android, iOS, web and download-page icons.');
