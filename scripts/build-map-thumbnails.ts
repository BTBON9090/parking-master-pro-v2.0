import fs from 'node:fs';
import {GENERATE_LEVEL,LEVEL_LIST} from '../constants';
import {WORLD_ROUTES,mapCurveSamples} from '../utils/openWorld';
for(const item of LEVEL_LIST){
 const level=GENERATE_LEVEL(item.id),w=level.mapWidth,h=level.mapHeight;
 let content=`<rect width="${w}" height="${h}" fill="#1e3135"/>`;
 const path=(points:{x:number,y:number}[],width:number,color:string,closed=false)=>`<path d="M ${points.map(p=>p.x+','+p.y).join(' L ')}${closed?' Z':''}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
 for(const r of level.roadSurfaces??[])content+=`<rect x="${r.x-r.width/2}" y="${r.y-r.height/2}" width="${r.width}" height="${r.height}" fill="#536366" transform="rotate(${r.rotation*180/Math.PI} ${r.x} ${r.y})"/>`;
 for(const r of level.curvedRoads??[])content+=path(mapCurveSamples(r),r.width,'#a1afa1',r.closed);
 if(level.openWorld){content+=`<ellipse cx="12700" cy="4350" rx="3900" ry="3500" fill="#40594a"/>`;for(const r of WORLD_ROUTES)content+=path(r.samples,r.width*1.6,r.gravel?'#cfab71':'#e1e7d2',r.closed);}
 for(const s of level.spots)content+=`<rect x="${s.x-s.width/2}" y="${s.y-s.height/2}" width="${s.width}" height="${s.height}" fill="none" stroke="#b7c6bb" stroke-width="2" transform="rotate(${s.rotation*180/Math.PI} ${s.x} ${s.y})"/>`;
 content+=`<circle cx="${level.startPos.x}" cy="${level.startPos.y}" r="${w*.015}" fill="#f6b63b"/><circle cx="${level.startPos.x}" cy="${level.startPos.y}" r="${w*.025}" fill="none" stroke="#f6b63b" stroke-width="${w*.003}"/>`;
 fs.writeFileSync(`public/thumbnails/map-${item.id}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 ${w+120} ${h+120}">${content}</svg>`);
}
