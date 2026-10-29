import {CarType} from '../types';
/** Real source families, processed for gameplay. Not model-specific OEM recordings. */
export function recordingFamily(id?:CarType){
 if([CarType.TRACTOR,CarType.TRIKE,CarType.CARGO_TRIKE].includes(id!))return 'farm';
 if([CarType.COACH,CarType.MIDIBUS,CarType.MINING,CarType.TYPE100,CarType.SEMI,CarType.US22,CarType.DF41].includes(id!))return 'heavy';
 if([CarType.JEEP,CarType.TRUCK,CarType.LIGHT_TRUCK,CarType.VAN].includes(id!))return 'diesel';
 return 'engine';
}
export function recordingIdleFile(id:CarType){return recordingFamily(id)+'-idle-loop.wav';}
