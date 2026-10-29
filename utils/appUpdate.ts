import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import type {ReleaseInfo} from './releases';
export interface UpdateProgress {stage:'download'|'verify'|'ready';received:number;total:number}
export interface UpdateStatus {ready:boolean;busy:boolean;permission:boolean;version:string}
export const AppUpdate=registerPlugin<{
 status():Promise<UpdateStatus>;
 download(options:{url:string;version:string;sha256:string;size:number}):Promise<{ready:boolean}>;
 install():Promise<{permissionRequired?:boolean;installerOpened?:boolean}>;
 cancel():Promise<void>;
 addListener(name:'progress',callback:(v:UpdateProgress)=>void):Promise<PluginListenerHandle>;
}>('AppUpdate');
export const canInstallInApp=()=>Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('AppUpdate');
export function installableRelease(r:ReleaseInfo){return !!r.androidSha256&&!!r.androidSize&&!!r.androidUrl&&/^https:\/\/(cdn\.btbon\.cn|my-portfolio-1317980685\.cos\.ap-guangzhou\.myqcloud\.com)\//.test(r.androidUrl);}
