import React,{useEffect,useState} from 'react';
import {assetUrl} from '../utils/assetUrl';
export function LoadingDrive({stage,compact=false}:{stage:string;compact?:boolean}){
 const [slide,setSlide]=useState(0);useEffect(()=>{const t=setInterval(()=>setSlide(v=>(v+1)%3),5500);return()=>clearInterval(t);},[]);
 return <div className={compact?'loading-drive compact':'loading-drive'} role="status">{!compact&&<img src={assetUrl('/loading/guide-'+slide+'.svg')} alt={['起步：挂挡、解除驻车，再轻踩油门','夜间：切换近光与远光，看清弯道','冰雪：缓踩油门，提前减速'][slide]}/>}<div><span>{stage}</span><div className="loading-track"><i/></div></div></div>;
}
