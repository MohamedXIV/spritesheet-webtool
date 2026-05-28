// src/lib/lightingPresets.ts

export type ShadingMode = 'unlit' | 'matcap' | 'toon' | 'standard';

export interface DirectionalLightSettings {
  enabled: boolean;
  color: string;
  intensity: number;
  /** Horizontal rotation in degrees (0 = front, 90 = right) */
  azimuth: number;
  /** Vertical angle in degrees (0 = horizon, 90 = top) */
  elevation: number;
}

export interface LightingSettings {
  ambient: { color: string; intensity: number };
  key:  DirectionalLightSettings;
  fill: DirectionalLightSettings;
  rim:  DirectionalLightSettings;
}

export interface LightingPreset {
  id: string;
  name: string;
  /** Which shading mode pairs well with this preset */
  suggestedMode: ShadingMode;
  settings: LightingSettings;
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  {
    id: 'studio',
    name: 'Studio',
    suggestedMode: 'standard',
    settings: {
      ambient: { color: '#ffffff', intensity: 0.35 },
      key:  { enabled: true,  color: '#fff5e8', intensity: 1.1,  azimuth: 45,  elevation: 60 },
      fill: { enabled: true,  color: '#d0e0ff', intensity: 0.35, azimuth: 200, elevation: 30 },
      rim:  { enabled: true,  color: '#ffffff', intensity: 0.6,  azimuth: 180, elevation: 20 },
    },
  },
  {
    id: 'anime',
    name: 'Anime',
    suggestedMode: 'toon',
    settings: {
      ambient: { color: '#d8ccff', intensity: 0.5 },
      key:  { enabled: true,  color: '#fff8f0', intensity: 1.4,  azimuth: 30,  elevation: 55 },
      fill: { enabled: true,  color: '#8090d0', intensity: 0.25, azimuth: 210, elevation: 10 },
      rim:  { enabled: false, color: '#ffffff', intensity: 0.3,  azimuth: 190, elevation: 15 },
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    suggestedMode: 'standard',
    settings: {
      ambient: { color: '#ff9060', intensity: 0.2 },
      key:  { enabled: true, color: '#ffb347', intensity: 1.2,  azimuth: 80,  elevation: 18 },
      fill: { enabled: true, color: '#6080c8', intensity: 0.4,  azimuth: 260, elevation: 20 },
      rim:  { enabled: true, color: '#ff6060', intensity: 0.5,  azimuth: 160, elevation: 10 },
    },
  },
  {
    id: 'night',
    name: 'Night',
    suggestedMode: 'standard',
    settings: {
      ambient: { color: '#101828', intensity: 0.15 },
      key:  { enabled: true,  color: '#8ab4f8', intensity: 0.7,  azimuth: 0,   elevation: 70 },
      fill: { enabled: false, color: '#c0d0ff', intensity: 0.1,  azimuth: 180, elevation: 20 },
      rim:  { enabled: true,  color: '#4060c8', intensity: 0.9,  azimuth: 170, elevation: 15 },
    },
  },
  {
    id: 'flat',
    name: 'Flat',
    suggestedMode: 'unlit',
    settings: {
      ambient: { color: '#ffffff', intensity: 1.0 },
      key:  { enabled: false, color: '#ffffff', intensity: 0, azimuth: 45,  elevation: 60 },
      fill: { enabled: false, color: '#ffffff', intensity: 0, azimuth: 200, elevation: 30 },
      rim:  { enabled: false, color: '#ffffff', intensity: 0, azimuth: 180, elevation: 20 },
    },
  },
  {
    id: 'handpainted',
    name: 'Hand-Painted',
    suggestedMode: 'matcap',
    settings: {
      ambient: { color: '#ffe8d0', intensity: 0.4 },
      key:  { enabled: true, color: '#fff0d8', intensity: 1.0,  azimuth: 25,  elevation: 50 },
      fill: { enabled: true, color: '#c0c8e8', intensity: 0.3,  azimuth: 200, elevation: 20 },
      rim:  { enabled: true, color: '#ffd0a0', intensity: 0.4,  azimuth: 175, elevation: 25 },
    },
  },
];

export const DEFAULT_LIGHTING_PRESET_ID = 'studio';

/** Convert azimuth (horizontal °) + elevation (vertical °) into a THREE-ready unit vector */
export function lightDirectionFromAngles(azimuth: number, elevation: number): [number, number, number] {
  const az = (azimuth   * Math.PI) / 180;
  const el = (elevation * Math.PI) / 180;
  return [
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  ];
}
