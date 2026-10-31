import {recordingFamily} from './recordingProfiles';
import {CarType} from '../types';

import {assetUrl} from './assetUrl';
import {roadMix} from './motorAudio';
/**
 * CC0 road/gravel/skid and ignition recording layers. Combustion vehicles use real
 * recorded engine families; these are not recordings of each named OEM engine.
 */
export type RecordingSurface = 'asphalt' | 'gravel';

export interface RecordingAudioStatus {
  ready: boolean;
  loaded: number;
  total: number;
  failed: string[];
  active: boolean;
}

export interface RecordingAudioParams {
  carType?:CarType;
  enabled: boolean;
  paused: boolean;
  engineOn: boolean;
  electric: boolean;
  cabin?: boolean;
  engineSoundEnabled?: boolean;
  rpm: number;
  redlineRpm: number;
  throttle: number;
  speedAbs: number;
  distanceM?: number;
  insulation?: number;
  surface: RecordingSurface;
  skid: number;
  volume: number;
}

const ASSETS = [
  ...(['farm','heavy','diesel'] as const).flatMap(f=>[{key:`${f}Idle` as const,url:`/audio/${f}-idle-loop.wav`},{key:`${f}Load` as const,url:`/audio/${f}-load-loop.wav`}]),
  { key: 'engineIdle', url: '/audio/engine-idle-loop.wav' },
  { key: 'engineLoad', url: '/audio/engine-load-loop.wav' },
  { key: 'road', url: '/audio/road-loop.wav' },
  { key: 'gravel', url: '/audio/gravel-loop.wav' },
  { key: 'skid', url: '/audio/skid-loop.wav' },
  { key: 'metal1', url: '/audio/metal-hit-1.wav' },
  { key: 'metal2', url: '/audio/metal-hit-2.wav' },
  { key: 'iceStart', url: '/audio/ice-start.wav' },
  { key: 'iceStop', url: '/audio/ice-stop.wav' },
  { key: 'evStart', url: '/audio/ev-start.wav' },
  { key: 'evStop', url: '/audio/ev-stop.wav' },
] as const;

type AssetKey = typeof ASSETS[number]['key'];
type EngineFamily='engine'|'farm'|'heavy'|'diesel';
type LoopKey = `${EngineFamily}Idle` | `${EngineFamily}Load` | 'road' | 'gravel' | 'skid';


let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let initPromise: Promise<RecordingAudioStatus> | null = null;
const buffers = new Map<AssetKey, AudioBuffer>();
const loops = new Map<LoopKey, { source: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode }>();
let status: RecordingAudioStatus = { ready: false, loaded: 0, total: ASSETS.length, failed: [], active: false };
let currentParams: RecordingAudioParams | null = null;
// Persistent lifecycle state: UI pause, window focus and page visibility are
// independent; a per-frame params.paused=false must never undo a blur.
let uiPaused = false;
let windowFocused = true;
let pageHidden = false;
let generation = 0;
let abortController: AbortController | null = null;
let ignitionOn:boolean|null=null;
let ignitionSource:AudioBufferSourceNode|null=null;
function playIgnition(params:RecordingAudioParams){
 if(!ctx||!master)return;
 if(ignitionSource){try{ignitionSource.stop();}catch{} ignitionSource.disconnect();ignitionSource=null;}
 if(!isRecordingAudible(params)||params.engineSoundEnabled===false)return;
 const key=params.electric?(params.engineOn?'evStart':'evStop'):(params.engineOn?'iceStart':'iceStop');
 const buffer=buffers.get(key);if(!buffer)return;
 const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
 source.buffer=buffer;source.loop=false;filter.type='lowpass';filter.frequency.value=params.cabin?1400:2600;filter.Q.value=.55;
 gain.gain.value=params.electric?.65:params.cabin?.5:.85;
 source.connect(filter);filter.connect(gain);gain.connect(master);
 source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();if(ignitionSource===source)ignitionSource=null;};
 source.start();ignitionSource=source;
}

export interface RecordingLifecycle {
  uiPaused: boolean;
  windowFocused: boolean;
  pageHidden: boolean;
}

export function getRecordingLifecycle(): RecordingLifecycle {
  return { uiPaused, windowFocused, pageHidden };
}

export function isRecordingAudible(
  params: Pick<RecordingAudioParams, 'enabled' | 'paused'>,
  lifecycle: RecordingLifecycle = getRecordingLifecycle(),
): boolean {
  return params.enabled && !params.paused && !lifecycle.uiPaused
    && lifecycle.windowFocused && !lifecycle.pageHidden;
}

export function shouldCommitAudioLoad(startedGeneration: number): boolean {
  return startedGeneration === generation;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function applyMasterGain(context: AudioContext): void {
  if (!master) return;
  const audible = currentParams ? isRecordingAudible(currentParams) : false;
  const volume = currentParams ? clamp(currentParams.volume, 0, 2) : 0;
  master.gain.setTargetAtTime(audible ? volume * 0.95 : 0, context.currentTime, 0.08);
}

function connectLoop(context: AudioContext, key: LoopKey, buffer: AudioBuffer, filterType?: BiquadFilterType, frequency = 1000): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = context.createGain();
  gain.gain.value = 0;
  if (filterType) {
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.55;
    source.connect(filter);
    filter.connect(gain);
    loops.set(key, { source, gain, filter });
  } else {
    source.connect(gain);
    loops.set(key, { source, gain });
  }
  if((key==='road'||key==='gravel')&&context.createStereoPanner){
    // Balanced L/R ambience with independent short reflections; engine stays centred.
    for(const side of [-1,1]){const pan=context.createStereoPanner(),delay=context.createDelay(.1),level=context.createGain();pan.pan.value=side*.55;delay.delayTime.value=side<0?.006:.014;level.gain.value=.5;gain.connect(delay);delay.connect(pan);pan.connect(level);level.connect(master!);}
  }else gain.connect(master!);
  source.start();
}

export function getRecordingAudioStatus(): RecordingAudioStatus {
  return { ...status, failed: [...status.failed] };
}

export function initRecordingAudio(context: AudioContext): Promise<RecordingAudioStatus> {
  if (initPromise) return initPromise;
  const myGeneration = ++generation;
  abortController?.abort();
  abortController = new AbortController();
  const signal = abortController.signal;
  ctx = context;
  master = context.createGain();
  master.gain.value = 0;master.channelCount=2;master.channelCountMode='explicit';master.channelInterpretation='speakers';
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 10;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.18;
  master.connect(limiter);
  limiter.connect(context.destination);
  initPromise = Promise.allSettled(ASSETS.map(async asset => {
    const response = await fetch(assetUrl(asset.url), { signal });
    if (!response.ok) throw new Error(`${asset.url}: ${response.status}`);
    const data = await response.arrayBuffer();
    const decoded = await context.decodeAudioData(data);
    if (!shouldCommitAudioLoad(myGeneration)) throw new Error('audio load superseded');
    buffers.set(asset.key, decoded);
  })).then(results => {
    if (!shouldCommitAudioLoad(myGeneration) || !ctx || !master) {
      return getRecordingAudioStatus();
    }
    const failed: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') failed.push(ASSETS[index].key);
    });
    status = {
      ready: failed.length === 0,
      loaded: buffers.size,
      total: ASSETS.length,
      failed,
      active: false,
    };
    if (status.ready && shouldCommitAudioLoad(myGeneration) && ctx && master) {
      for(const family of ['engine','farm','heavy','diesel'] as const){connectLoop(context, `${family}Idle`, buffers.get(`${family}Idle`)!, 'lowpass', 1700);connectLoop(context, `${family}Load`, buffers.get(`${family}Load`)!, 'lowpass', 2200);}
      connectLoop(context, 'road', buffers.get('road')!, 'lowpass', 1200);
      connectLoop(context, 'gravel', buffers.get('gravel')!, 'lowpass', 1100);
      connectLoop(context, 'skid', buffers.get('skid')!, 'lowpass', 1600);
    }
    if (currentParams) updateRecordingAudio(currentParams);
    return getRecordingAudioStatus();
  }).catch(error => {
    if (!shouldCommitAudioLoad(myGeneration)) return getRecordingAudioStatus();
    status = { ready: false, loaded: buffers.size, total: ASSETS.length, failed: ['decode'], active: false };
    console.warn('[audio] recording load failed; keeping synth fallback', error);
    return getRecordingAudioStatus();
  });
  return initPromise;
}

export function updateRecordingAudio(params: RecordingAudioParams): void {
  currentParams = params;
  if (!status.ready || !ctx || !master) return;
  const now = ctx.currentTime;
  const audible = isRecordingAudible(params);
  status.active = audible;
  // A settings toggle must also silence a one-shot already in progress.
  if ((!audible || params.engineSoundEnabled === false) && ignitionSource) {
    try { ignitionSource.stop(); } catch {}
    ignitionSource.disconnect();
    ignitionSource = null;
  }
  if((ignitionOn!==null&&ignitionOn!==params.engineOn)||(ignitionOn===null&&audible)){
    if(params.engineOn||ignitionOn!==null)playIgnition(params);
    ignitionOn=params.engineOn;
  }
  master.gain.setTargetAtTime(audible ? clamp(params.volume, 0, 2) * 0.95 : 0, now, 0.08);
  const rpmNorm = clamp((params.rpm - 700) / Math.max(1, params.redlineRpm - 700), 0, 1);
  const family=recordingFamily(params.carType);
  const engineActive = audible && params.engineOn && !params.electric && params.engineSoundEnabled!==false;
  const cabinScale=params.cabin?(params.insulation??.12):1;
  const road=roadMix(params.speedAbs,!!params.cabin,params.distanceM,params.insulation);
  const idleGain = engineActive ? (params.cabin?.14:.22) * (0.45 + rpmNorm * 0.55) : 0;
  const loadGain = engineActive ? (params.cabin?.23:.32) * clamp(params.throttle, 0, 1) * (0.35 + rpmNorm * 0.65) : 0;
  const roadGain = audible ? road.gain : 0;
  const gravelGain = audible && params.surface === 'gravel' ? road.gain*.9 : 0;
  const skidGain = audible ? (params.cabin?.08:.24) * clamp(params.skid, 0, 1) : 0;
  const setLoop = (key: LoopKey, gainValue: number, rate: number) => {
    const loop = loops.get(key);
    if (!loop) return;
    loop.gain.gain.setTargetAtTime(gainValue, now, key==='road'||key==='gravel'?road.smoothing:0.09);
    loop.source.playbackRate.setTargetAtTime(clamp(rate, 0.55, 2.2), now, 0.12);
  };
  for(const f of ['engine','farm','heavy','diesel'] as const){
    for(const key of [`${f}Idle`,`${f}Load`] as const)loops.get(key)?.filter?.frequency.setTargetAtTime(params.cabin?650:2800,now,.18);
    setLoop(`${f}Idle`,f===family?idleGain:0,.86+rpmNorm*.36);
    setLoop(`${f}Load`,f===family?loadGain:0,.85+rpmNorm*.60);
  }
  for(const key of ['road','gravel'] as const) loops.get(key)?.filter?.frequency.setTargetAtTime(road.cutoff,now,.18);
  loops.get('skid')?.filter?.frequency.setTargetAtTime(params.cabin?550:1600,now,.18);
  setLoop('road', roadGain, road.rate);
  setLoop('gravel', gravelGain, 0.90 + clamp(params.speedAbs / 10, 0, 1) * 0.30);
  setLoop('skid', skidGain, 0.95 + clamp(params.speedAbs / 12, 0, 1) * 0.25);
}

export function setRecordingAudioPaused(paused: boolean): void {
  uiPaused = paused;
  status.active = currentParams ? isRecordingAudible(currentParams) : false;
  if (ctx) applyMasterGain(ctx);
}

/** Window focus and page visibility are persistent, not one-frame overrides. */
export function setRecordingAudioFocus(focused: boolean, hidden = false): void {
  windowFocused = focused;
  pageHidden = hidden;
  status.active = currentParams ? isRecordingAudible(currentParams) : false;
  if (ctx) applyMasterGain(ctx);
}

export function setRecordingAudioVisibility(hidden: boolean): void {
  pageHidden = hidden;
  status.active = currentParams ? isRecordingAudible(currentParams) : false;
  if (ctx) applyMasterGain(ctx);
}

export function playRecordingImpact(strength = 1, cabin = false, underbody = false): void {
  if (!status.ready || !ctx || !master) return;
  const first:AssetKey=Math.random()<.5?'metal1':'metal2',second:AssetKey=first==='metal1'?'metal2':'metal1';
  const now = ctx.currentTime;
  const layer=(key:AssetKey,delay:number,level:number,cutoff:number)=>{
    const buffer=buffers.get(key);if(!buffer||!ctx||!master)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    source.buffer=buffer;source.playbackRate.value=.94+Math.random()*.12;
    filter.type='lowpass';filter.frequency.value=cabin?Math.min(cutoff,underbody?2400:900):cutoff;
    const start=now+delay,end=start+Math.min(.8,buffer.duration);
    gain.gain.setValueAtTime(Math.max(.001,level),start);gain.gain.exponentialRampToValueAtTime(.001,end);
    source.connect(filter);filter.connect(gain);gain.connect(master);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start(start);source.stop(end+.02);
  };
  const energy=clamp(strength,0,1);
  // Two short CC0 metal recordings with a muffled body layer, rather than a
  // single repeated tinny hit. Master gain already includes user volume.
  layer(first,0,.12+energy*.4,3800);layer(first,0,.12+energy*.25,300);
  if(energy>.28)layer(second,.045,.08+energy*.15,2200);
}

export function disposeRecordingAudio(): void {
  generation++;
  if(ignitionSource){try{ignitionSource.stop();}catch{} ignitionSource.disconnect();ignitionSource=null;}
  ignitionOn=null;
  abortController?.abort();
  abortController = null;
  loops.forEach(loop => {
    try { loop.source.stop(); } catch { /* already stopped */ }
    loop.source.disconnect();
    loop.gain.disconnect();
    loop.filter?.disconnect();
  });
  loops.clear();
  buffers.clear();
  master?.disconnect();
  master = null;

  ctx = null;
  initPromise = null;
  status = { ready: false, loaded: 0, total: ASSETS.length, failed: [], active: false };
  currentParams = null;
  uiPaused = false;
  windowFocused = true;
  pageHidden = false;
}
