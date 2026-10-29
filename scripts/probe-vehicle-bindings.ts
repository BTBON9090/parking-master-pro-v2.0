import fs from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {GARAGE_CARS,CAR_MODELS} from '../constants';
import {MODEL_REGISTRY,CAR_TYPE_TO_MODEL,normalizeModel} from '../three/modelLoader';
import {buildNativeAuthoredVehicle} from '../three/blenderVehicle';
import {validateVehicleBindings} from '../three/vehicleModels';
for(const id of GARAGE_CARS){
 const def=MODEL_REGISTRY[CAR_TYPE_TO_MODEL[id]],b=fs.readFileSync('public/models/'+def.file);
 const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 normalizeModel(gltf.scene,def);const parts=buildNativeAuthoredVehicle(gltf.scene,CAR_MODELS[id]);
 const report=validateVehicleBindings(parts);
 console.log(JSON.stringify({id,...report}));
}
