import {WeatherType, type UserSettings} from '../types';

/** Explicit weather controls supersede legacy randomized weather. */
export function resolveWeatherOptions(settings: Pick<UserSettings,'weatherEnabled'|'weatherRain'|'weatherSnow'|'weatherFog'>, legacy: WeatherType) {
 if (!settings.weatherEnabled) return {rain:false,snow:false,fog:false};
 const explicit = settings.weatherRain !== undefined || settings.weatherSnow !== undefined || settings.weatherFog !== undefined;
 return explicit
  ? {rain:!!settings.weatherRain,snow:!!settings.weatherSnow,fog:!!settings.weatherFog}
  : {rain:legacy===WeatherType.RAINY,snow:legacy===WeatherType.SNOWY,fog:legacy===WeatherType.FOGGY};
}
