import React,{useEffect,useState} from 'react';
export function MountainAdventurePanel(){
 const [state,setState]=useState<{near?:boolean;active?:boolean;up?:boolean;progress?:number;stopped?:boolean;error?:string}>({});
 useEffect(()=>{const update=(e:Event)=>{const next=(e as CustomEvent).detail;setState(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);};window.addEventListener('mountain-lift-status',update);return()=>window.removeEventListener('mountain-lift-status',update);},[]);
 if(!state.near&&!state.active)return null;
 return <aside className="mountain-lift-panel" data-ui-control><strong>{state.active?'车辆升降机 · '+state.progress+'%':'云顶车辆升降机'}</strong><span>{state.error??(state.active?'请留在升降台内，到站后重新起步。':'整车停入平台，可往返云顶与山腹涵洞。')}</span>
 {state.active?<button onClick={()=>window.dispatchEvent(new Event('mountain-lift-skip'))}>跳过本次升降动画</button>:<button disabled={!state.stopped} onClick={()=>window.dispatchEvent(new Event('mountain-lift-start'))}>{state.stopped?(state.up?'上行至云顶':'下行至山腹'):'请先停稳车辆'}</button>}</aside>;
}
