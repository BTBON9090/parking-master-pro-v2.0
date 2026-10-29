import {buildScene,type BuiltScene} from './sceneBuilder';
import type {CarConfig,CarType,LevelData} from '../types';
import {disposeResources} from './disposeResources';
let pending:{key:string;data:LevelData;promise:Promise<BuiltScene>;built?:BuiltScene}|null=null;
export function prepareScene(data:LevelData,config:CarConfig,type:CarType){
 const key=data.levelId+':'+type;if(pending?.key===key)return;
 clearPreparedScene();const promise=buildScene(data,config,type);pending={key,data,promise};promise.then(built=>{if(pending?.promise===promise)pending.built=built;}).catch(()=>{});promise.catch(()=>{if(pending?.promise===promise)pending=null;});
}
export function takePreparedScene(id:number,type:CarType){if(pending?.key!==id+':'+type)return null;const value=pending;pending=null;return value;}
export function clearPreparedScene(){const old=pending;pending=null;if(old)void old.promise.then(b=>disposeResources([b.scene,...(b.streamingChunks?.values()??[])])).catch(()=>{});}

export function peekPreparedScene(){return pending?.built??null;}
