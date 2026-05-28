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

// ─── PSX Shader ───────────────────────────────────────────────────────────────

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

void main() {
  fragColor = texture(map, vUv);
}
`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThreePainterConfig {
  canvasElement: HTMLCanvasElement;
  textureCanvas: HTMLCanvasElement;
  onPaintStroke: (u: number, v: number, isStart: boolean, isEnd: boolean) => void;
  onColorPicked?: (hex: string) => void;
  onLoadProgress?: (percentage: number) => void;
}

export type { ShadingMode, LightingSettings };

// ─── ThreePainter ─────────────────────────────────────────────────────────────

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
  private loadedOriginalTextureImage: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null = null;

  private canvasTexture!: THREE.CanvasTexture;

  // Materials
  private standardMaterial!: THREE.MeshBasicMaterial;
  private psxMaterial!: THREE.RawShaderMaterial;
  private matcapMaterial!: THREE.MeshMatcapMaterial;
  private toonMaterial!: THREE.MeshToonMaterial;
  private pbrMaterial!: THREE.MeshStandardMaterial;
  private proceduralMatcapTex!: THREE.CanvasTexture;
  private toonGradientMap!: THREE.DataTexture;

  // Lights
  private ambientLight!: THREE.AmbientLight;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;

  // State
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
    this.controls.mouseButtons = {
      LEFT: null as any,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };

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
    this.standardMaterial = new THREE.MeshBasicMaterial({
      map: this.canvasTexture,
      side: THREE.DoubleSide,
    });

    this.psxMaterial = new THREE.RawShaderMaterial({
      vertexShader: PSX_VERTEX_SHADER,
      fragmentShader: PSX_FRAGMENT_SHADER,
      glslVersion: THREE.GLSL3,
      uniforms: {
        map: { value: this.canvasTexture },
        jitterAmount: { value: 1.0 },
        resolution: { value: new THREE.Vector2(320, 240) },
      },
      side: THREE.DoubleSide,
    });

    this.matcapMaterial = new THREE.MeshMatcapMaterial({
      map: this.canvasTexture,
      matcap: this.proceduralMatcapTex,
      side: THREE.DoubleSide,
    });

    this.toonMaterial = new THREE.MeshToonMaterial({
      map: this.canvasTexture,
      gradientMap: this.toonGradientMap,
      side: THREE.DoubleSide,
    });

    this.pbrMaterial = new THREE.MeshStandardMaterial({
      map: this.canvasTexture,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
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

    ctx.beginPath();
    ctx.arc(cx, cx, cx, 0, Math.PI * 2);
    ctx.clip();

    const base = ctx.createRadialGradient(cx * 0.7, cx * 0.5, 0, cx, cx, cx);
    base.addColorStop(0.0,  '#e8d8f8');
    base.addColorStop(0.35, '#b09cc8');
    base.addColorStop(0.65, '#5c4880');
    base.addColorStop(1.0,  '#140c28');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);

    const rim = ctx.createRadialGradient(cx, size * 0.9, 0, cx, size * 0.85, size * 0.38);
    rim.addColorStop(0.0, 'rgba(120,140,220,0.55)');
    rim.addColorStop(1.0, 'rgba(120,140,220,0.0)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, size, size);

    const spec = ctx.createRadialGradient(cx * 0.6, cx * 0.52, 0, cx * 0.6, cx * 0.52, cx * 0.22);
    spec.addColorStop(0.0, 'rgba(255,250,245,1.0)');
    spec.addColorStop(0.4, 'rgba(255,248,240,0.7)');
    spec.addColorStop(1.0, 'rgba(255,240,220,0.0)');
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(cv);
  }

  private buildToonGradient(steps: number): THREE.DataTexture {
    const W = 256;
    const palette: [number, number, number][] = steps <= 2
      ? [[20, 15, 40], [255, 248, 255]]
      : steps === 3
        ? [[20, 15, 40], [100, 85, 150], [255, 248, 255]]
        : steps === 4
          ? [[20, 15, 40], [80, 65, 120], [180, 160, 220], [255, 248, 255]]
          : [[15, 10, 30], [60, 50, 100], [120, 105, 170], [200, 185, 240], [255, 250, 255]];

    const data = new Uint8Array(W * 4);
    for (let i = 0; i < W; i++) {
      const t    = i / (W - 1);
      const raw  = t * (palette.length - 1);
      const lo   = Math.floor(raw);
      const idx  = raw - lo < 0.5 ? lo : Math.min(lo + 1, palette.length - 1);
      const [r, g, b] = palette[idx];
      data[i * 4]     = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
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
      light.color.set(cfg.color);
      light.intensity = cfg.intensity;
      const [x, y, z] = lightDirectionFromAngles(cfg.azimuth, cfg.elevation);
      light.position.set(x * 5, y * 5, z * 5);
    };
    applyDir(this.keyLight,  settings.key);
    applyDir(this.fillLight, settings.fill);
    applyDir(this.rimLight,  settings.rim);
    this.syncLightVisibility();
  }

  public getLightingSettings(): LightingSettings { return this.currentLightingSettings; }

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

  public updateTexture() {
    if (this.canvasTexture) this.canvasTexture.needsUpdate = true;
  }

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
          mats.forEach(mat => {
            mat.side = THREE.DoubleSide;
            if (mat.map && !originalTexture) originalTexture = mat.map;
          });
        }
        const hasUVs = child.geometry.attributes.uv !== undefined;
        if (hasUVs) {
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

    object.position.set(0, 0, 0);
    object.scale.set(1, 1, 1);
    const box    = new THREE.Box3().setFromObject(object);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale  = 3.0 / maxDim;
    object.scale.set(scale, scale, scale);
    object.position.multiplyScalar(scale);
    this.frameModel();
    this.updateTexture();
  }

  public clearLoadedModel() {
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
    const fov      = this.camera.fov * (Math.PI / 180);
    const cameraZ  = Math.abs(3.0 / 2 / Math.tan(fov / 2)) * 1.45;
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
}
