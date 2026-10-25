import React, { useEffect, useRef } from 'react';
import { Camera, GripHorizontal } from 'lucide-react';
import { CarConfig, HoodCameraAdjustment, Language } from '../types';
import { resolveHoodCameraLocalPose } from '../utils/hoodCamera';

interface HoodCameraLocatorProps {
  car: CarConfig;
  adjustment: HoodCameraAdjustment;
  lang: Language;
}

const PANEL_WIDTH = 354;
const PANEL_HEIGHT = 254;
const EDGE_GAP = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const HoodCameraLocator: React.FC<HoodCameraLocatorProps> = ({ car, adjustment, lang }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({
    x: 18,
    y: typeof window === 'undefined' ? 320 : Math.min(320, window.innerHeight - PANEL_HEIGHT - EDGE_GAP),
  });
  const dragRef = useRef({ active: false, pointerId: -1, dx: 0, dy: 0 });
  const isCN = lang === Language.CN;
  const pose = resolveHoodCameraLocalPose(car, adjustment);

  const applyPosition = () => {
    if (!panelRef.current) return;
    panelRef.current.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
  };

  const clampPosition = () => {
    positionRef.current.x = clamp(positionRef.current.x, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - PANEL_WIDTH - EDGE_GAP));
    positionRef.current.y = clamp(positionRef.current.y, EDGE_GAP, Math.max(EDGE_GAP, window.innerHeight - PANEL_HEIGHT - EDGE_GAP));
    applyPosition();
  };

  useEffect(() => {
    clampPosition();
    window.addEventListener('resize', clampPosition);
    return () => window.removeEventListener('resize', clampPosition);
  }, []);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      dx: event.clientX - positionRef.current.x,
      dy: event.clientY - positionRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return;
    positionRef.current.x = clamp(
      event.clientX - dragRef.current.dx,
      EDGE_GAP,
      Math.max(EDGE_GAP, window.innerWidth - PANEL_WIDTH - EDGE_GAP),
    );
    positionRef.current.y = clamp(
      event.clientY - dragRef.current.dy,
      EDGE_GAP,
      Math.max(EDGE_GAP, window.innerHeight - PANEL_HEIGHT - EDGE_GAP),
    );
    applyPosition();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId === event.pointerId) dragRef.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const halfLength = car.length * 0.5;
  const halfWidth = car.width * 0.5;
  const topX = clamp(50 - pose.x / Math.max(halfWidth + 8, 1) * 37, 7, 93);
  const topY = clamp(50 - pose.z / Math.max(halfLength + 10, 1) * 42, 6, 94);
  const sideX = clamp(50 + pose.z / Math.max(halfLength + 10, 1) * 42, 6, 94);
  const heightScale = Math.max(car.height + 12, pose.y + 6, 1);
  const elevationY = clamp(91 - pose.y / heightScale * 76, 7, 91);
  const frontX = clamp(50 - pose.x / Math.max(halfWidth + 8, 1) * 37, 7, 93);
  const yawScreenDeg = -adjustment.yaw;
  const pitchScreenDeg = -adjustment.pitch;

  const marker = (title: string, left: number, top: number) => (
    <span
      title={title}
      className="absolute z-20 grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
      style={{ left: `${left}%`, top: `${top}%`, background: 'var(--amber)', color: '#17130a', boxShadow: '0 0 0 2px rgba(10,10,11,0.86)' }}>
      <Camera size={9} strokeWidth={2.4} />
    </span>
  );

  return (
    <div
      ref={panelRef}
      className="fixed left-0 top-0 pointer-events-auto select-none"
      style={{ width: PANEL_WIDTH, zIndex: 46, willChange: 'transform' }}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
      onContextMenu={event => event.stopPropagation()}>
      <div className="cockpit-panel overflow-hidden">
        <div className="h-[2px] w-full" style={{ background: 'var(--amber)' }} />
        <div
          className="flex cursor-grab items-center justify-between border-b px-3 py-2 active:cursor-grabbing"
          style={{ borderColor: 'var(--hairline)', touchAction: 'none' }}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}>
          <div className="flex items-center gap-2">
            <GripHorizontal size={13} style={{ color: 'var(--text-mute)' }} />
            <Camera size={13} style={{ color: 'var(--amber)' }} />
            <span className="mono text-[10px] font-bold tracking-[0.14em]" style={{ color: 'var(--text)' }}>
              {isCN ? '驾驶眼位定位' : 'DRIVER EYE LOCATOR'}
            </span>
          </div>
          <span className="mono text-[8px]" style={{ color: 'var(--text-mute)' }}>{isCN ? '拖动窗口' : 'DRAG'}</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 px-2.5 pt-2.5">
          <Projection title={isCN ? '顶视图' : 'TOP'} frontLabel={isCN ? '车头' : 'FRONT'}>
            <div className="absolute left-1/2 top-1/2 h-[74%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border"
                 style={{ borderColor: 'rgba(244,244,245,0.5)', background: 'rgba(244,244,245,0.08)' }}>
              <div className="absolute left-1/2 top-1 h-2 w-[54%] -translate-x-1/2 rounded-t-md border-t"
                   style={{ borderColor: 'var(--amber)' }} />
            </div>
            <div className="absolute h-px w-8 origin-left" style={{ left: `${topX}%`, top: `${topY}%`, transform: `rotate(${yawScreenDeg - 90}deg)`, background: 'var(--amber)' }} />
            {marker(isCN ? '摄像机顶视位置' : 'Camera top position', topX, topY)}
            <AxisLabel className="left-1 top-1/2 -translate-y-1/2">L</AxisLabel>
            <AxisLabel className="right-1 top-1/2 -translate-y-1/2">R</AxisLabel>
          </Projection>

          <Projection title={isCN ? '侧视图' : 'SIDE'} frontLabel={isCN ? '车头' : 'FRONT'}>
            <div className="absolute bottom-[14%] left-1/2 h-[34%] w-[78%] -translate-x-1/2 rounded-t-[16px] border"
                 style={{ borderColor: 'rgba(244,244,245,0.5)', background: 'rgba(244,244,245,0.08)' }}>
              <div className="absolute -bottom-1 left-[14%] h-3 w-3 rounded-full border" style={{ borderColor: 'var(--text-dim)', background: 'var(--bg)' }} />
              <div className="absolute -bottom-1 right-[14%] h-3 w-3 rounded-full border" style={{ borderColor: 'var(--text-dim)', background: 'var(--bg)' }} />
            </div>
            <div className="absolute h-px w-8 origin-left" style={{ left: `${sideX}%`, top: `${elevationY}%`, transform: `rotate(${pitchScreenDeg}deg)`, background: 'var(--amber)' }} />
            {marker(isCN ? '摄像机侧视位置' : 'Camera side position', sideX, elevationY)}
          </Projection>

          <Projection title={isCN ? '正视图' : 'FRONT'} frontLabel={isCN ? '面向车头' : 'FACING FRONT'}>
            <div className="absolute bottom-[14%] left-1/2 h-[56%] w-[72%] -translate-x-1/2 rounded-t-[22px] border"
                 style={{ borderColor: 'rgba(244,244,245,0.5)', background: 'rgba(244,244,245,0.08)' }}>
              <div className="absolute bottom-0 left-[7%] h-[46%] w-[8%]" style={{ background: 'var(--text-mute)' }} />
              <div className="absolute bottom-0 right-[7%] h-[46%] w-[8%]" style={{ background: 'var(--text-mute)' }} />
            </div>
            {marker(isCN ? '摄像机正视位置' : 'Camera front position', frontX, elevationY)}
            <AxisLabel className="left-1 top-1/2 -translate-y-1/2">L</AxisLabel>
            <AxisLabel className="right-1 top-1/2 -translate-y-1/2">R</AxisLabel>
          </Projection>
        </div>

        <div className="mx-2.5 mb-2.5 mt-2 grid grid-cols-3 gap-x-3 border-t pt-2 mono text-[8px]"
             style={{ borderColor: 'var(--hairline)', color: 'var(--text-mute)' }}>
          <PoseValue label="X / L" value={pose.x} />
          <PoseValue label="Y / H" value={pose.y} />
          <PoseValue label="Z / F" value={pose.z} />
          <PoseValue label={isCN ? '俯仰' : 'PITCH'} value={adjustment.pitch} suffix="°" />
          <PoseValue label={isCN ? '偏航' : 'YAW'} value={adjustment.yaw} suffix="°" />
          <PoseValue label="FOV" value={adjustment.fov} suffix="°" />
        </div>
      </div>
    </div>
  );
};

const Projection: React.FC<{ title: string; frontLabel: string; children: React.ReactNode }> = ({ title, frontLabel, children }) => (
  <div className="min-w-0">
    <div className="mb-1 flex items-center justify-between px-0.5 mono text-[8px]">
      <span style={{ color: 'var(--text-dim)' }}>{title}</span>
      <span style={{ color: 'var(--amber)' }}>{frontLabel}</span>
    </div>
    <div className="relative h-[92px] overflow-hidden rounded-lg border"
         style={{ borderColor: 'var(--hairline)', background: 'rgba(6,8,11,0.82)' }}>
      <div className="absolute inset-0 opacity-40"
           style={{ background: 'rgba(255,255,255,0.055)' }} />
      {children}
    </div>
  </div>
);

const AxisLabel: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`absolute mono text-[7px] ${className}`} style={{ color: 'var(--text-mute)' }}>{children}</span>
);

const PoseValue: React.FC<{ label: string; value: number; suffix?: string }> = ({ label, value, suffix = '' }) => (
  <span className="flex justify-between gap-1">
    <span>{label}</span>
    <strong style={{ color: 'var(--amber)', fontWeight: 600 }}>{value.toFixed(2)}{suffix}</strong>
  </span>
);

export default HoodCameraLocator;
