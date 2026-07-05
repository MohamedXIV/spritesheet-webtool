'use client';

import React, { useEffect, useRef } from 'react';
import type * as THREE_NS from 'three';
import { useStylizerContext } from '@/contexts/StylizerContext';
import styles from './StylizerPreview3DPanel.module.css';

/**
 * Standalone material preview: a slowly rotating, lit sphere textured with the
 * stylized albedo (and normal map when available). Built directly on `three`
 * rather than ThreePainter — ThreePainter is designed around a loaded model
 * with paint callbacks and cannot drive a bare primitive preview.
 */
export function StylizerPreview3DPanel() {
  const { derived, material } = useStylizerContext();
  const mountRef = useRef<HTMLDivElement>(null);

  // Live three.js objects, kept across renders via a ref bag.
  const engineRef = useRef<{
    THREE: typeof THREE_NS;
    renderer: THREE_NS.WebGLRenderer;
    scene: THREE_NS.Scene;
    camera: THREE_NS.PerspectiveCamera;
    mesh: THREE_NS.Mesh;
    geometry: THREE_NS.SphereGeometry;
    mat: THREE_NS.MeshStandardMaterial;
    raf: number;
    ro: ResizeObserver | null;
  } | null>(null);

  // Set up renderer / scene / animation loop once on mount.
  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;

    import('three').then((THREE) => {
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

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0, 3.2);

      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 1.1);
      dir.position.set(2, 3, 4);
      scene.add(dir);
      const point = new THREE.PointLight(0xffffff, 0.5);
      point.position.set(-3, -2, 2);
      scene.add(point);

      const geometry = new THREE.SphereGeometry(1, 64, 48);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.05 });
      const mesh = new THREE.Mesh(geometry, mat);
      scene.add(mesh);

      const engine = {
        THREE,
        renderer,
        scene,
        camera,
        mesh,
        geometry,
        mat,
        raf: 0,
        ro: null as ResizeObserver | null,
      };
      engineRef.current = engine;

      const animate = () => {
        if (disposed) return;
        mesh.rotation.y += 0.005;
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

      // Apply any maps already present when the engine finishes initializing.
      applyMaps(engine);
    });

    return () => {
      disposed = true;
      const engine = engineRef.current;
      engineRef.current = null;
      if (!engine) return;
      cancelAnimationFrame(engine.raf);
      engine.ro?.disconnect();
      engine.mat.map?.dispose();
      engine.mat.normalMap?.dispose();
      engine.geometry.dispose();
      engine.mat.dispose();
      engine.renderer.dispose();
      const el = engine.renderer.domElement;
      el.parentNode?.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild textures whenever the derived/source maps change.
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) applyMaps(engine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived.stylizedAlbedo, derived.normal, material.maps.albedo]);

  // Builds a THREE texture from an ImageBitmap via an offscreen canvas.
  function makeTexture(engine: NonNullable<typeof engineRef.current>, bmp: ImageBitmap): THREE_NS.CanvasTexture {
    const { THREE } = engine;
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  function applyMaps(engine: NonNullable<typeof engineRef.current>) {
    const { THREE, mat } = engine;
    const albedo = derived.stylizedAlbedo ?? material.maps.albedo ?? null;

    // Albedo → base color map.
    const prevMap = mat.map;
    if (albedo) {
      const tex = makeTexture(engine, albedo);
      mat.map = tex;
    } else {
      mat.map = null;
    }
    if (prevMap && prevMap !== mat.map) prevMap.dispose();

    // Normal map (linear color space).
    const prevNormal = mat.normalMap;
    if (derived.normal) {
      const c = document.createElement('canvas');
      c.width = derived.normal.width;
      c.height = derived.normal.height;
      c.getContext('2d')!.drawImage(derived.normal, 0, 0);
      const ntex = new THREE.CanvasTexture(c);
      ntex.colorSpace = THREE.NoColorSpace;
      ntex.needsUpdate = true;
      mat.normalMap = ntex;
    } else {
      mat.normalMap = null;
    }
    if (prevNormal && prevNormal !== mat.normalMap) prevNormal.dispose();

    mat.needsUpdate = true;
  }

  return (
    <div className={styles.panel}>
      <div ref={mountRef} className={styles.mount} />
      {!material.maps.albedo && <div className={styles.placeholder}>Load an albedo map to preview in 3D.</div>}
    </div>
  );
}
