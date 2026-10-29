import assert from 'node:assert/strict';
import {buildCollisionGrid,queryCollisionGrid} from '../utils/collisionSpatial';
import {getRectCorners} from '../utils/physics';
import type {Obstacle} from '../types';
for(const angle of [0,Math.PI/6,Math.PI/2,-Math.PI/4]) {
 const wall:Obstacle={id:'long-wall',type:'wall',x:5000,y:5000,width:30000,height:10,rotation:angle,movable:false,weight:0,color:'#888'};
 const grid=buildCollisionGrid([wall]);
 for(const p of getRectCorners(wall)) assert(queryCollisionGrid(grid,p.x,p.y,1).has(wall),`missed wall corner at ${angle}`);
 if(angle===0||angle===Math.PI/2) assert(grid.cells.size<1000,'thin boundary should not fill a huge square grid');
}
console.log('Collision grid: rotated long wall corners preserved, sparse axis-aligned boundaries.');
