import React from 'react';
import type {UserSettings,CarType} from '../types';
import {DEFAULT_DRIVER_SEAT,DRIVER_SEAT_LIMITS,normalizeDriverSeat} from '../utils/driverSeat';

export function DriverSeatControls({settings,update,car,compact=false}:{settings:UserSettings;update:(patch:Partial<UserSettings>)=>void;car:CarType;compact?:boolean}){
 const seat=normalizeDriverSeat(settings.driverSeatAdjustments?.[car]);
 const rows=[
  ['forwardCm','座椅前后','正值更靠近驾驶台，负值更远。','cm'],
  ['heightCm','座椅高低','正值升高眼点，负值降低眼点。','cm'],
  ['pitchDeg','视线俯仰','正值抬头，负值低头。','°'],
 ] as const;
 return <div className={compact?'driver-seat-controls compact':'driver-seat-controls'}>
  <h3>驾驶位视角</h3><p className={compact?'':'settings-note'}>调整驾驶舱眼点与视线。接近车顶或仪表台时自动限制，避免视点穿入车体。</p>
  {rows.map(([key,label,description,unit])=>{const [min,max]=DRIVER_SEAT_LIMITS[key];const value=seat[key];return <label className={compact?'driver-seat-row':'settings-row range-row'} key={key}>
   <span><strong>{label}</strong>{!compact&&<small>{description}</small>}</span>
   <div><output>{value>0?'+':''}{value}{unit}</output><input aria-label={label} type="range" min={min} max={max} step="1" value={value} onChange={e=>update({driverSeatAdjustments:{...settings.driverSeatAdjustments,[car]:{...seat,[key]:Number(e.target.value)}}})}/></div>
  </label>})}
  <button type="button" className="driver-seat-reset" onClick={()=>update({driverSeatAdjustments:{...settings.driverSeatAdjustments,[car]:{...DEFAULT_DRIVER_SEAT}}})}>恢复默认驾驶位</button>
 </div>;
}
