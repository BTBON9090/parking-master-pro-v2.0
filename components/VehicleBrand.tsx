import React from 'react';
import {CarType} from '../types';
import {assetUrl} from '../utils/assetUrl';
const brands:Partial<Record<CarType,[string,string?]>>={
 [CarType.CYBERTRUCK]:['TESLA','tesla'],[CarType.REVUELTO]:['LAMBORGHINI','lamborghini'],[CarType.VEYRON]:['BUGATTI','bugatti'],[CarType.MINI]:['MINI','mini'],
 [CarType.SEAL08]:['BYD','byd'],[CarType.TAI7]:['方程豹'],[CarType.SUV]:['ONVO'],[CarType.LI_I9]:['Li Auto'],[CarType.N90]:['XIAOMI'],[CarType.V800]:['MAEXTRO'],
 [CarType.TYPE100]:['TYPE 100'],[CarType.MINING]:['巨岩 / QUARRY'],[CarType.US22]:['洲际 / INTERSTATE'],[CarType.SEMI]:['洲际 / INTERSTATE'],
 [CarType.TRACTOR]:['农场 / FARM'],[CarType.TRIKE]:['农用 / UTILITY'],[CarType.COACH]:['长途 / COACH'],[CarType.MIDIBUS]:['远行 / TRANSIT'],
 [CarType.VAN]:['接驳 / SHUTTLE'],[CarType.LIGHT_TRUCK]:['接驳 / TRANSIT'],[CarType.JEEP]:['山地 / TRAIL'],[CarType.TRUCK]:['荒野 / WILD']};
export default function VehicleBrand({car}:{car:CarType}){const [name,icon]=brands[car]??['驾驶训练'];return <div className="vehicle-brand" aria-label={name}>{icon&&<img src={assetUrl('brands/'+icon+'.svg')} alt=""/>}<b>{name}</b></div>;}
