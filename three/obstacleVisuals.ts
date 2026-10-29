import * as THREE from 'three';
import type {Obstacle} from '../types';

type Pose = Pick<Obstacle,'x'|'y'|'rotation'|'elevation'>;
const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),size=new THREE.Vector3();
const up=new THREE.Vector3(0,1,0),planeRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);

/** Author offsets in the collider's local frame, including height. Used only
 * while assembling scenery, so body, roof, windows and shadows stay aligned. */
export function composeSceneryPose(out:THREE.Matrix4,o:Pose,x:number,y:number,z:number,sx:number,sy:number,sz:number,floorPlane=false){
 const c=Math.cos(o.rotation),s=Math.sin(o.rotation);
 position.set(o.x+x*c-z*s,(o.elevation??0)+y,o.y+x*s+z*c);
 rotation.setFromAxisAngle(up,-o.rotation);
 if(floorPlane)rotation.multiply(planeRotation);
 return out.compose(position,rotation,size.set(sx,sy,sz));
}

/** Fit an unparented imported building to the authored obstacle. Imported
 * roots may carry nonzero centering offsets: assigning position=obstacle
 * would discard them and offset the visible building from its collider. */
export function fitBuildingToObstacle(building:THREE.Object3D,o:Obstacle,height:number){
 building.position.set(0,0,0);building.rotation.y=0;
 building.updateWorldMatrix(true,true);
 const bounds=new THREE.Box3().setFromObject(building),sourceSize=bounds.getSize(new THREE.Vector3());
 if(Math.min(sourceSize.x,sourceSize.y,sourceSize.z)<=0)throw new Error('Building asset has empty bounds');
 building.scale.multiply(new THREE.Vector3(o.width/sourceSize.x,height/sourceSize.y,o.height/sourceSize.z));
 building.updateWorldMatrix(true,true);
 bounds.setFromObject(building);const centre=bounds.getCenter(new THREE.Vector3());
 const offset=new THREE.Vector3(-centre.x,-bounds.min.y,-centre.z).applyAxisAngle(up,-o.rotation);
 building.rotation.y=-o.rotation;
 building.position.copy(offset).add(new THREE.Vector3(o.x,o.elevation??0,o.y));
 building.updateWorldMatrix(true,true);
}
