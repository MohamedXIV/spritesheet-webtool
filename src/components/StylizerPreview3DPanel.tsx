'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Upload, Loader2, Globe, Square, Copy, RefreshCw } from 'lucide-react';
import type * as THREE_NS from 'three';
import { useStylizerContext } from '@/contexts/StylizerContext';
import { ShadingMode, LightingSettings } from '@/lib/lightingPresets';
import styles from './StylizerPreview3DPanel.module.css';

function buildProceduralMatcap(THREE: typeof THREE_NS, size: number) {
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

function buildToonGradient(THREE: typeof THREE_NS, steps: number) {
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

export function StylizerPreview3DPanel() {
  const {
    derived,
    material,
    previewShape,
    setPreviewShape,
    customModelFile,
    setCustomModel,
    shadingMode,
    lightingSettings,
  } = useStylizerContext();

  const mountRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  // Live three.js objects, kept across renders via a ref bag.
  const engineRef = useRef<{
    THREE: typeof THREE_NS;
    renderer: THREE_NS.WebGLRenderer;
    scene: THREE_NS.Scene;
    camera: THREE_NS.PerspectiveCamera;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controls: any;
    mesh: THREE_NS.Mesh;
    customGroup: THREE_NS.Group;
    pbrMat: THREE_NS.MeshStandardMaterial;
    toonMat: THREE_NS.MeshToonMaterial;
    matcapMat: THREE_NS.MeshMatcapMaterial;
    unlitMat: THREE_NS.MeshBasicMaterial;
    toonGradientMap: THREE_NS.DataTexture;
    proceduralMatcapTex: THREE_NS.CanvasTexture;
    ambientLight: THREE_NS.AmbientLight;
    keyLight: THREE_NS.DirectionalLight;
    fillLight: THREE_NS.DirectionalLight;
    rimLight: THREE_NS.DirectionalLight;
    raf: number;
    ro: ResizeObserver | null;
  } | null>(null);

  // Re-apply maps helper
  const applyMaps = useCallback((engine: NonNullable<typeof engineRef.current>) => {
    const { THREE, pbrMat, toonMat, matcapMat, unlitMat } = engine;

    const makeTexture = (bmp: ImageBitmap, isColor: boolean) => {
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext('2d')!.drawImage(bmp, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.needsUpdate = true;
      return tex;
    };

    const albedo = derived.stylizedAlbedo ?? material.maps.albedo ?? null;
    const normal = derived.normal ?? material.maps.normal ?? null;
    const roughness = derived.roughness ?? material.maps.roughness ?? null;
    const metallic = derived.metallic ?? material.maps.metallic ?? null;

    // Dispose old textures to prevent memory leaks
    if (pbrMat.map) pbrMat.map.dispose();
    if (pbrMat.normalMap) pbrMat.normalMap.dispose();
    if (pbrMat.roughnessMap) pbrMat.roughnessMap.dispose();
    if (pbrMat.metalnessMap) pbrMat.metalnessMap.dispose();

    // Create new textures
    const albedoTex = albedo ? makeTexture(albedo, true) : null;
    const normalTex = normal ? makeTexture(normal, false) : null;
    const roughnessTex = roughness ? makeTexture(roughness, false) : null;
    const metallicTex = metallic ? makeTexture(metallic, false) : null;

    // Assign to PBR
    pbrMat.map = albedoTex;
    pbrMat.normalMap = normalTex;
    pbrMat.roughnessMap = roughnessTex;
    pbrMat.metalnessMap = metallicTex;
    pbrMat.needsUpdate = true;

    // Assign to Toon
    toonMat.map = albedoTex;
    toonMat.normalMap = normalTex;
    toonMat.needsUpdate = true;

    // Assign to Matcap
    matcapMat.map = albedoTex;
    matcapMat.needsUpdate = true;

    // Assign to Unlit
    unlitMat.map = albedoTex;
    unlitMat.needsUpdate = true;
  }, [derived, material.maps]);

  const applyShadingMode = useCallback((engine: NonNullable<typeof engineRef.current>, mode: ShadingMode) => {
    const { pbrMat, toonMat, matcapMat, unlitMat, mesh, customGroup } = engine;

    let activeMat: THREE_NS.Material;
    switch (mode) {
      case 'unlit': activeMat = unlitMat; break;
      case 'matcap': activeMat = matcapMat; break;
      case 'toon': activeMat = toonMat; break;
      case 'standard': default: activeMat = pbrMat; break;
    }

    mesh.material = activeMat;
    mesh.material.needsUpdate = true;

    customGroup.traverse((child) => {
      if ((child as THREE_NS.Mesh).isMesh) {
        (child as THREE_NS.Mesh).material = activeMat;
        if (Array.isArray((child as THREE_NS.Mesh).material)) {
          ((child as THREE_NS.Mesh).material as THREE_NS.Material[]).forEach(m => m.needsUpdate = true);
        } else {
          ((child as THREE_NS.Mesh).material as THREE_NS.Material).needsUpdate = true;
        }
      }
    });
  }, []);

  const applyLighting = useCallback((engine: NonNullable<typeof engineRef.current>, settings: LightingSettings) => {
    const { ambientLight, keyLight, fillLight, rimLight } = engine;

    // Ambient
    ambientLight.color.set(settings.ambient.color);
    ambientLight.intensity = settings.ambient.intensity;

    const updateDirLight = (light: THREE_NS.DirectionalLight, s: typeof settings.key) => {
      light.visible = s.enabled;
      if (!s.enabled) return;
      light.color.set(s.color);
      light.intensity = s.intensity;

      const azRad = (s.azimuth * Math.PI) / 180;
      const elRad = (s.elevation * Math.PI) / 180;

      const distance = 10;
      const x = distance * Math.cos(elRad) * Math.sin(azRad);
      const y = distance * Math.sin(elRad);
      const z = distance * Math.cos(elRad) * Math.cos(azRad);
      light.position.set(x, y, z);
    };

    updateDirLight(keyLight, settings.key);
    updateDirLight(fillLight, settings.fill);
    updateDirLight(rimLight, settings.rim);
  }, []);

  // Set up renderer / scene / OrbitControls once on mount
  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;

    Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
    ]).then(([THREE, { OrbitControls }]) => {
      if (disposed || !mountRef.current) return;
      const host = mountRef.current;
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width) || 320);
      const height = Math.max(1, Math.floor(rect.height) || 320);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(0, 0, 3.2);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 0.1;
      controls.maxDistance = 200;

      // Create lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
      scene.add(rimLight);

      // Create materials
      const pbrMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.05,
        side: THREE.DoubleSide
      });

      const toonGradientMap = buildToonGradient(THREE, 3);
      const toonMat = new THREE.MeshToonMaterial({
        color: 0xffffff,
        gradientMap: toonGradientMap,
        side: THREE.DoubleSide
      });

      const proceduralMatcapTex = buildProceduralMatcap(THREE, 128);
      const matcapMat = new THREE.MeshMatcapMaterial({
        color: 0xffffff,
        matcap: proceduralMatcapTex,
        side: THREE.DoubleSide
      });

      const unlitMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide
      });

      // Sphere default primitive mesh
      const sphereGeo = new THREE.SphereGeometry(1, 64, 48);
      const mesh = new THREE.Mesh(sphereGeo, pbrMat);
      scene.add(mesh);

      // Group to hold user custom models
      const customGroup = new THREE.Group();
      scene.add(customGroup);

      const engine = {
        THREE,
        renderer,
        scene,
        camera,
        controls,
        mesh,
        customGroup,
        pbrMat,
        toonMat,
        matcapMat,
        unlitMat,
        toonGradientMap,
        proceduralMatcapTex,
        ambientLight,
        keyLight,
        fillLight,
        rimLight,
        raf: 0,
        ro: null as ResizeObserver | null,
      };
      engineRef.current = engine;

      const animate = () => {
        if (disposed) return;
        controls.update();
        renderer.render(scene, camera);
        engine.raf = requestAnimationFrame(animate);
      };
      engine.raf = requestAnimationFrame(animate);

      const ro = new ResizeObserver(() => {
        const r = host.getBoundingClientRect();
        const w = Math.max(1, Math.floor(r.width));
        const h = Math.max(1, Math.floor(r.height));
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(host);
      engine.ro = ro;

      // Apply initial maps
      applyMaps(engine);
    });

    return () => {
      disposed = true;
      const engine = engineRef.current;
      engineRef.current = null;
      if (!engine) return;
      cancelAnimationFrame(engine.raf);
      engine.ro?.disconnect();
      engine.controls.dispose();
      engine.mesh.geometry.dispose();

      // Dispose materials & textures
      if (engine.pbrMat.map) engine.pbrMat.map.dispose();
      if (engine.pbrMat.normalMap) engine.pbrMat.normalMap.dispose();
      if (engine.pbrMat.roughnessMap) engine.pbrMat.roughnessMap.dispose();
      if (engine.pbrMat.metalnessMap) engine.pbrMat.metalnessMap.dispose();
      engine.pbrMat.dispose();

      engine.toonMat.dispose();
      engine.toonGradientMap.dispose();

      engine.matcapMat.dispose();
      engine.proceduralMatcapTex.dispose();

      engine.unlitMat.dispose();

      // Clear custom meshes
      engine.customGroup.traverse((child) => {
        if (child instanceof engine.THREE.Mesh) {
          child.geometry.dispose();
        }
      });

      engine.renderer.dispose();
      const el = engine.renderer.domElement;
      el.parentNode?.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle shape changes and apply maps
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const { THREE, mesh, customGroup, camera, controls } = engine;

    // Reset visibility
    mesh.visible = previewShape !== 'custom';
    customGroup.visible = previewShape === 'custom';

    if (previewShape !== 'custom') {
      mesh.geometry.dispose();
      if (previewShape === 'sphere') {
        mesh.geometry = new THREE.SphereGeometry(1, 64, 48);
      } else if (previewShape === 'box') {
        mesh.geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      } else if (previewShape === 'plane') {
        mesh.geometry = new THREE.PlaneGeometry(1.5, 1.5);
      }
      // Reset camera
      camera.position.set(0, 0, 3.2);
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [previewShape]);

  // Re-apply maps on change
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) applyMaps(engine);
  }, [applyMaps]);

  // Update lighting and shading mode dynamically when they change in context
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // Apply shading mode
    applyShadingMode(engine, shadingMode);

    // Apply lighting settings
    applyLighting(engine, lightingSettings);

    // Ambient / directional lights visibility based on shading mode
    const lit = shadingMode === 'toon' || shadingMode === 'standard';
    engine.ambientLight.visible = lit;
    engine.keyLight.visible = lit && lightingSettings.key.enabled;
    engine.fillLight.visible = lit && lightingSettings.fill.enabled;
    engine.rimLight.visible = lit && lightingSettings.rim.enabled;
  }, [shadingMode, lightingSettings, applyShadingMode, applyLighting]);

  // Load custom model mesh on customModelFile change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !customModelFile) return;

    const { THREE, customGroup, camera, controls } = engine;

    // Determine current active material based on shadingMode
    let activeMat: THREE_NS.Material;
    switch (shadingMode) {
      case 'unlit': activeMat = engine.unlitMat; break;
      case 'matcap': activeMat = engine.matcapMat; break;
      case 'toon': activeMat = engine.toonMat; break;
      case 'standard': default: activeMat = engine.pbrMat; break;
    }

    setIsLoadingModel(true);
    setLoadProgress(10);

    const ext = customModelFile.name.split('.').pop()?.toLowerCase();
    const url = URL.createObjectURL(customModelFile);

    // Dynamic import of specific loaders based on file type
    const loadPromise = async () => {
      if (ext === 'gltf' || ext === 'glb') {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        return new Promise<THREE_NS.Object3D>((res, rej) => {
          loader.load(url,
            (gltf) => res(gltf.scene),
            (xhr) => {
              if (xhr.total > 0) setLoadProgress(10 + (xhr.loaded / xhr.total) * 70);
            },
            rej
          );
        });
      } else if (ext === 'obj') {
        const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
        const loader = new OBJLoader();
        return loader.loadAsync(url);
      } else if (ext === 'fbx') {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        const loader = new FBXLoader();
        return loader.loadAsync(url);
      } else {
        throw new Error(`Unsupported format: .${ext}`);
      }
    };

    loadPromise().then((loadedObject) => {
      // Clear old custom meshes
      while (customGroup.children.length > 0) {
        const child = customGroup.children[0];
        customGroup.remove(child);
        child.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose();
          }
        });
      }

      setLoadProgress(90);

      // Traverse and bind materials
      loadedObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const hasUVs = child.geometry.attributes.uv !== undefined;
          if (hasUVs) {
            child.material = activeMat;
            // Generate uv2 for AO map if needed
            if (!child.geometry.attributes.uv2) {
              child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
            }
          } else {
            child.material = new THREE.MeshStandardMaterial({
              color: 0x71717a,
              roughness: 0.8,
            });
          }
        }
      });

      customGroup.add(loadedObject);

      // Center and scale camera to fit bounding box
      const box = new THREE.Box3().setFromObject(loadedObject);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      loadedObject.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.45; // zoom buffer

      controls.maxDistance = Math.max(maxDim * 15, 200);
      camera.position.set(0, 0, Math.max(cameraZ, 2.0));
      controls.target.set(0, 0, 0);
      controls.update();

      setIsLoadingModel(false);
      setLoadProgress(100);
    }).catch((err) => {
      console.error(err);
      alert(`Failed to load model: ${err.message || err}`);
      setCustomModel(null);
      setIsLoadingModel(false);
    }).finally(() => {
      URL.revokeObjectURL(url);
    });
  }, [customModelFile, setCustomModel, shadingMode]);

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['gltf', 'glb', 'obj', 'fbx'].includes(ext || '')) {
        setCustomModel(file);
      } else {
        alert('Invalid format. Please upload a GLTF, GLB, OBJ, or FBX model.');
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCustomModel(e.target.files[0]);
    }
  };

  return (
    <div
      className={`${styles.panel} ${dragActive ? styles.dragActive : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      {/* Base map check placeholder */}
      {!material.maps.albedo && (
        <div className={styles.placeholder}>
          <div className={styles.placeholderContent}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={styles.placeholderIcon}>
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 17 22 12" />
            </svg>
            <p>Load an Albedo map to preview PBR stylization on 3D geometry.</p>
          </div>
        </div>
      )}

      {material.maps.albedo && (
        <>
          {/* Floating HUD controls */}
          <div className={styles.hudHeader}>
            <div className={styles.hudLeft}>
              <button
                className={`${styles.hudBtn} ${previewShape === 'sphere' ? styles.hudBtnActive : ''}`}
                onClick={() => setPreviewShape('sphere')}
              >
                <Globe size={11} />
                <span>Sphere</span>
              </button>
              <button
                className={`${styles.hudBtn} ${previewShape === 'box' ? styles.hudBtnActive : ''}`}
                onClick={() => setPreviewShape('box')}
              >
                <Square size={11} />
                <span>Box</span>
              </button>
              <button
                className={`${styles.hudBtn} ${previewShape === 'plane' ? styles.hudBtnActive : ''}`}
                onClick={() => setPreviewShape('plane')}
              >
                <Copy size={11} />
                <span>Plane</span>
              </button>
              <button
                className={`${styles.hudBtn} ${previewShape === 'custom' ? styles.hudBtnActive : ''}`}
                onClick={() => setPreviewShape('custom')}
              >
                <RefreshCw size={11} />
                <span>Custom Model</span>
              </button>
            </div>

            {previewShape === 'custom' && customModelFile && (
              <div className={styles.hudRight}>
                <span className={styles.fileName}>{customModelFile.name}</span>
                <label className={styles.replaceLink}>
                  Replace
                  <input
                    type="file"
                    accept=".gltf,.glb,.obj,.fbx"
                    onChange={handleFileInput}
                    className={styles.hiddenInput}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Model loader zone if shape is custom and no file is loaded */}
          {previewShape === 'custom' && !customModelFile && !isLoadingModel && (
            <div className={styles.dropZone}>
              <div className={styles.uploadCard}>
                <div className={styles.iconCircle}>
                  <Upload size={24} className={styles.uploadIcon} />
                </div>
                <h3>Import 3D Preview Model</h3>
                <p>
                  Drag and drop your <strong>GLTF, GLB, OBJ, or FBX</strong> file here to view PBR stylization.
                </p>
                <label className={styles.browseButton}>
                  Browse Files
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gltf,.glb,.obj,.fbx"
                    onChange={handleFileInput}
                    className={styles.hiddenInput}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Loading overlay */}
          {isLoadingModel && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingCard}>
                <Loader2 className={styles.spinner} size={28} />
                <h3>Parsing Mesh Geometry...</h3>
                <div className={styles.progressBarBg}>
                  <div
                    className={styles.progressBarFill}
                    style={{ width: `${Math.max(5, loadProgress)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div ref={mountRef} className={`${styles.mount} ${!material.maps.albedo ? styles.hidden : ''}`} />
    </div>
  );
}
