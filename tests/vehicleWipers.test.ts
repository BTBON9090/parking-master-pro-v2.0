import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {CAR_MODELS} from '../constants';
import {CarType} from '../types';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {createVehicleWipers} from '../three/vehicleWipers';
const ids=[CarType.SUV,CarType.SEDAN,CarType.US22,CarType.SEMI,CarType.DF41,CarType.CARGO_TRIKE,CarType.COACH,CarType.JEEP,CarType.MIDIBUS,CarType.MINING,CarType.CYBERTRUCK,CarType.MINI];
for(const id of ids){const def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],bytes=fs.readFileSync('public/models/'+def.file),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,CAR_MODELS[id]),w=createVehicleWipers(parts.group,CAR_MODELS[id]);assert(w,`${id} has front glass mounted wipers`);const rest=w.pivots[0].rotation.z;w.update(true,.5);assert.notEqual(w.pivots[0].rotation.z,rest,`${id} moves when enabled`);w.update(false,1);assert.equal(Math.abs(w.pivots[0].rotation.z),0,`${id} parks when disabled`);assert(w.plane.position.z>0,`${id} is at front of vehicle`);}
console.log(`Vehicle wipers PASS: ${ids.length} authored vehicles mount and animate on the front glass`);
