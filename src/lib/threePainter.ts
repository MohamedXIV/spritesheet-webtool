import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Custom PSX Shader Source
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
    // Snap vertex to screen space grid (jitter effect)
    vec4 ndc = clipPosition / clipPosition.w;
    // Scale NDC coordinates to screen grid, snap, and scale back
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

export interface ThreePainterConfig {
  canvasElement: HTMLCanvasElement;
  textureCanvas: HTMLCanvasElement; // The offscreen composite canvas updated by React
  onPaintStroke: (u: number, v: number, isStart: boolean, isEnd: boolean) => void;
  onColorPicked?: (hex: string) => void;
  onLoadProgress?: (percentage: number) => void;
}

export class ThreePainter {
  private canvas: HTMLCanvasElement;
  private textureCanvas: HTMLCanvasElement;
  private onPaintStroke: (u: number, v: number, isStart: boolean, isEnd: boolean) => void;
  private onColorPicked?: (hex: string) => void;
  private onLoadProgress?: (percentage: number) => void;

  // ThreeJS objects
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public controls!: OrbitControls;
  private raycaster!: THREE.Raycaster;
  private mouseVec = new THREE.Vector2();

  // Mesh and material storage
  private loadedModelGroup: THREE.Group | null = null;
  private paintableMeshes: THREE.Mesh[] = [];
  private canvasTexture!: THREE.CanvasTexture;
  private standardMaterial!: THREE.MeshBasicMaterial;
  private psxMaterial!: THREE.RawShaderMaterial;
  
  // Settings
  private isPSXShaderEnabled = false;
  private isPaintMode = true;
  private isDrawing = false;
  private loadedOriginalTextureImage: HTMLImageElement | HTMLCanvasElement | ImageBitmap | null = null;
  private handleKeyDown?: (e: KeyboardEvent) => void;

  constructor(config: ThreePainterConfig) {
    this.canvas = config.canvasElement;
    this.textureCanvas = config.textureCanvas;
    this.onPaintStroke = config.onPaintStroke;
    this.onColorPicked = config.onColorPicked;
    this.onLoadProgress = config.onLoadProgress;

    this.initThree();
    this.initDefaultTexture();
    this.setupEvents();
    this.animate();
  }

  /**
   * Setup standard WebGL Scene, Camera, and Lights
   */
  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#121214');

    const rect = this.canvas.getBoundingClientRect();
    this.camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.01, 10000);
    this.camera.position.set(0, 0, 4);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Maya-style camera controls setup
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.mouseButtons = {
      LEFT: null as any,           // LMB is fully reserved for painting
      MIDDLE: THREE.MOUSE.PAN,     // MMB is for camera panning
      RIGHT: THREE.MOUSE.ROTATE,   // RMB is for camera rotation
    };

    this.raycaster = new THREE.Raycaster();
  }

  /**
   * Set up the canvas texture map that is shared with React's composite canvas
   */
  private initDefaultTexture() {
    this.canvasTexture = new THREE.CanvasTexture(this.textureCanvas);
    // Nearest-neighbor scaling for classic crispy retro pixel maps
    this.canvasTexture.minFilter = THREE.NearestFilter;
    this.canvasTexture.magFilter = THREE.NearestFilter;
    this.canvasTexture.wrapS = THREE.RepeatWrapping;
    this.canvasTexture.wrapT = THREE.RepeatWrapping;

    // Standard unlit flat texture material
    this.standardMaterial = new THREE.MeshBasicMaterial({
      map: this.canvasTexture,
      side: THREE.DoubleSide,
    });

    // Custom WebGL2 PSX Wobble & Snapping raw material
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
  }

  /**
   * Render loop triggers
   */
  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();

    // Dynamically update viewport resolution uniform for PSX snapping
    if (this.isPSXShaderEnabled) {
      const rect = this.canvas.getBoundingClientRect();
      this.psxMaterial.uniforms.resolution.value.set(rect.width * 0.5, rect.height * 0.5);
    }

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Flag texture canvas as needing real-time update in WebGL frame buffers
   */
  public updateTexture() {
    if (this.canvasTexture) {
      this.canvasTexture.needsUpdate = true;
    }
  }

  /**
   * Load a 3D model client-side from an ArrayBuffer/Blob
   */
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
      
      // Auto-center and fit model into scene view bounds
      this.setupMeshGroup(loadedObject);
      this.onLoadProgress?.(100);
    } catch (err) {
      this.onLoadProgress?.(-1); // Signal load error
      throw err;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Getter for original model texture image, if any was extracted during loading
   */
  public getLoadedOriginalTextureImage(): HTMLImageElement | HTMLCanvasElement | ImageBitmap | null {
    return this.loadedOriginalTextureImage;
  }

  /**
   * Traverses mesh tree, hooks up raycasters, and assigns textures
   */
  private setupMeshGroup(object: THREE.Object3D) {
    this.loadedModelGroup = new THREE.Group();
    this.loadedModelGroup.add(object);
    this.scene.add(this.loadedModelGroup);

    this.paintableMeshes = [];

    // Try to extract original texture image
    this.loadedOriginalTextureImage = null;
    let originalTexture: THREE.Texture | null = null;

    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Enforce double-sided mapping
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            mat.side = THREE.DoubleSide;
            if (mat.map && !originalTexture) {
              originalTexture = mat.map;
            }
          });
        }
        
        // Setup initial texture and assign active standard/PSX material
        const hasUVs = child.geometry.attributes.uv !== undefined;
        if (hasUVs) {
          child.material = this.isPSXShaderEnabled ? this.psxMaterial : this.standardMaterial;
          this.paintableMeshes.push(child);
        } else {
          // Render as solid gray unlit mesh so it is still perfectly visible!
          child.material = new THREE.MeshBasicMaterial({
            color: 0x71717a, // Tailwind slate-500
            side: THREE.DoubleSide,
          });
        }
      }
    });

    if (originalTexture && (originalTexture as THREE.Texture).image) {
      this.loadedOriginalTextureImage = (originalTexture as THREE.Texture).image as any;
    }

    // Reset position & scale before measuring
    object.position.set(0, 0, 0);
    object.scale.set(1, 1, 1);

    // Auto fit camera view
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Shift model center to scene origin (0, 0, 0)
    object.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    
    // Normalize scale to 3.0 units to prevent camera clipping and OrbitControls speed issues
    const targetSize = 3.0;
    const scale = targetSize / maxDim;
    object.scale.set(scale, scale, scale);
    object.position.multiplyScalar(scale);

    // Initial frame camera fit
    this.frameModel();
    this.updateTexture();
  }

  /**
   * Clears old models and mesh lists from memory
   */
  public clearLoadedModel() {
    if (this.loadedModelGroup) {
      this.scene.remove(this.loadedModelGroup);
      this.loadedModelGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.loadedModelGroup = null;
    }
    this.paintableMeshes = [];
  }

  /**
   * Set if we should render using PSX Vertex Snapping raw shader vs standard unlit material
   */
  public setPSXShader(enabled: boolean) {
    this.isPSXShaderEnabled = enabled;
    
    this.paintableMeshes.forEach((mesh) => {
      mesh.material = enabled ? this.psxMaterial : this.standardMaterial;
      if (mesh.material) {
        mesh.material.needsUpdate = true;
      }
    });
  }

  /**
   * Toggle between Paint Mode (LMB draws) and Orbit Mode (LMB navigates)
   */
  public setPaintMode(paint: boolean) {
    this.isPaintMode = paint;
    if (paint) {
      this.controls.mouseButtons.LEFT = null as any; // Free LMB for raycast painting
    } else {
      this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; // Traditional orbiting
    }
  }

  /**
   * Automatically centers the model and adjusts the camera distance to fit it in the viewport (Focus/Frame model)
   */
  public frameModel() {
    if (!this.loadedModelGroup) return;

    // Standardize distance calculation based on normalized target model size (3.0)
    const targetSize = 3.0;
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(targetSize / 2 / Math.tan(fov / 2));
    
    // Zoom out slightly to leave padding
    cameraZ *= 1.45;

    // Frame without resetting camera rotation:
    // Move the camera along its current direction to be cameraZ units away from the target
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    
    const target = new THREE.Vector3(0, 0, 0);
    if (direction.lengthSq() < 0.001) {
      direction.set(0, 0, -1); // Default pointing down -z
    }
    
    // Camera position is opposite of view direction relative to the target
    const newCameraPosition = target.clone().sub(direction.clone().normalize().multiplyScalar(cameraZ));
    this.camera.position.copy(newCameraPosition);
    this.camera.lookAt(target);

    // Update controls center
    this.controls.target.copy(target);
    this.controls.update();
  }

  /**
   * Map pointer movements to Raycasting triggers
   */
  private setupEvents() {
    const getMousePosition = (e: MouseEvent): THREE.Vector2 => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      return this.mouseVec.set(x, y);
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (e.button !== 0 || !this.isPaintMode || this.paintableMeshes.length === 0) return;
      
      const mouse = getMousePosition(e);
      this.raycaster.setFromCamera(mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.paintableMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.uv) {
          this.isDrawing = true;
          
          if (e.shiftKey && this.onColorPicked) {
            // Shift + LMB = Eyedropper Color Picking
            this.eyedropperColorPick(hit.uv);
          } else {
            // Normal Paint Stroke Start
            this.onPaintStroke(hit.uv.x, hit.uv.y, true, false);
          }
        }
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      if (!this.isDrawing || !this.isPaintMode || this.paintableMeshes.length === 0) return;

      const mouse = getMousePosition(e);
      this.raycaster.setFromCamera(mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.paintableMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.uv) {
          if (e.shiftKey && this.onColorPicked) {
            this.eyedropperColorPick(hit.uv);
          } else {
            this.onPaintStroke(hit.uv.x, hit.uv.y, false, false);
          }
        }
      }
    };

    const handlePointerUp = () => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.onPaintStroke(0, 0, false, true); // Stroke Finished
      }
    };

    this.canvas.addEventListener('mousedown', handlePointerDown);
    this.canvas.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    // Keyboard bindings for framing the viewport: "f" (Maya) and "." (Blender)
    this.handleKeyDown = (e: KeyboardEvent) => {
      if (activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        (activeEl as any).isContentEditable
      )) {
        return; // Ignore when user is actively typing in UI inputs
      }

      if (e.key.toLowerCase() === 'f' || e.key === '.') {
        e.preventDefault();
        this.frameModel();
      }
    };
    window.addEventListener('keydown', this.handleKeyDown);

    // Support resizing camera aspects
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Resizes viewport renderer
   */
  public handleResize = () => {
    const rect = this.canvas.parentElement?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
  };

  /**
   * Retrieve color value from composition canvas using UV coordinates
   */
  private eyedropperColorPick(uv: THREE.Vector2) {
    if (!this.onColorPicked) return;

    const ctx = this.textureCanvas.getContext('2d');
    if (!ctx) return;

    const tx = Math.floor(uv.x * this.textureCanvas.width);
    const ty = Math.floor((1 - uv.y) * this.textureCanvas.height);

    try {
      const pixel = ctx.getImageData(tx, ty, 1, 1).data;
      if (pixel[3] > 0) {
        const hex = '#' + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1);
        this.onColorPicked(hex);
      }
    } catch (e) {
      console.warn('Eyedropper pixel fetch failed:', e);
    }
  }

  /**
   * Clean up and dispose of event listeners
   */
  public dispose() {
    window.removeEventListener('resize', this.handleResize);
    if (this.handleKeyDown) {
      window.removeEventListener('keydown', this.handleKeyDown);
    }
    this.clearLoadedModel();
    if (this.canvasTexture) this.canvasTexture.dispose();
    if (this.standardMaterial) this.standardMaterial.dispose();
    if (this.psxMaterial) this.psxMaterial.dispose();
    this.renderer.dispose();
  }
}
