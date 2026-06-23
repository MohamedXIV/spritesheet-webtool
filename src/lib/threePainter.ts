import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {
  ShadingMode,
  LightingSettings,
  LIGHTING_PRESETS,
  DEFAULT_LIGHTING_PRESET_ID,
  lightDirectionFromAngles,
} from './lightingPresets';
import { TextureSourceSlot } from '@/types';
import { packRects } from './atlasPacker';


const PSX_VERTEX_SHADER = `#version 300 es
in vec3 position;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float jitterAmount;
uniform vec2 resolution;
noperspective out vec2 vUv;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec4 clipPosition = projectionMatrix * mvPosition;
  if (jitterAmount > 0.0) {
    vec4 ndc = clipPosition / clipPosition.w;
    ndc.xy = floor(ndc.xy * resolution * 0.5) / (resolution * 0.5);
    clipPosition = ndc * clipPosition.w;
  }
  vUv = uv;
  gl_Position = clipPosition;
}
`;

const PSX_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D map;
noperspective in vec2 vUv;
out vec4 fragColor;
void main() { fragColor = texture(map, vUv); }
`;

export type MapSlot = 'ao' | 'normal' | 'emissive' | 'roughness' | 'metalness' | 'displacement' | 'alpha';
export type MapIntensitySlot = 'ao' | 'emissive' | 'normalScale' | 'metalness' | 'displacementScale';

export interface ThreePainterConfig {
  canvasElement: HTMLCanvasElement;
  textureCanvas: HTMLCanvasElement;
  onPaintStroke: (u: number, v: number, isStart: boolean, isEnd: boolean) => void;
  onColorPicked?: (hex: string) => void;
  onLoadProgress?: (percentage: number) => void;
}

export type { ShadingMode, LightingSettings };

export class ThreePainter {
  private canvas: HTMLCanvasElement;
  private textureCanvas: HTMLCanvasElement;
  private onPaintStroke: (u: number, v: number, isStart: boolean, isEnd: boolean) => void;
  private onColorPicked?: (hex: string) => void;
  private onLoadProgress?: (percentage: number) => void;

  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public controls!: OrbitControls;
  private raycaster!: THREE.Raycaster;
  private mouseVec = new THREE.Vector2();

  private loadedModelGroup: THREE.Group | null = null;
  private paintableMeshes: THREE.Mesh[] = [];
  private uvIslands: Array<Array<{ a: THREE.Vector2; b: THREE.Vector2; c: THREE.Vector2 }>> = [];
  private loadedOriginalTextureImage: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null = null;

  private canvasTexture!: THREE.CanvasTexture;
  private standardMaterial!: THREE.MeshBasicMaterial;
  private psxMaterial!: THREE.RawShaderMaterial;
  private matcapMaterial!: THREE.MeshMatcapMaterial;
  private toonMaterial!: THREE.MeshToonMaterial;
  private pbrMaterial!: THREE.MeshStandardMaterial;
  private proceduralMatcapTex!: THREE.CanvasTexture;
  private toonGradientMap!: THREE.DataTexture;

  private ambientLight!: THREE.AmbientLight;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;

  private isPSXShaderEnabled = false;
  private shadingMode: ShadingMode = 'unlit';
  private currentLightingSettings: LightingSettings;
  private isPaintMode = true;
  private isDrawing = false;
  private handleKeyDown?: (e: KeyboardEvent) => void;

  constructor(config: ThreePainterConfig) {
    this.canvas = config.canvasElement;
    this.textureCanvas = config.textureCanvas;
    this.onPaintStroke = config.onPaintStroke;
    this.onColorPicked = config.onColorPicked;
    this.onLoadProgress = config.onLoadProgress;
    const defaultPreset = LIGHTING_PRESETS.find(p => p.id === DEFAULT_LIGHTING_PRESET_ID)!;
    this.currentLightingSettings = defaultPreset.settings;
    this.initThree();
    this.initTextures();
    this.initMaterials();
    this.initLights();
    this.setupEvents();
    this.animate();
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#121214');
    const rect = this.canvas.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.01, 10000);
    this.camera.position.set(0, 0, 4);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.mouseButtons = { LEFT: null as any, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
    this.raycaster = new THREE.Raycaster();
  }

  private initTextures() {
    this.canvasTexture = new THREE.CanvasTexture(this.textureCanvas);
    this.canvasTexture.minFilter = THREE.NearestFilter;
    this.canvasTexture.magFilter = THREE.NearestFilter;
    this.canvasTexture.wrapS = THREE.RepeatWrapping;
    this.canvasTexture.wrapT = THREE.RepeatWrapping;
    this.proceduralMatcapTex = this.buildProceduralMatcap(128);
    this.toonGradientMap = this.buildToonGradient(3);
  }

  private initMaterials() {
    this.standardMaterial = new THREE.MeshBasicMaterial({ map: this.canvasTexture, side: THREE.DoubleSide });
    this.psxMaterial = new THREE.RawShaderMaterial({
      vertexShader: PSX_VERTEX_SHADER, fragmentShader: PSX_FRAGMENT_SHADER, glslVersion: THREE.GLSL3,
      uniforms: { map: { value: this.canvasTexture }, jitterAmount: { value: 1.0 }, resolution: { value: new THREE.Vector2(320, 240) } },
      side: THREE.DoubleSide,
    });
    this.matcapMaterial = new THREE.MeshMatcapMaterial({ map: this.canvasTexture, matcap: this.proceduralMatcapTex, side: THREE.DoubleSide });
    this.toonMaterial = new THREE.MeshToonMaterial({ map: this.canvasTexture, gradientMap: this.toonGradientMap, side: THREE.DoubleSide });
    this.pbrMaterial = new THREE.MeshStandardMaterial({ map: this.canvasTexture, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  }

  private initLights() {
    const s = this.currentLightingSettings;
    this.ambientLight = new THREE.AmbientLight(s.ambient.color, s.ambient.intensity);
    this.scene.add(this.ambientLight);
    this.keyLight  = this.makeDirectionalLight(s.key);
    this.fillLight = this.makeDirectionalLight(s.fill);
    this.rimLight  = this.makeDirectionalLight(s.rim);
    this.scene.add(this.keyLight, this.fillLight, this.rimLight);
    this.syncLightVisibility();
  }

  private makeDirectionalLight(cfg: { color: string; intensity: number; azimuth: number; elevation: number; enabled: boolean }): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(cfg.color, cfg.intensity);
    const [x, y, z] = lightDirectionFromAngles(cfg.azimuth, cfg.elevation);
    light.position.set(x * 5, y * 5, z * 5);
    light.visible = cfg.enabled;
    return light;
  }

  private syncLightVisibility() {
    const lit = (this.shadingMode === 'toon' || this.shadingMode === 'standard') && !this.isPSXShaderEnabled;
    const s = this.currentLightingSettings;
    this.ambientLight.visible = lit;
    this.keyLight.visible  = lit && s.key.enabled;
    this.fillLight.visible = lit && s.fill.enabled;
    this.rimLight.visible  = lit && s.rim.enabled;
  }

  // ── Procedural textures ──────────────────────────────────────────────────────

  private buildProceduralMatcap(size: number): THREE.CanvasTexture {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d')!;
    const cx = size / 2;
    ctx.beginPath(); ctx.arc(cx, cx, cx, 0, Math.PI * 2); ctx.clip();
    const base = ctx.createRadialGradient(cx * 0.7, cx * 0.5, 0, cx, cx, cx);
    base.addColorStop(0.0, '#e8d8f8'); base.addColorStop(0.35, '#b09cc8');
    base.addColorStop(0.65, '#5c4880'); base.addColorStop(1.0, '#140c28');
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    const rim = ctx.createRadialGradient(cx, size * 0.9, 0, cx, size * 0.85, size * 0.38);
    rim.addColorStop(0.0, 'rgba(120,140,220,0.55)'); rim.addColorStop(1.0, 'rgba(120,140,220,0.0)');
    ctx.fillStyle = rim; ctx.fillRect(0, 0, size, size);
    const spec = ctx.createRadialGradient(cx * 0.6, cx * 0.52, 0, cx * 0.6, cx * 0.52, cx * 0.22);
    spec.addColorStop(0.0, 'rgba(255,250,245,1.0)'); spec.addColorStop(0.4, 'rgba(255,248,240,0.7)'); spec.addColorStop(1.0, 'rgba(255,240,220,0.0)');
    ctx.fillStyle = spec; ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cv);
  }

  private buildToonGradient(steps: number): THREE.DataTexture {
    const W = 256;
    const palette: [number, number, number][] = steps <= 2
      ? [[20,15,40],[255,248,255]]
      : steps === 3 ? [[20,15,40],[100,85,150],[255,248,255]]
      : steps === 4 ? [[20,15,40],[80,65,120],[180,160,220],[255,248,255]]
      : [[15,10,30],[60,50,100],[120,105,170],[200,185,240],[255,250,255]];
    const data = new Uint8Array(W * 4);
    for (let i = 0; i < W; i++) {
      const t = i / (W - 1), raw = t * (palette.length - 1), lo = Math.floor(raw);
      const idx = raw - lo < 0.5 ? lo : Math.min(lo + 1, palette.length - 1);
      const [r, g, b] = palette[idx];
      data[i*4]=r; data[i*4+1]=g; data[i*4+2]=b; data[i*4+3]=255;
    }
    const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }

  // ── Public API: shading ──────────────────────────────────────────────────────

  private getActiveMaterial(): THREE.Material {
    if (this.isPSXShaderEnabled) return this.psxMaterial;
    switch (this.shadingMode) {
      case 'matcap':   return this.matcapMaterial;
      case 'toon':     return this.toonMaterial;
      case 'standard': return this.pbrMaterial;
      default:         return this.standardMaterial;
    }
  }

  public setShadingMode(mode: ShadingMode) {
    this.shadingMode = mode;
    const mat = this.getActiveMaterial();
    this.paintableMeshes.forEach(m => { m.material = mat; m.material.needsUpdate = true; });
    this.syncLightVisibility();
  }

  public getShadingMode(): ShadingMode { return this.shadingMode; }

  public getPaintableMeshes(): THREE.Mesh[] { return this.paintableMeshes; }

  public setMatcapTexture(tex: THREE.Texture | null) {
    this.matcapMaterial.matcap = tex ?? this.proceduralMatcapTex;
    this.matcapMaterial.needsUpdate = true;
  }

  public setToonSteps(steps: number) {
    this.toonGradientMap.dispose();
    this.toonGradientMap = this.buildToonGradient(Math.max(2, Math.min(5, steps)));
    this.toonMaterial.gradientMap = this.toonGradientMap;
    this.toonMaterial.needsUpdate = true;
  }

  // ── Public API: lighting ─────────────────────────────────────────────────────

  public applyLightingPreset(presetId: string) {
    const preset = LIGHTING_PRESETS.find(p => p.id === presetId);
    if (preset) this.setLightingSettings(preset.settings);
  }

  public setLightingSettings(settings: LightingSettings) {
    this.currentLightingSettings = settings;
    this.ambientLight.color.set(settings.ambient.color);
    this.ambientLight.intensity = settings.ambient.intensity;
    const applyDir = (light: THREE.DirectionalLight, cfg: typeof settings.key) => {
      light.color.set(cfg.color); light.intensity = cfg.intensity;
      const [x, y, z] = lightDirectionFromAngles(cfg.azimuth, cfg.elevation);
      light.position.set(x * 5, y * 5, z * 5);
    };
    applyDir(this.keyLight, settings.key);
    applyDir(this.fillLight, settings.fill);
    applyDir(this.rimLight, settings.rim);
    this.syncLightVisibility();
  }

  public getLightingSettings(): LightingSettings { return this.currentLightingSettings; }

  // ── Public API: texture maps ─────────────────────────────────────────────────

  /** Set or clear a PBR texture map slot. Pass null to remove the map. */
  public setMap(slot: MapSlot, tex: THREE.Texture | null) {
    switch (slot) {
      case 'ao':
        if (this.pbrMaterial.aoMap) this.pbrMaterial.aoMap.dispose();
        this.pbrMaterial.aoMap        = tex;
        break;
      case 'normal':
        if (this.pbrMaterial.normalMap) this.pbrMaterial.normalMap.dispose();
        this.pbrMaterial.normalMap    = tex;
        break;
      case 'roughness':
        if (this.pbrMaterial.roughnessMap) this.pbrMaterial.roughnessMap.dispose();
        this.pbrMaterial.roughnessMap = tex;
        break;
      case 'metalness':
        if (this.pbrMaterial.metalnessMap) this.pbrMaterial.metalnessMap.dispose();
        this.pbrMaterial.metalnessMap = tex;
        break;
      case 'displacement':
        if (this.pbrMaterial.displacementMap) this.pbrMaterial.displacementMap.dispose();
        this.pbrMaterial.displacementMap = tex;
        break;
      case 'alpha':
        if (this.pbrMaterial.alphaMap) this.pbrMaterial.alphaMap.dispose();
        this.pbrMaterial.alphaMap = tex;
        this.pbrMaterial.transparent = tex !== null;
        break;
      case 'emissive':
        if (this.pbrMaterial.emissiveMap) this.pbrMaterial.emissiveMap.dispose();
        this.pbrMaterial.emissiveMap = tex;
        // Keep emissive tint in sync — black would suppress the map entirely
        this.pbrMaterial.emissive.set(tex ? '#ffffff' : '#000000');
        break;
    }
    this.pbrMaterial.needsUpdate = true;
  }

  /**
   * Adjust a map's scalar parameter.
   * 'ao'                → aoMapIntensity      (0–1)
   * 'emissive'          → emissiveIntensity   (0–3)
   * 'normalScale'       → normalScale X+Y     (0–3)
   * 'metalness'         → metalness intensity (0–1)
   * 'displacementScale' → displacementScale   (0–1)
   */
  public setMapIntensity(slot: MapIntensitySlot, value: number) {
    switch (slot) {
      case 'ao':                this.pbrMaterial.aoMapIntensity     = value; break;
      case 'emissive':          this.pbrMaterial.emissiveIntensity   = value; break;
      case 'normalScale':       this.pbrMaterial.normalScale.set(value, value); break;
      case 'metalness':         this.pbrMaterial.metalness           = value; break;
      case 'displacementScale': this.pbrMaterial.displacementScale   = value; break;
    }
  }

  /** Set the emissive tint colour on the PBR material (hex string, e.g. '#ff8800'). */
  public setEmissiveColor(hex: string) {
    this.pbrMaterial.emissive.set(hex);
  }

  // ── Public API: legacy PSX ───────────────────────────────────────────────────

  public setPSXShader(enabled: boolean) {
    this.isPSXShaderEnabled = enabled;
    const mat = this.getActiveMaterial();
    this.paintableMeshes.forEach(m => { m.material = mat; m.material.needsUpdate = true; });
    this.syncLightVisibility();
  }

  // ── Render loop ──────────────────────────────────────────────────────────────

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    if (this.isPSXShaderEnabled) {
      const rect = this.canvas.getBoundingClientRect();
      this.psxMaterial.uniforms.resolution.value.set(rect.width * 0.5, rect.height * 0.5);
    }
    this.renderer.render(this.scene, this.camera);
  };

  public updateTexture() { if (this.canvasTexture) this.canvasTexture.needsUpdate = true; }

  // ── Model loading ────────────────────────────────────────────────────────────

  public async loadModel(fileData: ArrayBuffer | Blob, fileName: string): Promise<void> {
    this.onLoadProgress?.(10);
    this.clearLoadedModel();
    const extension = fileName.split('.').pop()?.toLowerCase();
    const url = URL.createObjectURL(new Blob([fileData]));
    try {
      let loadedObject: THREE.Object3D | THREE.Group;
      if (extension === 'gltf' || extension === 'glb') {
        const loader = new GLTFLoader();
        this.onLoadProgress?.(30);
        const gltf = await loader.loadAsync(url, (xhr) => {
          if (xhr.total > 0) this.onLoadProgress?.(30 + (xhr.loaded / xhr.total) * 40);
        });
        loadedObject = gltf.scene;
      } else if (extension === 'obj') {
        const loader = new OBJLoader();
        this.onLoadProgress?.(50);
        loadedObject = await loader.loadAsync(url);
      } else if (extension === 'fbx') {
        const loader = new FBXLoader();
        this.onLoadProgress?.(50);
        loadedObject = await loader.loadAsync(url);
      } else {
        throw new Error(`Unsupported 3D file extension: .${extension}`);
      }
      this.onLoadProgress?.(80);
      this.setupMeshGroup(loadedObject);
      this.onLoadProgress?.(100);
    } catch (err) {
      this.onLoadProgress?.(-1);
      throw err;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  public getLoadedOriginalTextureImage(): HTMLImageElement | HTMLCanvasElement | ImageBitmap | null {
    return this.loadedOriginalTextureImage;
  }

  private setupMeshGroup(object: THREE.Object3D) {
    this.loadedModelGroup = new THREE.Group();
    this.loadedModelGroup.add(object);
    this.scene.add(this.loadedModelGroup);
    this.paintableMeshes = [];
    this.loadedOriginalTextureImage = null;
    let originalTexture: THREE.Texture | null = null;

    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          child.userData.originalMaterials = mats;
          mats.forEach(mat => {
            mat.side = THREE.DoubleSide;
            if (mat.map && !originalTexture) originalTexture = mat.map;
          });
        }
        const hasUVs = child.geometry.attributes.uv !== undefined;
        if (hasUVs) {
          // Backup original UVs before any modifications
          if (!child.userData.originalUvs) {
            child.userData.originalUvs = child.geometry.attributes.uv.clone();
          }
          // Copy UV0 → UV2 so aoMap works without a separately baked UV channel
          if (!child.geometry.attributes.uv2) {
            child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
          }
          child.material = this.getActiveMaterial();
          this.paintableMeshes.push(child);
        } else {
          child.material = new THREE.MeshBasicMaterial({ color: 0x71717a, side: THREE.DoubleSide });
        }
      }
    });

    if (originalTexture && (originalTexture as THREE.Texture).image) {
      this.loadedOriginalTextureImage = (originalTexture as THREE.Texture).image as any;
    }

    object.position.set(0, 0, 0); object.scale.set(1, 1, 1);
    const box    = new THREE.Box3().setFromObject(object);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale  = 3.0 / maxDim;
    object.scale.set(scale, scale, scale);
    object.position.multiplyScalar(scale);
    this.calculateUVIslands();
    this.frameModel();
    this.updateTexture();
  }

  public clearLoadedModel() {
    this.uvIslands = [];
    if (this.loadedModelGroup) {
      this.scene.remove(this.loadedModelGroup);
      this.loadedModelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(m => m.dispose());
        }
      });
      this.loadedModelGroup = null;
    }
    this.paintableMeshes = [];
  }

  // ── Camera ───────────────────────────────────────────────────────────────────

  public setPaintMode(paint: boolean) {
    this.isPaintMode = paint;
    this.controls.mouseButtons.LEFT = paint ? (null as any) : THREE.MOUSE.ROTATE;
  }

  public frameModel() {
    if (!this.loadedModelGroup) return;
    const fov = this.camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(3.0 / 2 / Math.tan(fov / 2)) * 1.45;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    if (direction.lengthSq() < 0.001) direction.set(0, 0, -1);
    const target = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(target.clone().sub(direction.normalize().multiplyScalar(cameraZ)));
    this.camera.lookAt(target);
    this.controls.target.copy(target);
    this.controls.update();
  }

  public handleResize = () => {
    const rect = this.canvas.parentElement?.getBoundingClientRect() ?? this.canvas.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
  };

  // ── Events ───────────────────────────────────────────────────────────────────

  private setupEvents() {
    const getMousePos = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      return this.mouseVec.set(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      );
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !this.isPaintMode || !this.paintableMeshes.length) return;
      this.raycaster.setFromCamera(getMousePos(e), this.camera);
      const hit = this.raycaster.intersectObjects(this.paintableMeshes)[0];
      if (hit?.uv) {
        this.isDrawing = true;
        if (e.shiftKey && this.onColorPicked) this.eyedropperPick(hit.uv);
        else this.onPaintStroke(hit.uv.x, hit.uv.y, true, false);
      }
    };
    const onMove = (e: MouseEvent) => {
      if (!this.isDrawing || !this.isPaintMode || !this.paintableMeshes.length) return;
      this.raycaster.setFromCamera(getMousePos(e), this.camera);
      const hit = this.raycaster.intersectObjects(this.paintableMeshes)[0];
      if (hit?.uv) {
        if (e.shiftKey && this.onColorPicked) this.eyedropperPick(hit.uv);
        else this.onPaintStroke(hit.uv.x, hit.uv.y, false, false);
      }
    };
    const onUp = () => {
      if (this.isDrawing) { this.isDrawing = false; this.onPaintStroke(0, 0, false, true); }
    };
    this.canvas.addEventListener('mousedown', onDown);
    this.canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    this.handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
      if (e.key.toLowerCase() === 'f' || e.key === '.') { e.preventDefault(); this.frameModel(); }
    };
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleResize);
  }

  private eyedropperPick(uv: THREE.Vector2) {
    if (!this.onColorPicked) return;
    const ctx = this.textureCanvas.getContext('2d');
    if (!ctx) return;
    const tx = Math.floor(uv.x * this.textureCanvas.width);
    const ty = Math.floor((1 - uv.y) * this.textureCanvas.height);
    try {
      const px = ctx.getImageData(tx, ty, 1, 1).data;
      if (px[3] > 0)
        this.onColorPicked('#' + ((1 << 24) + (px[0] << 16) + (px[1] << 8) + px[2]).toString(16).slice(1));
    } catch (e) { console.warn('Eyedropper failed:', e); }
  }

  private calculateUVIslands() {
    this.uvIslands = [];
    if (!this.paintableMeshes.length) return;

    const allTriangles: Array<{
      a: THREE.Vector2;
      b: THREE.Vector2;
      c: THREE.Vector2;
      index: number;
    }> = [];

    let triangleCounter = 0;
    const edgeMap = new Map<string, number[]>();

    this.paintableMeshes.forEach(mesh => {
      const uvAttr = mesh.geometry.attributes.uv;
      const indexAttr = mesh.geometry.index;
      if (!uvAttr) return;

      const numTriangles = indexAttr ? indexAttr.count / 3 : uvAttr.count / 3;

      const getVertexKey = (idx: number) => {
        const u = uvAttr.getX(idx);
        const v = uvAttr.getY(idx);
        // Round to 3 decimal places to tolerate minor float inaccuracies at seams
        const ru = Math.round(u * 1000) / 1000;
        const rv = Math.round(v * 1000) / 1000;
        return `${ru},${rv}`;
      };

      const getEdgeKey = (k0: string, k1: string) => {
        return k0 < k1 ? `${k0}_${k1}` : `${k1}_${k0}`;
      };

      for (let i = 0; i < numTriangles; i++) {
        let idx0, idx1, idx2;
        if (indexAttr) {
          idx0 = indexAttr.getX(i * 3);
          idx1 = indexAttr.getX(i * 3 + 1);
          idx2 = indexAttr.getX(i * 3 + 2);
        } else {
          idx0 = i * 3;
          idx1 = i * 3 + 1;
          idx2 = i * 3 + 2;
        }

        const uv0 = new THREE.Vector2(uvAttr.getX(idx0), uvAttr.getY(idx0));
        const uv1 = new THREE.Vector2(uvAttr.getX(idx1), uvAttr.getY(idx1));
        const uv2 = new THREE.Vector2(uvAttr.getX(idx2), uvAttr.getY(idx2));

        const globalTriangleIndex = triangleCounter++;
        allTriangles.push({ a: uv0, b: uv1, c: uv2, index: globalTriangleIndex });

        const k0 = getVertexKey(idx0);
        const k1 = getVertexKey(idx1);
        const k2 = getVertexKey(idx2);

        const edges = [
          getEdgeKey(k0, k1),
          getEdgeKey(k1, k2),
          getEdgeKey(k2, k0)
        ];

        edges.forEach(edge => {
          if (!edgeMap.has(edge)) edgeMap.set(edge, []);
          edgeMap.get(edge)!.push(globalTriangleIndex);
        });
      }
    });

    const dsu = new DSU(triangleCounter);
    edgeMap.forEach(triangleIndices => {
      if (triangleIndices.length > 1) {
        for (let j = 1; j < triangleIndices.length; j++) {
          dsu.union(triangleIndices[0], triangleIndices[j]);
        }
      }
    });

    const islandMap = new Map<number, Array<{ a: THREE.Vector2; b: THREE.Vector2; c: THREE.Vector2 }>>();
    allTriangles.forEach(tri => {
      const root = dsu.find(tri.index);
      if (!islandMap.has(root)) islandMap.set(root, []);
      islandMap.get(root)!.push({ a: tri.a, b: tri.b, c: tri.c });
    });

    this.uvIslands = Array.from(islandMap.values());
  }

  public getUVIslandTrianglesAt(u: number, v: number): Array<{ a: THREE.Vector2; b: THREE.Vector2; c: THREE.Vector2 }> | null {
    for (const island of this.uvIslands) {
      for (const tri of island) {
        if (pointInTriangle(u, v, tri.a.x, tri.a.y, tri.b.x, tri.b.y, tri.c.x, tri.c.y)) {
          return island;
        }
      }
    }
    return null;
  }

  // ── Disposal ─────────────────────────────────────────────────────────────────

  public dispose() {
    window.removeEventListener('resize', this.handleResize);
    if (this.handleKeyDown) window.removeEventListener('keydown', this.handleKeyDown);
    this.clearLoadedModel();
    this.canvasTexture.dispose();
    this.proceduralMatcapTex.dispose();
    this.toonGradientMap.dispose();
    this.standardMaterial.dispose();
    this.psxMaterial.dispose();
    this.matcapMaterial.dispose();
    this.toonMaterial.dispose();
    this.pbrMaterial.dispose();
    this.renderer.dispose();
  }

  // ── Texture Merger & Atlas Packing ──────────────────────────────────────────

  private getOriginalImageForSlot(slot: TextureSourceSlot): HTMLImageElement | HTMLCanvasElement | null {
    if (slot.type === 'udim') {
      if (slot.detectedUdimTile === 1001) {
        return this.loadedOriginalTextureImage as any;
      }
      return null;
    }
    // Material slot: find in paintableMeshes
    for (const mesh of this.paintableMeshes) {
      const mats = mesh.userData.originalMaterials || [];
      for (const mat of mats) {
        if (mat.name === slot.name && mat.map && mat.map.image) {
          return mat.map.image;
        }
      }
    }
    return null;
  }

  private getMaterialNameForVertex(mesh: THREE.Mesh, vertexIndex: number): string {
    const originalMats = mesh.userData.originalMaterials;
    if (!originalMats || originalMats.length === 0) {
      return 'Default';
    }
    if (originalMats.length === 1) {
      return originalMats[0].name || 'Default';
    }
    const groups = mesh.geometry.groups;
    if (!groups || groups.length === 0) {
      return originalMats[0].name || 'Default';
    }
    
    const indexAttr = mesh.geometry.index;
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i++) {
        if (indexAttr.getX(i) === vertexIndex) {
          for (const group of groups) {
            if (i >= group.start && i < group.start + group.count) {
              const mat = originalMats[group.materialIndex || 0];
              return mat?.name || 'Default';
            }
          }
        }
      }
    } else {
      for (const group of groups) {
        if (vertexIndex >= group.start && vertexIndex < group.start + group.count) {
          const mat = originalMats[group.materialIndex || 0];
          return mat?.name || 'Default';
        }
      }
    }
    return originalMats[0].name || 'Default';
  }

  public analyzeModel(): TextureSourceSlot[] {
    const slots: TextureSourceSlot[] = [];
    if (!this.paintableMeshes.length) return slots;

    // 1. Detect if we have any UDIM coordinates
    let isUdim = false;
    this.paintableMeshes.forEach(mesh => {
      const uvs = mesh.userData.originalUvs || mesh.geometry.attributes.uv;
      if (!uvs) return;
      for (let i = 0; i < uvs.count; i++) {
        const u = uvs.getX(i);
        const v = uvs.getY(i);
        if (Math.abs(Math.floor(u)) > 0 || Math.abs(Math.floor(v)) > 0) {
          isUdim = true;
          break;
        }
      }
    });

    const meshMap = new Map<string, string[]>(); // slotId -> meshNames[]

    if (isUdim) {
      // Collect UDIM tiles
      const udimTiles = new Set<number>();
      this.paintableMeshes.forEach(mesh => {
        const uvs = mesh.userData.originalUvs || mesh.geometry.attributes.uv;
        if (!uvs) return;
        for (let i = 0; i < uvs.count; i++) {
          const u = uvs.getX(i);
          const v = uvs.getY(i);
          const tileU = Math.floor(u);
          const tileV = Math.floor(v);
          if (tileU >= 0 && tileU < 10 && tileV >= 0 && tileV < 10) {
            const tileId = 1001 + tileU + 10 * tileV;
            udimTiles.add(tileId);
            
            const slotId = `udim-${tileId}`;
            if (!meshMap.has(slotId)) meshMap.set(slotId, []);
            const names = meshMap.get(slotId)!;
            if (!names.includes(mesh.name || 'Unnamed Mesh')) {
              names.push(mesh.name || 'Unnamed Mesh');
            }
          }
        }
      });

      // Expose UDIM slots
      Array.from(udimTiles).sort().forEach((tileId, idx) => {
        const slotId = `udim-${tileId}`;
        const pastelColors = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6'];
        const color = pastelColors[idx % pastelColors.length];

        let originalTextureUrl: string | null = null;
        let originalTextureImage: any = null;

        // If it's the first tile (1001) and we have a loaded original image, show it
        if (tileId === 1001 && this.loadedOriginalTextureImage) {
          originalTextureImage = this.loadedOriginalTextureImage;
          originalTextureUrl = getTextureThumbnail(originalTextureImage);
        }

        slots.push({
          id: slotId,
          type: 'udim',
          name: `Tile ${tileId}`,
          originalTextureUrl,
          originalColor: color,
          userTextureUrl: null,
          userTextureFile: null,
          weight: 1.0,
          included: true,
          detectedUdimTile: tileId,
          meshNames: meshMap.get(slotId) || [],
        });
      });

    } else {
      // Material-based grouping
      const materialRegistry = new Map<string, {
        mat: THREE.Material;
        meshes: string[];
      }>();

      this.paintableMeshes.forEach(mesh => {
        const mats = mesh.userData.originalMaterials || (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
        if (!mats) return;

        mats.forEach((mat: THREE.Material) => {
          const matName = mat.name || 'Default';
          if (!materialRegistry.has(matName)) {
            materialRegistry.set(matName, { mat, meshes: [] });
          }
          const reg = materialRegistry.get(matName)!;
          if (!reg.meshes.includes(mesh.name || 'Unnamed Mesh')) {
            reg.meshes.push(mesh.name || 'Unnamed Mesh');
          }
        });
      });

      materialRegistry.forEach((reg, matName) => {
        const mat = reg.mat;
        let hexColor = '#e4e4e7';
        if ((mat as any).color) {
          hexColor = '#' + (mat as any).color.getHexString();
        }

        let originalTextureUrl: string | null = null;
        let originalTextureImage: any = null;

        if ((mat as any).map && (mat as any).map.image) {
          originalTextureImage = (mat as any).map.image;
          originalTextureUrl = getTextureThumbnail(originalTextureImage);
        }

        slots.push({
          id: `material-${matName}`,
          type: 'material',
          name: matName,
          originalTextureUrl,
          originalColor: hexColor,
          userTextureUrl: null,
          userTextureFile: null,
          weight: 1.0,
          included: true,
          meshNames: reg.meshes,
        });

        // Cache original texture image reference on the mesh userData for packing
        this.paintableMeshes.forEach(mesh => {
          const mats = mesh.userData.originalMaterials || [];
          mats.forEach((m: THREE.Material) => {
            if (m.name === matName && (m as any).map) {
              mesh.userData[`originalTexture_${matName}`] = (m as any).map.image;
            }
          });
        });
      });
    }

    return slots;
  }

  public async repackAndAtlas(slots: TextureSourceSlot[], targetSize: number): Promise<HTMLCanvasElement> {
    const activeSlots = slots.filter(s => s.included);
    if (activeSlots.length === 0) {
      throw new Error('Please select at least one texture slot to include in the merge.');
    }

    const packingItems = await Promise.all(activeSlots.map(async slot => {
      let width = 512;
      let height = 512;

      const originalImg = this.getOriginalImageForSlot(slot);
      if (originalImg) {
        width = originalImg.width || 512;
        height = originalImg.height || 512;
      }

      width = Math.round(width * slot.weight);
      height = Math.round(height * slot.weight);

      return {
        id: slot.id,
        width,
        height
      };
    }));

    const { packedItems } = packRects(packingItems, targetSize);

    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = targetSize;
    atlasCanvas.height = targetSize;
    const ctx = atlasCanvas.getContext('2d')!;

    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, targetSize, targetSize);

    const loadedUserImages = new Map<string, HTMLImageElement>();
    await Promise.all(activeSlots.map(async slot => {
      if (slot.userTextureUrl) {
        try {
          const img = await loadImage(slot.userTextureUrl);
          loadedUserImages.set(slot.id, img);
        } catch (err) {
          console.warn(`Failed to load user texture for slot ${slot.name}:`, err);
        }
      }
    }));

    packedItems.forEach(item => {
      const slot = activeSlots.find(s => s.id === item.id)!;
      const userImg = loadedUserImages.get(slot.id);
      const originalImg = this.getOriginalImageForSlot(slot);

      if (userImg) {
        ctx.drawImage(userImg, item.x, item.y, item.width, item.height);
      } else if (originalImg) {
        ctx.drawImage(originalImg, item.x, item.y, item.width, item.height);
      } else {
        ctx.fillStyle = slot.originalColor || '#52525b';
        ctx.fillRect(item.x, item.y, item.width, item.height);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(10, Math.floor(item.height * 0.06))}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(slot.name, item.x + item.width / 2, item.y + item.height / 2);
      }
    });

    const isUdim = activeSlots[0]?.type === 'udim';

    this.paintableMeshes.forEach(mesh => {
      const originalUvs = mesh.userData.originalUvs;
      if (!originalUvs) return;

      const count = originalUvs.count;
      const newUvs = new Float32Array(count * 2);

      for (let i = 0; i < count; i++) {
        const u = originalUvs.getX(i);
        const v = originalUvs.getY(i);

        let slotId = '';
        if (isUdim) {
          const tileU = Math.floor(u);
          const tileV = Math.floor(v);
          const tileId = 1001 + tileU + 10 * tileV;
          slotId = `udim-${tileId}`;
        } else {
          const matName = this.getMaterialNameForVertex(mesh, i);
          slotId = `material-${matName}`;
        }

        const item = packedItems.find(p => p.id === slotId);

        if (item) {
          const u_local = isUdim ? (u - Math.floor(u)) : u;
          const v_local = isUdim ? (v - Math.floor(v)) : v;

          const u_clamped = Math.max(0.0, Math.min(1.0, u_local));
          const v_clamped = Math.max(0.0, Math.min(1.0, v_local));

          const u_new = (item.x + u_clamped * item.width) / targetSize;
          const v_new = 1.0 - ((item.y + (1.0 - v_clamped) * item.height) / targetSize);

          newUvs[i * 2] = u_new;
          newUvs[i * 2 + 1] = v_new;
        } else {
          newUvs[i * 2] = 0;
          newUvs[i * 2 + 1] = 0;
        }
      }

      mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
      mesh.geometry.attributes.uv.needsUpdate = true;

      mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
      if (mesh.geometry.attributes.uv2) {
        mesh.geometry.attributes.uv2.needsUpdate = true;
      }

      mesh.material = this.getActiveMaterial();
    });

    this.updateTexture();

    return atlasCanvas;
  }

  public bakeSmartMaps(width: number = 512, height: number = 512): {
    edges: HTMLCanvasElement;
    cavities: HTMLCanvasElement;
    height: HTMLCanvasElement;
  } | null {
    if (!this.loadedModelGroup || this.paintableMeshes.length === 0) return null;

    // Find bounding box for Y normalization
    const box = new THREE.Box3().setFromObject(this.loadedModelGroup);
    const minY = box.min.y;
    const maxY = box.max.y;

    const rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    const vertexShader = `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vHeightPct;
      uniform float minY;
      uniform float maxY;

      void main() {
        // Flat UV projection (transform [0,1] UV to [-1,1] NDC space)
        gl_Position = vec4(uv.x * 2.0 - 1.0, uv.y * 2.0 - 1.0, 0.0, 1.0);
        vPosition = position;
        vNormal = normalMatrix * normal;
        vHeightPct = clamp((position.y - minY) / (maxY - minY), 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying float vHeightPct;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 p = vPosition;

        // Compute derivatives to approximate curvature
        vec3 dxN = dFdx(n);
        vec3 dyN = dFdy(n);
        vec3 dxP = dFdx(p);
        vec3 dyP = dFdy(p);

        float lenP = length(dxP) + length(dyP);
        float curvature = 0.0;
        if (lenP > 0.0001) {
          float dotX = dot(dxP, dxN);
          float dotY = dot(dyP, dyN);
          curvature = (dotX + dotY) / lenP;
        }

        // Adjust scale factor for visual sensitivity
        float edgeScale = 6.0;
        float edgeVal = clamp(curvature * edgeScale, 0.0, 1.0);
        float cavityVal = clamp(-curvature * edgeScale, 0.0, 1.0);

        // Red = Edges, Green = Cavities, Blue = Height
        gl_FragColor = vec4(edgeVal, cavityVal, vHeightPct, 1.0);
      }
    `;

    const bakeMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        minY: { value: minY },
        maxY: { value: maxY },
      },
      side: THREE.DoubleSide,
    });

    const originalOverride = this.scene.overrideMaterial;
    const originalBg = this.scene.background;

    this.scene.overrideMaterial = bakeMaterial;
    this.scene.background = null;

    const originalCulling = new Map<THREE.Mesh, boolean>();
    const hiddenObjects: THREE.Object3D[] = [];

    // Setup meshes for baking
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        if (this.paintableMeshes.includes(obj)) {
          originalCulling.set(obj, obj.frustumCulled);
          obj.frustumCulled = false;
        } else if (obj.visible) {
          obj.visible = false;
          hiddenObjects.push(obj);
        }
      }
    });

    // Render to texture
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor('#000000', 0.0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    // Restore visibility and culling states
    hiddenObjects.forEach(obj => {
      obj.visible = true;
    });
    this.paintableMeshes.forEach(mesh => {
      const c = originalCulling.get(mesh);
      if (c !== undefined) mesh.frustumCulled = c;
    });

    this.scene.overrideMaterial = originalOverride;
    this.scene.background = originalBg;

    // Read pixels back
    const buffer = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, width, height, buffer);
    rt.dispose();

    // Create 2D canvases for CPU masking
    const edgesCanvas = document.createElement('canvas');
    edgesCanvas.width = width;
    edgesCanvas.height = height;
    const edgesCtx = edgesCanvas.getContext('2d')!;

    const cavitiesCanvas = document.createElement('canvas');
    cavitiesCanvas.width = width;
    cavitiesCanvas.height = height;
    const cavitiesCtx = cavitiesCanvas.getContext('2d')!;

    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = width;
    heightCanvas.height = height;
    const heightCtx = heightCanvas.getContext('2d')!;

    const edgesImgData = edgesCtx.createImageData(width, height);
    const cavitiesImgData = cavitiesCtx.createImageData(width, height);
    const heightImgData = heightCtx.createImageData(width, height);

    // Flip vertically to match Canvas coordinates
    for (let y = 0; y < height; y++) {
      const srcY = height - 1 - y;
      for (let x = 0; x < width; x++) {
        const srcIdx = (srcY * width + x) * 4;
        const dstIdx = (y * width + x) * 4;

        const r = buffer[srcIdx];
        const g = buffer[srcIdx + 1];
        const b = buffer[srcIdx + 2];
        const a = buffer[srcIdx + 3];

        edgesImgData.data[dstIdx]     = r;
        edgesImgData.data[dstIdx + 1] = r;
        edgesImgData.data[dstIdx + 2] = r;
        edgesImgData.data[dstIdx + 3] = a;

        cavitiesImgData.data[dstIdx]     = g;
        cavitiesImgData.data[dstIdx + 1] = g;
        cavitiesImgData.data[dstIdx + 2] = g;
        cavitiesImgData.data[dstIdx + 3] = a;

        heightImgData.data[dstIdx]     = b;
        heightImgData.data[dstIdx + 1] = b;
        heightImgData.data[dstIdx + 2] = b;
        heightImgData.data[dstIdx + 3] = a;
      }
    }

    edgesCtx.putImageData(edgesImgData, 0, 0);
    cavitiesCtx.putImageData(cavitiesImgData, 0, 0);
    heightCtx.putImageData(heightImgData, 0, 0);

    return { edges: edgesCanvas, cavities: cavitiesCanvas, height: heightCanvas };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTextureThumbnail(image: any): string | null {
  if (!image) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('Failed to generate texture thumbnail:', e);
    return null;
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

class DSU {
  parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] === x) return x;
    return this.parent[x] = this.find(this.parent[x]);
  }
  union(x: number, y: number) {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX !== rootY) {
      this.parent[rootX] = rootY;
    }
  }
}

function pointInTriangle(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): boolean {
  const v0x = cx - ax, v0y = cy - ay;
  const v1x = bx - ax, v1y = by - ay;
  const v2x = px - ax, v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= 0 && v >= 0 && u + v <= 1;
}
