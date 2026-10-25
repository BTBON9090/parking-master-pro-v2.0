import {useEffect,useState} from 'react';
export function isTouchDevice(){return typeof window!=='undefined'&&(window.matchMedia('(pointer: coarse)').matches||new URLSearchParams(location.search).get('controls')==='touch');}
export function useTouchControls(){
 const [touch,setTouch]=useState(isTouchDevice);
 useEffect(()=>{const query=matchMedia('(pointer: coarse)');const update=()=>setTouch(isTouchDevice());query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
 return touch;
}
