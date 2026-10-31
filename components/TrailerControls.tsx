import React,{useEffect,useState} from 'react';
import {CarType} from '../types';
import {Truck} from 'lucide-react';
export function TrailerControls({car,levelId}:{car:CarType;levelId?:number}){
 const [state,setState]=useState({attached:true,message:''});
 useEffect(()=>{setState({attached:true,message:''});const update=(event:Event)=>setState((event as CustomEvent).detail);window.addEventListener('trailer-status',update);return()=>window.removeEventListener('trailer-status',update);},[car,levelId]);
 if(car!==CarType.SEMI&&car!==CarType.US22)return null;
 return <div className="live-trailer" data-ui-control><button type="button" title={state.attached?'分离车厢':'对接车厢'} aria-label={state.attached?'分离车厢':'对接车厢'} onClick={()=>window.dispatchEvent(new Event('trailer-command'))}><Truck size={18}/></button>{state.message&&<small role="status">{state.message}</small>}</div>;
}
