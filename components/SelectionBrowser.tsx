import React from 'react';
import {CAR_MODELS,GARAGE_CARS,LEVEL_LIST} from '../constants';
import {CarType} from '../types';
import {assetUrl} from '../utils/assetUrl';
import {isElectricVehicle} from '../utils/powertrain';
import CarPreview3D from './CarPreview3D';

export function VehicleBrowser(p:{car:CarType;select:(c:CarType)=>void}){
 const car=CAR_MODELS[p.car];
 return <div className="selection-browser">
  <div className="selection-stage vehicle-stage">
   <CarPreview3D carType={p.car}/>
   <div className="selection-caption"><span>GARAGE / {String(GARAGE_CARS.indexOf(p.car)+1).padStart(2,'0')}</span><h2>{car.name}</h2><p>{isElectricVehicle(p.car)?'电驱 · 自动挡':'燃油 · 手动挡'} · {car.dynamics.driveLayout} · {car.dynamics.powerKw} kW</p></div>
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
