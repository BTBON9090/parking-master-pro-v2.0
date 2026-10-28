import React,{useEffect,useState} from 'react';
import {Power} from 'lucide-react';
import {startGarageAudio} from '../utils/garageAudio';
import VehicleBrand from './VehicleBrand';
import {CAR_MODELS,GARAGE_CARS,LEVEL_LIST} from '../constants';
import {CarType} from '../types';
import {assetUrl} from '../utils/assetUrl';
import {isElectricVehicle} from '../utils/powertrain';
import CarPreview3D from './CarPreview3D';

export function VehicleBrowser(p:{car:CarType;select:(c:CarType)=>void}){
 const car=CAR_MODELS[p.car];
 const [previewOn,setPreviewOn]=useState(true);
 useEffect(()=>{if(previewOn)return startGarageAudio(car);},[p.car,previewOn]);
 return <div className="selection-browser">
  <div className="selection-stage vehicle-stage">
   <CarPreview3D carType={p.car}/>
   <div className="selection-caption"><VehicleBrand car={p.car}/><span>GARAGE / {String(GARAGE_CARS.indexOf(p.car)+1).padStart(2,'0')}</span><h2>{car.name}</h2><p>{isElectricVehicle(p.car)?'电驱 · 自动挡':car.automatic?'燃油 · 自动挡':'燃油 · 手动挡'} · {car.dynamics.driveLayout} · {car.dynamics.powerKw} kW</p></div>
   <button className="garage-engine-preview" aria-label="发动机声音试听" aria-pressed={previewOn} onClick={()=>setPreviewOn(v=>!v)}><Power size={18}/>{previewOn?'动力试听 · 开':'动力试听 · 关'}</button>
   <small className="orbit-hint">拖动环视 · 双指 / 滚轮缩放</small>
  </div>
  <div className="selection-rail" aria-label="座驾列表">{GARAGE_CARS.map(c=><button key={c} aria-pressed={p.car===c} onClick={()=>p.select(c)}><img src={assetUrl('thumbnails/'+c+'.png')} alt=""/><strong>{CAR_MODELS[c].name}</strong></button>)}</div>
 </div>;
}
export function MapBrowser(p:{level:number;select:(n:number)=>void;training?:React.ReactNode}){
 const map=LEVEL_LIST.find(l=>l.id===p.level)??LEVEL_LIST[0];
 return <div className="selection-browser">
  <div className={`selection-stage map-stage ${p.training?'with-training':''}`}>
   <div className="map-preview"><img src={assetUrl(map.thumbnail)} alt={map.name+'路线全图'}/><div className="selection-caption"><span>DESTINATION</span><h2>{map.name}</h2><p>{map.desc}</p></div></div>
   {p.training&&<aside className="training-options">{p.training}</aside>}
  </div>
  <div className="selection-rail" aria-label="地图列表">{LEVEL_LIST.map(l=><button key={l.id} aria-pressed={p.level===l.id} onClick={()=>p.select(l.id)}><img src={assetUrl(l.thumbnail)} alt=""/><strong>{l.name}</strong></button>)}</div>
 </div>;
}
