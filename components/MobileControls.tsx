import {HudId} from '../utils/mobileLayout';
import React, {useRef, useEffect} from 'react';
import {Settings, Camera, Map, RotateCcw, Power, CircleParking} from 'lucide-react';
import type {InputState, CarType} from '../types';
import {CAR_MODELS} from '../constants';
import {getPowertrain, isElectricVehicle, isAutomaticVehicle, steeringWheelMaxDeg} from '../utils/powertrain';
import {MobileInputController, steeringRulerZoom, steeringRulerTicks, type HeldControl} from '../utils/mobileInput';

// Non-primary fingers do not reliably synthesize click; act on pointer-down.
function action(run: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {e.preventDefault(); e.stopPropagation(); run();},
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {if (e.detail === 0) run();},
  };
}
// Material Design Icons (Apache-2.0), see docs/round23/icon-notices.md.
function HoldBrakeIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3c-5 0-9 4-9 9s4 9 9 9s9-4 9-9s-4-9-9-9m0 16c-3.9 0-7-3.1-7-7s3.1-7 7-7s7 3.1 7 7s-3.1 7-7 7m8.5 1.5c2.2-2.2 3.5-5.2 3.5-8.5s-1.3-6.3-3.5-8.5l-1.1 1.1c1.9 1.9 3.1 4.5 3.1 7.4s-1.2 5.5-3.1 7.4zM4.6 19.4c-1.9-1.9-3.1-4.5-3.1-7.4s1.2-5.5 3.1-7.4L3.5 3.5C1.3 5.7 0 8.7 0 12s1.3 6.3 3.5 8.5zM9 7v10h2v-4h2v4h2V7h-2v4h-2V7z"/></svg>;
}
function HeadlightIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 4.8c-4 0-4 14.4 0 14.4s9-2.7 9-7.2s-5-7.2-9-7.2m.1 12.4C12.7 16.8 12 15 12 12s.7-4.8 1.1-5.2C16 6.9 20 8.7 20 12s-4 5.1-6.9 5.2M2 5h7.5c-.2.4-.5.8-.6 1.4c-.1.2-.1.4-.2.6H2zm6 6H2V9h6.2c-.1.6-.1 1.3-.2 2m.7 6c.2.8.5 1.4.9 2H2.1v-2zm-.5-2H2v-2h6c.1.7.1 1.4.2 2"/></svg>;
}
export function MobileControls(p: {input: InputState; update: React.Dispatch<React.SetStateAction<InputState>>; car: CarType; speedKmh?:number; settings: () => void; camera: () => void; map: () => void; reset: () => void; disabled: boolean; layout?: (id:HudId)=>React.CSSProperties; editing?:boolean}) {
  const controller = useRef(new MobileInputController());
  const update = useRef(p.update); update.current = p.update;
  const lock = steeringWheelMaxDeg(CAR_MODELS[p.car]);
  const zoom=steeringRulerZoom(p.speedKmh??0);
  const centre=controller.current.held('steer')?controller.current.rulerCentre:
    Math.max(-lock+lock/zoom,Math.min(lock-lock/zoom,p.input.steeringWheelAngle));
  const ticks=steeringRulerTicks(lock,centre,zoom);
  const singleSpeed = isAutomaticVehicle(p.car) || getPowertrain(p.car).gearTops.length <= 1;
  const publish = () => {
    const {handbrakeHeld, steeringWheelAngle, ...pedals} = controller.current.snapshot();
    update.current(v => ({...v, ...pedals, handbrake: !!v.parkingBrake || handbrakeHeld,
      ...(steeringWheelAngle === undefined ? {} : {steeringWheelAngle})}));
    window.dispatchEvent(new CustomEvent('mobile-steering-active', {detail: controller.current.held('steer')}));
  };
  useEffect(() => {
    const clear = () => {controller.current.clear(); publish();};
    const hidden = () => {if (document.hidden) clear();};
    window.addEventListener('blur', clear); document.addEventListener('visibilitychange', hidden);
    return () => {clear(); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', hidden);};
  }, []);
  useEffect(() => {controller.current.clear(); publish();}, [p.disabled, p.car]);
  const hold = (control: HeldControl) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault(); e.stopPropagation();
      if (p.disabled || !controller.current.begin(control, e.pointerId, e.clientX, e.clientY, p.input.steeringWheelAngle)) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      if (control === 'steer') {const r=e.currentTarget.getBoundingClientRect();controller.current.steerAt(e.pointerId,e.clientX,r.left,r.width,lock,zoom);}
      publish();
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const r=e.currentTarget.getBoundingClientRect();
      if (control === 'steer' ? controller.current.steerAt(e.pointerId,e.clientX,r.left,r.width,lock,zoom) : controller.current.move(control, e.pointerId, e.clientX, e.clientY, lock)) publish();
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {if (controller.current.end(control, e.pointerId)) publish();},
    onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {if (controller.current.end(control, e.pointerId)) publish();},
    onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => {if (controller.current.end(control, e.pointerId)) publish();},
  });
  return <div className="mobile-controls" data-ui-control>
    <div className="mobile-topbar hud-positioned" style={p.layout?.('topbar')}>
      <button aria-label="设置" title="设置" {...action(p.settings)}><Settings/></button>
      <button aria-label="切换视角" title="切换视角" {...action(p.camera)}><Camera/></button>
      <button aria-label="地图" title="地图" {...action(p.map)}><Map/></button>
      <button aria-label="重置车辆" title="重置车辆" {...action(p.reset)}><RotateCcw/></button>
    </div>
    {(!p.disabled || p.editing) && <>
      <div className="mobile-steer-zone hud-positioned" style={p.layout?.('steer')} role="slider" aria-label="左右绝对位置转向" aria-valuemin={-lock} aria-valuemax={lock} aria-valuenow={Math.round(p.input.steeringWheelAngle)} tabIndex={0} {...hold('steer')}
        onKeyDown={e => {if (['ArrowLeft','ArrowRight','Home'].includes(e.key)) {e.preventDefault(); p.update(v => ({...v, steeringWheelAngle: e.key === 'Home' ? 0 : Math.max(-lock,Math.min(lock,v.steeringWheelAngle + (e.key === 'ArrowLeft' ? -15 : 15)))}));}}}>
        <span className="mobile-steer-scale"><span className="mobile-steer-title">左转 <span>转向</span> 右转</span><span className="mobile-steer-track" data-zoomed={zoom>1.01}><span className="steer-ruler-ticks">{ticks.map(t=><i key={t.n} data-major={t.major} data-medium={t.medium} data-centre={t.n===24} style={{left:`${t.left}%`}}/>)}</span><b style={{left:`${Math.max(0,Math.min(100,50+50*(p.input.steeringWheelAngle-centre)/lock*zoom))}%`}}/></span></span>
      </div>
      <div className="mobile-drive">
        <div className="mobile-gears hud-positioned" style={p.layout?.('gears')}>{[-1,0,1].map(g => <button key={g} aria-label={g === -1 ? '倒挡' : g === 0 ? '空挡' : '前进挡'} aria-pressed={p.input.gear === g || (g === 1 && p.input.gear > 0)} {...action(() => p.update(v => ({...v, gear:g})))}>{g === -1 ? 'R' : g === 0 ? 'N' : singleSpeed ? 'D' : Math.max(1,p.input.gear)}</button>)}
          {!singleSpeed && <><button aria-label="降挡" {...action(() => p.update(v => ({...v, gear:Math.max(1,v.gear-1)})))}>−</button><button aria-label="升挡" {...action(() => p.update(v => ({...v, gear:Math.min(getPowertrain(p.car).gearTops.length,v.gear+1)})))}>＋</button></>}
        </div>
        <div className="mobile-pedals"><button className="mobile-brake hud-positioned" style={p.layout?.('brake')} aria-label="触屏刹车" {...hold('brake')}>刹车<small>上滑加力</small></button><button className="mobile-gas hud-positioned" style={p.layout?.('gas')} aria-label="触屏油门" {...hold('gas')}>油门<small>上滑加力</small></button></div>
      </div>
      <div className="mobile-aux hud-positioned" style={p.layout?.('aux')}>
        <button aria-label="启停动力" title="启停动力" aria-pressed={p.input.engineStarted} {...action(() => p.update(v => ({...v, engineStarted:!v.engineStarted})))}><Power/></button>
        <button aria-label={`灯光：${p.input.headlightMode === 2 ? '远光' : p.input.lights ? '近光' : '关闭'}`} title="灯光" aria-pressed={p.input.lights} {...action(() => p.update(v => {const mode=((v.headlightMode??0)+1)%3 as 0|1|2; return {...v, headlightMode:mode, lights:mode!==0};}))}><HeadlightIcon/>{p.input.headlightMode === 2 && <small>远</small>}</button>
        <button aria-label="驻车制动" title="驻车制动" aria-pressed={!!p.input.parkingBrake} {...action(() => p.update(v => ({...v, parkingBrake:!v.parkingBrake, handbrake:!v.parkingBrake || controller.current.held('handbrake')})))}><CircleParking/></button>
        <button aria-label="临时手刹" title="按住手刹" aria-pressed={p.input.handbrake && !p.input.parkingBrake} {...hold('handbrake')}><HoldBrakeIcon/></button>
      </div>
    </>}
  </div>;
}
