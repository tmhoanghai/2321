import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Camera, ChevronDown, ChevronUp, Grid, RotateCcw } from 'lucide-react';
import {
  ChartPayload,
  computeNetworkLayout,
  formatChartNumber,
  UniversalChartType,
} from '../lib/chartData';
import {
  analyzeVectors,
  compileMathExpression,
  MathFunctionSpec,
  PointSpec,
  sampleFunction2D,
  sampleParametric2D,
  sampleSurface3D,
  VectorSpec,
} from '../lib/mathGraphEngine';

const PALETTE = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4f46e5',
];

export interface ThreeChartViewportProps {
  chartType: UniversalChartType;
  payload: ChartPayload;
  isDark: boolean;
  hiddenSeries: Record<string, boolean>;
  functions?: MathFunctionSpec[];
  vectors?: VectorSpec[];
  points?: PointSpec[];
  mathParams?: Record<string, number>;
  xRange?: [number, number];
  yRange?: [number, number];
  showVectorSum?: boolean;
  showCrossProduct?: boolean;
  isFullscreen?: boolean;
}

interface InspectReadout {
  title: string;
  detail: string;
  color?: string;
}

type CameraPreset = 'iso' | 'xy' | 'xz' | 'yz';

// Map right-handed Math (x, y, z_up) -> Three.js (x, y_up, z_depth)
// ThreeX = mathX, ThreeY = mathZ, ThreeZ = -mathY  => (1,0,0) x (0,0,-1) = (0,1,0) preserves X x Y = Z!
function mathToThree(mx: number, my: number, mz: number): THREE.Vector3 {
  return new THREE.Vector3(mx, mz, -my);
}

function createTextSprite(
  text: string,
  color: string,
  maxAnisotropy: number,
  fontSize = 30,
  bgColor?: string
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const padX = 14;
  const padY = 10;
  canvas.width = Math.max(64, Math.ceil(metrics.width + padX * 2));
  canvas.height = Math.max(40, fontSize + padY * 2);

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 8);
    ctx.fill();
  }

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const worldScale = 0.014;
  sprite.scale.set(canvas.width * worldScale, canvas.height * worldScale, 1);
  return sprite;
}

function heightColormap(t: number, target: THREE.Color) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped < 0.25) {
    target.set('#1d4ed8').lerp(new THREE.Color('#0891b2'), clamped / 0.25);
  } else if (clamped < 0.55) {
    target.set('#0891b2').lerp(new THREE.Color('#10b981'), (clamped - 0.25) / 0.3);
  } else if (clamped < 0.8) {
    target.set('#10b981').lerp(new THREE.Color('#f59e0b'), (clamped - 0.55) / 0.25);
  } else {
    target.set('#f59e0b').lerp(new THREE.Color('#ef4444'), (clamped - 0.8) / 0.2);
  }
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj: any) => {
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
      obj.geometry.dispose();
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
        if (typeof m.dispose === 'function') m.dispose();
      }
    }
  });
}

function createArrowMesh(
  origin: THREE.Vector3,
  tip: THREE.Vector3,
  color: string,
  radius = 0.055,
  userData?: Record<string, any>
): THREE.Group {
  const group = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(tip, origin);
  const len = dir.length();
  if (len < 1e-4) return group;

  const headLen = Math.min(0.45, Math.max(0.18, len * 0.16));
  const shaftLen = Math.max(0.01, len - headLen);
  const headRadius = radius * 2.5;

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.32,
    metalness: 0.18,
  });

  const shaftGeo = new THREE.CylinderGeometry(radius, radius, shaftLen, 14);
  const shaft = new THREE.Mesh(shaftGeo, mat);
  shaft.position.y = shaftLen / 2;
  if (userData) shaft.userData = { ...userData };

  const headGeo = new THREE.ConeGeometry(headRadius, headLen, 16);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = shaftLen + headLen / 2;
  if (userData) head.userData = { ...userData };

  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  group.position.copy(origin);
  group.quaternion.copy(quat);
  group.add(shaft, head);
  return group;
}

export const ThreeChartViewport: React.FC<ThreeChartViewportProps> = ({
  chartType,
  payload,
  isDark,
  hiddenSeries,
  functions = [],
  vectors = [],
  points = [],
  mathParams = {},
  xRange = [-4, 4],
  yRange = [-4, 4],
  showVectorSum = false,
  showCrossProduct = false,
  isFullscreen = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [readout, setReadout] = useState<InspectReadout | null>(null);
  const [wireframe, setWireframe] = useState<boolean>(Boolean(payload.wireframe));
  const [dockCollapsed, setDockCollapsed] = useState(false);

  // Mutable refs for WebGL scene management across React updates
  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    contentGroup: THREE.Group;
    pickables: THREE.Object3D[];
    maxAnisotropy: number;
    isSoftwareGl: boolean;
    requestRender: () => void;
    glideTo: (pos: THREE.Vector3, target: THREE.Vector3) => void;
  } | null>(null);

  const hoveredMeshRef = useRef<THREE.Object3D | null>(null);
  const defaultCameraPos = useMemo(() => {
    if (chartType === 'surface_3d' || chartType === 'vector_3d' || chartType === 'parametric_3d') {
      return new THREE.Vector3(8.5, 6.8, 9.2);
    }
    return new THREE.Vector3(8.8, 6.2, 10.2);
  }, [chartType]);

  // 1. Initialize Three.js WebGLRenderer once per mount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param) || '');
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(320, container.clientWidth || 640);
    const height = Math.max(280, container.clientHeight || 380);
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex = isDark ? 0x09090b : 0xf8fafc;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.016);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 160);
    camera.position.copy(defaultCameraPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.5;
    controls.maxDistance = 42;
    controls.target.set(0, 0.4, 0);

    // 3-point warm/cool studio lighting
    const hemi = new THREE.HemisphereLight(0xdbeafe, isDark ? 0x1e293b : 0xcbd5e1, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    keyLight.position.set(10, 16, 12);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -10;
      keyLight.shadow.camera.right = 10;
      keyLight.shadow.camera.top = 10;
      keyLight.shadow.camera.bottom = -10;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.55);
    rimLight.position.set(-10, 6, -12);
    scene.add(rimLight);

    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // Smooth camera preset transition state
    let transitionTargetPos: THREE.Vector3 | null = null;
    let transitionTargetLook: THREE.Vector3 | null = null;
    let lastTime = performance.now();

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      if (disposed) return;
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (status === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } catch {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        let animating = false;
        if (transitionTargetPos && transitionTargetLook) {
          const lambda = 9;
          camera.position.x = THREE.MathUtils.damp(camera.position.x, transitionTargetPos.x, lambda, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, transitionTargetPos.y, lambda, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, transitionTargetPos.z, lambda, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, transitionTargetLook.x, lambda, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, transitionTargetLook.y, lambda, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, transitionTargetLook.z, lambda, dt);
          if (
            camera.position.distanceTo(transitionTargetPos) < 0.03 &&
            controls.target.distanceTo(transitionTargetLook) < 0.03
          ) {
            camera.position.copy(transitionTargetPos);
            controls.target.copy(transitionTargetLook);
            transitionTargetPos = null;
            transitionTargetLook = null;
          } else {
            animating = true;
          }
        }

        const didDamp = controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || animating || didDamp) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const glideTo = (pos: THREE.Vector3, target: THREE.Vector3) => {
      if (isSoftwareGl) {
        camera.position.copy(pos);
        controls.target.copy(target);
        requestRender();
        return;
      }
      transitionTargetPos = pos.clone();
      transitionTargetLook = target.clone();
      lastTime = performance.now();
      requestRender();
    };

    controls.addEventListener('start', () => {
      transitionTargetPos = null;
      transitionTargetLook = null;
    });
    controls.addEventListener('change', requestRender);

    // Raycasting on layer 1 (throttled pointermove + click)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNdc = new THREE.Vector2();
    let lastHoverTs = 0;

    const performRaycast = (clientX: number, clientY: number) => {
      const state = sceneRefs.current;
      if (!state) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(state.pickables, false);

      const prevHovered = hoveredMeshRef.current as any;
      if (prevHovered && prevHovered.material && prevHovered.userData?.baseEmissive !== undefined) {
        prevHovered.material.emissive?.setHex(prevHovered.userData.baseEmissive);
        if (prevHovered.userData?.baseY !== undefined) {
          prevHovered.position.y = prevHovered.userData.baseY;
        }
      }

      if (hits.length > 0) {
        const hit = hits[0];
        const obj = hit.object as any;
        hoveredMeshRef.current = obj;
        renderer.domElement.style.cursor = 'pointer';

        if (obj.material && obj.material.emissive) {
          if (obj.userData.baseEmissive === undefined) {
            obj.userData.baseEmissive = obj.material.emissive.getHex();
          }
          obj.material.emissive.setHex(0x2563eb);
        }
        if (obj.userData.liftOnHover) {
          if (obj.userData.baseY === undefined) obj.userData.baseY = obj.position.y;
          obj.position.y = obj.userData.baseY + 0.14;
        }

        if (obj.userData.isSurface) {
          // Convert Three.js world hit back to math (x, y, z_up)
          const mx = hit.point.x;
          const my = -hit.point.z;
          const mz = hit.point.y;
          setReadout({
            title: obj.userData.label || 'Bề mặt 3D',
            detail: `x = ${mx.toFixed(2)}, y = ${my.toFixed(2)}, z = ${mz.toFixed(2)}`,
            color: '#2563eb',
          });
        } else if (obj.userData.label) {
          setReadout({
            title: String(obj.userData.label),
            detail: String(obj.userData.detail || ''),
            color: obj.userData.color,
          });
        }
        requestRender();
      } else {
        hoveredMeshRef.current = null;
        renderer.domElement.style.cursor = 'grab';
        if (prevHovered) requestRender();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTs < 36) return;
      lastHoverTs = now;
      performRaycast(e.clientX, e.clientY);
    };

    const onClick = (e: MouseEvent) => {
      performRaycast(e.clientX, e.clientY);
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(280, Math.round(entry.contentRect.width));
        const h = Math.max(260, Math.round(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    resizeObserver.observe(container);

    sceneRefs.current = {
      renderer,
      scene,
      camera,
      controls,
      contentGroup,
      pickables: [],
      maxAnisotropy,
      isSoftwareGl,
      requestRender,
      glideTo,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      disposeObjectTree(scene);
      if (scene.environment) scene.environment.dispose();
      renderer.dispose();
      sceneRefs.current = null;
    };
  }, [isDark]);

  // 2. Rebuild 3D content cleanly whenever chartType / data / params / wireframe change
  useEffect(() => {
    const state = sceneRefs.current;
    if (!state) return;

    const { contentGroup, maxAnisotropy, requestRender } = state;
    hoveredMeshRef.current = null;
    disposeObjectTree(contentGroup);
    contentGroup.clear();
    const pickables: THREE.Object3D[] = [];
    const registerPickable = (obj: THREE.Object3D) => {
      obj.layers.enable(1);
      pickables.push(obj);
    };

    const labelTextColor = isDark ? '#e4e4e7' : '#1e293b';
    const labelBg = isDark ? 'rgba(24,24,27,0.82)' : 'rgba(255,255,255,0.88)';
    const gridColor1 = isDark ? 0x334155 : 0x94a3b8;
    const gridColor2 = isDark ? 0x1e293b : 0xe2e8f0;

    const isMath3D =
      chartType === 'surface_3d' ||
      chartType === 'vector_3d' ||
      chartType === 'parametric_3d' ||
      chartType === 'coordinate_2d' ||
      chartType === 'integral' ||
      chartType === 'vector_2d' ||
      (chartType === 'scatter_3d' && (vectors.length > 0 || functions.length > 0));

    if (isMath3D) {
      // Build Mathematical Oxyz Coordinate Axes
      const xSpan = Math.max(2, Math.abs(xRange[1] - xRange[0]) / 2 || 4);
      const ySpan = Math.max(2, Math.abs(yRange[1] - yRange[0]) / 2 || 4);
      const axisSpan = Math.max(4, Math.min(8, Math.max(xSpan, ySpan)));

      // XY ground grid at z = 0 (y_three = 0)
      const gridHelper = new THREE.GridHelper(axisSpan * 2, Math.round(axisSpan * 2), gridColor1, gridColor2);
      gridHelper.position.y = -0.005;
      contentGroup.add(gridHelper);

      // Base O(0,0,0) sphere
      const originGeo = new THREE.SphereGeometry(0.11, 16, 16);
      const originMat = new THREE.MeshStandardMaterial({
        color: isDark ? '#f4f4f5' : '#0f172a',
        roughness: 0.4,
      });
      const originMesh = new THREE.Mesh(originGeo, originMat);
      contentGroup.add(originMesh);
      const oLabel = createTextSprite('O(0,0,0)', labelTextColor, maxAnisotropy, 24);
      oLabel.position.set(-0.45, -0.35, 0.35);
      contentGroup.add(oLabel);

      // +X (Red), +Y (Green, mapped to Three -Z), +Z (Blue, mapped to Three +Y)
      const negAxisMat = new THREE.LineBasicMaterial({
        color: isDark ? 0x475569 : 0x94a3b8,
        transparent: true,
        opacity: 0.55,
      });
      const negGeo = new THREE.BufferGeometry().setFromPoints([
        mathToThree(-axisSpan, 0, 0),
        mathToThree(0, 0, 0),
        mathToThree(0, -axisSpan, 0),
        mathToThree(0, 0, 0),
        mathToThree(0, 0, -axisSpan * 0.7),
        mathToThree(0, 0, 0),
      ]);
      contentGroup.add(new THREE.LineSegments(negGeo, negAxisMat));

      contentGroup.add(
        createArrowMesh(mathToThree(0, 0, 0), mathToThree(axisSpan, 0, 0), '#dc2626', 0.032),
        createArrowMesh(mathToThree(0, 0, 0), mathToThree(0, axisSpan, 0), '#059669', 0.032),
        createArrowMesh(mathToThree(0, 0, 0), mathToThree(0, 0, axisSpan * 0.85), '#2563eb', 0.032)
      );

      const xLbl = createTextSprite('X', '#dc2626', maxAnisotropy, 30);
      xLbl.position.copy(mathToThree(axisSpan + 0.45, 0, 0));
      const yLbl = createTextSprite('Y', '#059669', maxAnisotropy, 30);
      yLbl.position.copy(mathToThree(0, axisSpan + 0.45, 0));
      const zLbl = createTextSprite('Z', '#2563eb', maxAnisotropy, 30);
      zLbl.position.copy(mathToThree(0, 0, axisSpan * 0.85 + 0.45));
      contentGroup.add(xLbl, yLbl, zLbl);

      // Tick numbers along X, Y, Z
      const tickStep = axisSpan <= 5 ? 1 : 2;
      for (let v = -Math.floor(axisSpan); v <= Math.floor(axisSpan); v += tickStep) {
        if (v === 0) continue;
        const tx = createTextSprite(String(v), labelTextColor, maxAnisotropy, 20);
        tx.position.copy(mathToThree(v, 0, -0.25));
        const ty = createTextSprite(String(v), labelTextColor, maxAnisotropy, 20);
        ty.position.copy(mathToThree(-0.25, v, 0));
        contentGroup.add(tx, ty);
      }

      // Surface 3D: z = f(x, y)
      if (chartType === 'surface_3d' && functions.length > 0) {
        const primaryFn = functions.find((f) => f.visible) || functions[0];
        if (primaryFn) {
          const grid = sampleSurface3D(primaryFn.expr, mathParams, xRange, yRange, 44);
          const { cols, rows, xValues, yValues, zGrid, zMin, zMax } = grid;
          const zRangeSpan = Math.max(1e-5, zMax - zMin);
          // Scale tall surfaces gently so they fit nicely inside Oxyz frame
          const zScale = zRangeSpan > axisSpan * 2.2 ? (axisSpan * 1.4) / zRangeSpan : 1;

          const positions: number[] = [];
          const colors: number[] = [];
          const indices: number[] = [];
          const c = new THREE.Color();

          for (let iy = 0; iy <= rows; iy++) {
            for (let ix = 0; ix <= cols; ix++) {
              const mx = xValues[ix];
              const my = yValues[iy];
              const rawZ = zGrid[iy][ix];
              const safeZ = Number.isFinite(rawZ) ? rawZ * zScale : 0;
              const v3 = mathToThree(mx, my, safeZ);
              positions.push(v3.x, v3.y, v3.z);

              const tNorm = Number.isFinite(rawZ) ? (rawZ - zMin) / zRangeSpan : 0.5;
              heightColormap(tNorm, c);
              colors.push(c.r, c.g, c.b);
            }
          }

          for (let iy = 0; iy < rows; iy++) {
            for (let ix = 0; ix < cols; ix++) {
              const a = iy * (cols + 1) + ix;
              const b = a + 1;
              const cIdx = (iy + 1) * (cols + 1) + ix;
              const d = cIdx + 1;
              if (
                Number.isFinite(zGrid[iy][ix]) &&
                Number.isFinite(zGrid[iy][ix + 1]) &&
                Number.isFinite(zGrid[iy + 1][ix]) &&
                Number.isFinite(zGrid[iy + 1][ix + 1])
              ) {
                indices.push(a, b, d, a, d, cIdx);
              }
            }
          }

          const surfGeo = new THREE.BufferGeometry();
          surfGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          surfGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          surfGeo.setIndex(indices);
          surfGeo.computeVertexNormals();

          const surfMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.42,
            metalness: 0.08,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: wireframe ? 0.45 : 0.9,
          });
          const surfMesh = new THREE.Mesh(surfGeo, surfMat);
          surfMesh.userData = {
            isSurface: true,
            label: `z = ${primaryFn.expr}`,
            baseEmissive: 0x000000,
          };
          registerPickable(surfMesh);
          contentGroup.add(surfMesh);

          if (wireframe) {
            const wireMat = new THREE.MeshBasicMaterial({
              color: isDark ? 0xe4e4e7 : 0x0f172a,
              wireframe: true,
              transparent: true,
              opacity: 0.38,
            });
            contentGroup.add(new THREE.Mesh(surfGeo.clone(), wireMat));
          }
        }
      } else {
        // 3D Parametric curves OR 2D functions extruded/placed cleanly in Oxyz
        functions
          .filter((f) => f.visible)
          .forEach((fn, fIdx) => {
            if (fn.zExpr || chartType === 'parametric_3d') {
              const fx = compileMathExpression(fn.xExpr || 'cos(t)');
              const fy = compileMathExpression(fn.yExpr || 'sin(t)');
              const fz = compileMathExpression(fn.zExpr || fn.expr || 't/3');
              const [t0, t1] = fn.tRange || [-Math.PI * 2, Math.PI * 2];
              const pts: THREE.Vector3[] = [];
              for (let i = 0; i <= 180; i++) {
                const t = t0 + ((t1 - t0) * i) / 180;
                const mx = fx({ ...mathParams, t, theta: t });
                const my = fy({ ...mathParams, t, theta: t });
                const mz = fz({ ...mathParams, t, theta: t });
                if (Number.isFinite(mx) && Number.isFinite(my) && Number.isFinite(mz)) {
                  pts.push(mathToThree(mx, my, mz));
                }
              }
              if (pts.length >= 2) {
                const curve = new THREE.CatmullRomCurve3(pts);
                const tubeGeo = new THREE.TubeGeometry(curve, Math.min(200, pts.length * 2), 0.055, 10, false);
                const tubeMat = new THREE.MeshStandardMaterial({
                  color: fn.color || PALETTE[fIdx % PALETTE.length],
                  roughness: 0.35,
                  metalness: 0.15,
                });
                const mesh = new THREE.Mesh(tubeGeo, tubeMat);
                mesh.userData = {
                  label: fn.label,
                  detail: `Đường cong 3D`,
                  color: fn.color,
                  baseEmissive: 0x000000,
                };
                registerPickable(mesh);
                contentGroup.add(mesh);
              }
            } else {
              const segs =
                fn.isParametric && fn.xExpr && fn.yExpr
                  ? sampleParametric2D(
                      fn.xExpr,
                      fn.yExpr,
                      mathParams,
                      fn.tRange?.[0] ?? 0,
                      fn.tRange?.[1] ?? Math.PI * 2,
                      180
                    )
                  : sampleFunction2D(fn.expr, mathParams, xRange[0], xRange[1], 180, 30);

              segs.forEach((seg) => {
                const pts = seg.points
                  .filter(([, py]) => Math.abs(py) <= axisSpan * 2.5)
                  .map(([px, py]) => mathToThree(px, py, fIdx * 0.08));
                if (pts.length < 2) return;
                const curve = new THREE.CatmullRomCurve3(pts);
                const tubeGeo = new THREE.TubeGeometry(curve, Math.min(180, pts.length), 0.05, 8, false);
                const tubeMat = new THREE.MeshStandardMaterial({
                  color: fn.color || PALETTE[fIdx % PALETTE.length],
                  roughness: 0.35,
                  metalness: 0.12,
                });
                const mesh = new THREE.Mesh(tubeGeo, tubeMat);
                mesh.userData = {
                  label: fn.label,
                  detail: `y = ${fn.expr} (mặt Oxy)`,
                  color: fn.color,
                  baseEmissive: 0x000000,
                };
                registerPickable(mesh);
                contentGroup.add(mesh);
              });
            }
          });
      }

      // 3D Vectors
      const activeVecs = vectors.filter((v) => v.visible);
      activeVecs.forEach((v) => {
        const start = mathToThree(v.origin[0], v.origin[1], v.origin[2]);
        const tipMath: [number, number, number] = [
          v.origin[0] + v.components[0],
          v.origin[1] + v.components[1],
          v.origin[2] + v.components[2],
        ];
        const end = mathToThree(tipMath[0], tipMath[1], tipMath[2]);
        const len = Math.hypot(v.components[0], v.components[1], v.components[2]);
        const detail = `(${formatChartNumber(v.components[0])}, ${formatChartNumber(v.components[1])}, ${formatChartNumber(v.components[2])}) · |${v.label}| = ${len.toFixed(2)}`;

        const arrow = createArrowMesh(start, end, v.color, 0.055, {
          label: `Vector ${v.label}`,
          detail,
          color: v.color,
          baseEmissive: 0x000000,
        });
        arrow.children.forEach(registerPickable);
        contentGroup.add(arrow);

        // Coordinate projection drop lines onto Oxy plane for Z != 0
        if (Math.abs(tipMath[2]) > 0.05) {
          const dropMat = new THREE.LineDashedMaterial({
            color: v.color,
            dashSize: 0.18,
            gapSize: 0.12,
            transparent: true,
            opacity: 0.55,
          });
          const projPt = mathToThree(tipMath[0], tipMath[1], 0);
          const dropGeo = new THREE.BufferGeometry().setFromPoints([
            end,
            projPt,
            projPt,
            mathToThree(tipMath[0], 0, 0),
            projPt,
            mathToThree(0, tipMath[1], 0),
          ]);
          const dropLines = new THREE.LineSegments(dropGeo, dropMat);
          dropLines.computeLineDistances();
          contentGroup.add(dropLines);
        }

        const lbl = createTextSprite(
          `${v.label}(${formatChartNumber(v.components[0])},${formatChartNumber(v.components[1])},${formatChartNumber(v.components[2])})`,
          v.color,
          maxAnisotropy,
          24,
          labelBg
        );
        lbl.position.copy(end).add(new THREE.Vector3(0, 0.35, 0));
        contentGroup.add(lbl);
      });

      // Sum & Cross Product vectors in 3D
      if (activeVecs.length >= 2) {
        const analysis = analyzeVectors(activeVecs);
        if (showVectorSum && analysis.sum) {
          const s = analysis.sum;
          const end = mathToThree(s[0], s[1], s[2]);
          const arrow = createArrowMesh(mathToThree(0, 0, 0), end, '#7c3aed', 0.05, {
            label: 'Tổng u + v',
            detail: `(${formatChartNumber(s[0])}, ${formatChartNumber(s[1])}, ${formatChartNumber(s[2])})`,
            color: '#7c3aed',
            baseEmissive: 0x000000,
          });
          arrow.children.forEach(registerPickable);
          contentGroup.add(arrow);
          const lbl = createTextSprite(
            `u+v(${formatChartNumber(s[0])},${formatChartNumber(s[1])},${formatChartNumber(s[2])})`,
            '#7c3aed',
            maxAnisotropy,
            23,
            labelBg
          );
          lbl.position.copy(end).add(new THREE.Vector3(0, 0.35, 0));
          contentGroup.add(lbl);
        }
        if (showCrossProduct && analysis.cross) {
          const c = analysis.cross;
          const end = mathToThree(c[0], c[1], c[2]);
          const arrow = createArrowMesh(mathToThree(0, 0, 0), end, '#db2777', 0.05, {
            label: 'Tích có hướng u × v',
            detail: `(${formatChartNumber(c[0])}, ${formatChartNumber(c[1])}, ${formatChartNumber(c[2])})`,
            color: '#db2777',
            baseEmissive: 0x000000,
          });
          arrow.children.forEach(registerPickable);
          contentGroup.add(arrow);
          const lbl = createTextSprite(
            `u×v(${formatChartNumber(c[0])},${formatChartNumber(c[1])},${formatChartNumber(c[2])})`,
            '#db2777',
            maxAnisotropy,
            23,
            labelBg
          );
          lbl.position.copy(end).add(new THREE.Vector3(0, 0.35, 0));
          contentGroup.add(lbl);
        }
      }

      // Highlighted Points in Oxyz
      points.forEach((pt) => {
        const pos = mathToThree(pt.coords[0], pt.coords[1], pt.coords[2]);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 18, 18),
          new THREE.MeshStandardMaterial({ color: pt.color, roughness: 0.35, metalness: 0.15 })
        );
        mesh.position.copy(pos);
        mesh.userData = {
          label: pt.label,
          detail: `(${formatChartNumber(pt.coords[0])}, ${formatChartNumber(pt.coords[1])}, ${formatChartNumber(pt.coords[2])})`,
          color: pt.color,
          baseEmissive: 0x000000,
        };
        registerPickable(mesh);
        contentGroup.add(mesh);
      });
    } else {
      // ==================== 3D DATA VISUALIZATION MODE ====================
      const rawData = Array.isArray(payload.data) ? payload.data : [];
      const xAxis = payload.xAxis || 'name';
      const yAxis = payload.yAxis || 'value';
      const activeSeries = (
        Array.isArray(payload.series) && payload.series.length > 0
          ? payload.series
          : payload.barSeries && payload.barSeries.length > 0
          ? [...payload.barSeries, ...(payload.lineSeries || [])]
          : [yAxis]
      ).filter((s) => !hiddenSeries[s]);

      const stageGrid = new THREE.GridHelper(12, 12, gridColor1, gridColor2);
      stageGrid.position.y = -0.005;
      contentGroup.add(stageGrid);

      if (chartType === 'pie' || chartType === 'donut') {
        const items = rawData.slice(0, 14).map((d, idx) => ({
          name: String(d[xAxis] ?? d.name ?? d.label ?? `#${idx + 1}`),
          value: Math.max(0, Number(d[yAxis] ?? d.value ?? 0) || 0),
          color: PALETTE[idx % PALETTE.length],
        }));
        const total = items.reduce((a, b) => a + b.value, 0) || 1;
        let angle = 0;
        const outerR = 3.2;
        const innerR = chartType === 'donut' ? 1.55 : 0.04;

        items.forEach((item) => {
          const sweep = (item.value / total) * Math.PI * 2;
          if (sweep < 0.01) return;
          const shape = new THREE.Shape();
          shape.absarc(0, 0, outerR, angle, angle + sweep - 0.015, false);
          shape.absarc(0, 0, innerR, angle + sweep - 0.015, angle, true);
          shape.closePath();

          const height = 0.5 + (item.value / total) * 1.4;
          const geo = new THREE.ExtrudeGeometry(shape, {
            depth: height,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.04,
            bevelSegments: 2,
          });
          geo.rotateX(-Math.PI / 2);

          const mat = new THREE.MeshStandardMaterial({
            color: item.color,
            roughness: 0.35,
            metalness: 0.14,
          });
          const sliceMesh = new THREE.Mesh(geo, mat);
          sliceMesh.castShadow = true;
          sliceMesh.receiveShadow = true;
          sliceMesh.userData = {
            label: item.name,
            detail: `${formatChartNumber(item.value)} (${((item.value / total) * 100).toFixed(1)}%)`,
            color: item.color,
            liftOnHover: true,
            baseY: 0,
            baseEmissive: 0x000000,
          };
          registerPickable(sliceMesh);
          contentGroup.add(sliceMesh);

          const midAngle = angle + sweep / 2;
          const lbl = createTextSprite(
            `${item.name}: ${((item.value / total) * 100).toFixed(0)}%`,
            labelTextColor,
            maxAnisotropy,
            21,
            labelBg
          );
          lbl.position.set(Math.cos(midAngle) * 2.45, height + 0.55, -Math.sin(midAngle) * 2.45);
          contentGroup.add(lbl);

          angle += sweep;
        });
      } else if (chartType === 'heatmap' && Array.isArray(payload.matrix)) {
        const matrix = payload.matrix;
        const rows = matrix.length;
        const cols = matrix[0]?.length || 1;
        const flat = matrix.flat().map(Number).filter(Number.isFinite);
        const minVal = Math.min(...flat, 0);
        const maxVal = Math.max(...flat, 1);
        const span = Math.max(1e-5, maxVal - minVal);
        const cellSpacing = Math.min(1.1, 8.5 / Math.max(rows, cols));
        const c = new THREE.Color();

        matrix.forEach((row, rIdx) => {
          row.forEach((rawV, cIdx) => {
            const val = Number(rawV) || 0;
            const norm = (val - minVal) / span;
            const h = 0.15 + norm * 3.8;
            heightColormap(norm, c);
            const geo = new THREE.BoxGeometry(cellSpacing * 0.86, h, cellSpacing * 0.86);
            const mat = new THREE.MeshStandardMaterial({
              color: c.getHex(),
              roughness: 0.38,
              metalness: 0.12,
            });
            const bar = new THREE.Mesh(geo, mat);
            bar.position.set(
              (cIdx - (cols - 1) / 2) * cellSpacing,
              h / 2,
              (rIdx - (rows - 1) / 2) * cellSpacing
            );
            bar.userData = {
              label: `${payload.yLabels?.[rIdx] || `Hàng ${rIdx + 1}`} × ${payload.xLabels?.[cIdx] || `Cột ${cIdx + 1}`}`,
              detail: `Giá trị: ${formatChartNumber(val)}`,
              color: `#${c.getHexString()}`,
              baseEmissive: 0x000000,
            };
            registerPickable(bar);
            contentGroup.add(bar);
          });
        });
      } else if (chartType === 'scatter' || chartType === 'bubble' || chartType === 'scatter_3d') {
        const xKey = payload.xAxis || 'x';
        const yKey = payload.yAxis || 'y';
        const zKey = payload.zAxis || 'z';
        const pts = rawData.slice(0, 120);
        const xs = pts.map((d) => Number(d[xKey] ?? d.x ?? 0) || 0);
        const ys = pts.map((d) => Number(d[yKey] ?? d.y ?? d.value ?? 0) || 0);
        const zs = pts.map((d) => Number(d[zKey] ?? d.z ?? 0) || 0);
        const maxAbsX = Math.max(1, ...xs.map(Math.abs));
        const maxAbsY = Math.max(1, ...ys.map(Math.abs));
        const maxAbsZ = Math.max(1, ...zs.map(Math.abs));

        pts.forEach((d, idx) => {
          const vx = Number(d[xKey] ?? d.x ?? 0) || 0;
          const vy = Number(d[yKey] ?? d.y ?? d.value ?? 0) || 0;
          const vz = Number(d[zKey] ?? d.z ?? 0) || 0;
          const px = (vx / maxAbsX) * 4.5;
          const py = ((vy / maxAbsY) * 2.5) + 2.5;
          const pz = -(vz / maxAbsZ) * 4.5;
          const radius = chartType === 'bubble' ? 0.25 : 0.17;
          const color = PALETTE[idx % PALETTE.length];

          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 18, 18),
            new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15 })
          );
          sphere.position.set(px, py, pz);
          sphere.userData = {
            label: String(d.name || d.label || `Điểm #${idx + 1}`),
            detail: `${xKey}=${formatChartNumber(vx)}, ${yKey}=${formatChartNumber(vy)}${d[zKey] !== undefined || d.z !== undefined ? `, ${zKey}=${formatChartNumber(vz)}` : ''}`,
            color,
            baseEmissive: 0x000000,
          };
          registerPickable(sphere);
          contentGroup.add(sphere);

          const stemGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(px, 0, pz),
            new THREE.Vector3(px, py, pz),
          ]);
          contentGroup.add(
            new THREE.Line(
              stemGeo,
              new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 })
            )
          );
        });
      } else if (chartType === 'network') {
        const net = computeNetworkLayout(payload, 10, 10);
        const nodePos = new Map<string, THREE.Vector3>();
        const groupMap = new Map<string, number>();
        net.nodes.forEach((n, idx) => {
          if (!groupMap.has(n.group)) groupMap.set(n.group, groupMap.size);
          const groupIdx = groupMap.get(n.group) ?? 0;
          const pos = new THREE.Vector3(
            n.x - 5,
            1.4 + Math.sin(idx * 1.7) * 1.1,
            n.y - 5
          );
          nodePos.set(n.id, pos);
          const color = PALETTE[groupIdx % PALETTE.length];
          const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(Math.max(0.18, Math.min(0.48, (n.size || 10) * 0.02)), 18, 18),
            new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 })
          );
          sphere.position.copy(pos);
          sphere.userData = {
            label: n.label,
            detail: `Nhóm ${n.group} · Size: ${n.size}`,
            color,
            baseEmissive: 0x000000,
          };
          registerPickable(sphere);
          contentGroup.add(sphere);
        });
        net.edges.forEach((edge) => {
          const p1 = nodePos.get(edge.source);
          const p2 = nodePos.get(edge.target);
          if (!p1 || !p2) return;
          const curve = new THREE.LineCurve3(p1, p2);
          const tube = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 4, 0.03, 6, false),
            new THREE.MeshStandardMaterial({ color: isDark ? 0x64748b : 0x94a3b8, roughness: 0.6 })
          );
          contentGroup.add(tube);
        });
      } else if (chartType === 'candlestick' || chartType === 'ohlc') {
        const candles = rawData.slice(0, 36);
        const highs = candles.map((c) => Number(c.high ?? c.h ?? c.close ?? 0) || 0);
        const lows = candles.map((c) => Number(c.low ?? c.l ?? c.open ?? 0) || 0);
        const minP = Math.min(...lows);
        const maxP = Math.max(...highs);
        const span = Math.max(1e-5, maxP - minP);
        const stepX = Math.min(0.65, 9.5 / Math.max(1, candles.length));

        candles.forEach((c, idx) => {
          const open = Number(c.open ?? c.o ?? 0) || 0;
          const close = Number(c.close ?? c.c ?? 0) || 0;
          const high = Number(c.high ?? c.h ?? Math.max(open, close)) || 0;
          const low = Number(c.low ?? c.l ?? Math.min(open, close)) || 0;
          const up = close >= open;
          const color = up ? '#10b981' : '#ef4444';
          const px = (idx - (candles.length - 1) / 2) * stepX;

          const yLow = ((low - minP) / span) * 4.2 + 0.3;
          const yHigh = ((high - minP) / span) * 4.2 + 0.3;
          const yBot = ((Math.min(open, close) - minP) / span) * 4.2 + 0.3;
          const yTop = ((Math.max(open, close) - minP) / span) * 4.2 + 0.3;
          const bodyH = Math.max(0.08, yTop - yBot);

          const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
          const wick = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, Math.max(0.1, yHigh - yLow), 8),
            mat
          );
          wick.position.set(px, (yLow + yHigh) / 2, 0);
          contentGroup.add(wick);

          const body = new THREE.Mesh(
            new THREE.BoxGeometry(stepX * 0.62, bodyH, stepX * 0.62),
            mat
          );
          body.position.set(px, yBot + bodyH / 2, 0);
          body.userData = {
            label: String(c.date || c.time || c.name || `Nến #${idx + 1}`),
            detail: `O:${formatChartNumber(open)} H:${formatChartNumber(high)} L:${formatChartNumber(low)} C:${formatChartNumber(close)}`,
            color,
            baseEmissive: 0x000000,
          };
          registerPickable(body);
          contentGroup.add(body);
        });
      } else {
        // Default 3D Columns / Ribbons for bar, grouped_bar, stacked_bar, line, area, combo, histogram, waterfall
        const rows = rawData.slice(0, 28);
        const seriesList = activeSeries.length > 0 ? activeSeries : [yAxis];
        const allVals = rows.flatMap((r) => seriesList.map((s) => Number(r?.[s] ?? r?.value ?? 0) || 0));
        const maxVal = Math.max(1, ...allVals.map(Math.abs));
        const colSpacing = Math.min(1.25, 9.6 / Math.max(1, rows.length));
        const laneSpacing = Math.min(1.5, 6 / Math.max(1, seriesList.length));

        seriesList.forEach((sKey, sIdx) => {
          const color = PALETTE[sIdx % PALETTE.length];
          const zPos = (sIdx - (seriesList.length - 1) / 2) * laneSpacing;

          if (chartType === 'line' || chartType === 'area' || chartType === 'stacked_area') {
            const curvePts: THREE.Vector3[] = [];
            rows.forEach((r, rIdx) => {
              const val = Number(r?.[sKey] ?? r?.value ?? 0) || 0;
              const px = (rIdx - (rows.length - 1) / 2) * colSpacing;
              const py = Math.max(0.08, (Math.abs(val) / maxVal) * 4.4);
              curvePts.push(new THREE.Vector3(px, py, zPos));

              const node = new THREE.Mesh(
                new THREE.SphereGeometry(0.11, 14, 14),
                new THREE.MeshStandardMaterial({ color, roughness: 0.35 })
              );
              node.position.set(px, py, zPos);
              node.userData = {
                label: `${String(r?.[xAxis] ?? r?.name ?? `#${rIdx + 1}`)} · ${sKey}`,
                detail: `${formatChartNumber(val)}`,
                color,
                baseEmissive: 0x000000,
              };
              registerPickable(node);
              contentGroup.add(node);
            });
            if (curvePts.length >= 2) {
              const curve = new THREE.CatmullRomCurve3(curvePts);
              const tube = new THREE.Mesh(
                new THREE.TubeGeometry(curve, Math.max(24, curvePts.length * 4), 0.06, 8, false),
                new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.12 })
              );
              contentGroup.add(tube);
            }
          } else {
            rows.forEach((r, rIdx) => {
              const val = Number(r?.[sKey] ?? r?.value ?? 0) || 0;
              const h = Math.max(0.12, (Math.abs(val) / maxVal) * 4.4);
              const px = (rIdx - (rows.length - 1) / 2) * colSpacing;
              const barGeo = new THREE.BoxGeometry(colSpacing * 0.62, h, Math.max(0.45, laneSpacing * 0.65));
              const barMat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.38,
                metalness: 0.12,
              });
              const mesh = new THREE.Mesh(barGeo, barMat);
              mesh.position.set(px, h / 2, zPos);
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              mesh.userData = {
                label: `${String(r?.[xAxis] ?? r?.name ?? `#${rIdx + 1}`)} · ${sKey}`,
                detail: `${formatChartNumber(val)}${payload.unit ? ` ${payload.unit}` : ''}`,
                color,
                baseEmissive: 0x000000,
              };
              registerPickable(mesh);
              contentGroup.add(mesh);
            });
          }
        });

        // Category labels along front X edge
        const labelStep = Math.max(1, Math.ceil(rows.length / 8));
        rows.forEach((r, rIdx) => {
          if (rIdx % labelStep !== 0) return;
          const px = (rIdx - (rows.length - 1) / 2) * colSpacing;
          const lbl = createTextSprite(
            String(r?.[xAxis] ?? r?.name ?? `#${rIdx + 1}`).slice(0, 12),
            labelTextColor,
            maxAnisotropy,
            20
          );
          lbl.position.set(px, 0.05, (seriesList.length * laneSpacing) / 2 + 0.75);
          contentGroup.add(lbl);
        });
      }
    }

    state.pickables = pickables;
    requestRender();
  }, [
    chartType,
    payload,
    isDark,
    hiddenSeries,
    functions,
    vectors,
    points,
    mathParams,
    xRange,
    yRange,
    showVectorSum,
    showCrossProduct,
    wireframe,
  ]);

  const applyCameraPreset = (preset: CameraPreset) => {
    const state = sceneRefs.current;
    if (!state) return;
    const target = new THREE.Vector3(0, 0.4, 0);
    if (preset === 'iso') {
      state.glideTo(defaultCameraPos, target);
    } else if (preset === 'xy') {
      // Looking straight down +Z onto Oxy plane (Three +Y)
      state.glideTo(new THREE.Vector3(0, 13.5, 0.01), new THREE.Vector3(0, 0, 0));
    } else if (preset === 'xz') {
      // Front view looking onto X-Z plane (along Math +Y -> Three -Z)
      state.glideTo(new THREE.Vector3(0, 1.2, 13.5), new THREE.Vector3(0, 1.0, 0));
    } else if (preset === 'yz') {
      // Side view looking along X axis
      state.glideTo(new THREE.Vector3(13.5, 1.2, 0), new THREE.Vector3(0, 1.0, 0));
    }
  };

  const exportPng = () => {
    const state = sceneRefs.current;
    if (!state) return;
    state.renderer.render(state.scene, state.camera);
    const dataUrl = state.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `chart-3d-${chartType}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const btnCls = `px-2 py-1 text-[10px] font-medium rounded border transition-colors whitespace-nowrap ${
    isDark
      ? 'border-zinc-700 bg-zinc-900/95 text-zinc-200 hover:bg-zinc-800'
      : 'border-zinc-200 bg-white/95 text-zinc-700 hover:bg-zinc-100'
  }`;

  return (
    <div
      className={`relative w-full ${
        isFullscreen ? 'h-[calc(100dvh-160px)] min-h-[400px]' : 'h-[390px]'
      } rounded border overflow-hidden ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-slate-50'}`}
    >
      {/* Dedicated empty Three.js WebGL mount container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Top-left non-occluding readout (solid rgba, NO backdrop-filter over WebGL) */}
      <div
        className={`pointer-events-none absolute top-2.5 left-2.5 px-2.5 py-1.5 rounded border text-[11px] font-mono max-w-[75%] ${
          isDark
            ? 'border-zinc-700 bg-zinc-900/95 text-zinc-200'
            : 'border-zinc-200 bg-white/95 text-zinc-800'
        }`}
      >
        {readout ? (
          <div className="flex items-center gap-2 truncate">
            {readout.color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: readout.color }}
              />
            )}
            <span className="font-semibold truncate">{readout.title}</span>
            {readout.detail && (
              <span className={`tabular-nums truncate ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                · {readout.detail}
              </span>
            )}
          </div>
        ) : (
          <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
            Kéo để xoay 360° · Cuộn để thu phóng · Di chuột lên vật thể để xem tọa độ
          </span>
        )}
      </div>

      {/* Collapsible bottom dock (zero viewport center occlusion) */}
      <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 max-w-[95%]">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium ${
            isDark
              ? 'border-zinc-700 bg-zinc-900/95 text-zinc-400 hover:text-zinc-200'
              : 'border-zinc-200 bg-white/95 text-zinc-600 hover:text-zinc-900'
          }`}
        >
          {dockCollapsed ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          <span>{dockCollapsed ? 'Góc nhìn 3D' : 'Thu gọn'}</span>
        </button>

        {!dockCollapsed && (
          <div
            className={`flex flex-wrap items-center justify-center gap-1 px-2 py-1.5 rounded border ${
              isDark
                ? 'border-zinc-700 bg-zinc-900/95'
                : 'border-zinc-200 bg-white/95'
            }`}
          >
            <button type="button" onClick={() => applyCameraPreset('iso')} className={btnCls}>
              Iso
            </button>
            <button type="button" onClick={() => applyCameraPreset('xy')} className={btnCls}>
              Mặt Oxy
            </button>
            <button type="button" onClick={() => applyCameraPreset('xz')} className={btnCls}>
              Mặt Oxz
            </button>
            <button type="button" onClick={() => applyCameraPreset('yz')} className={btnCls}>
              Mặt Oyz
            </button>
            {chartType === 'surface_3d' && (
              <button
                type="button"
                onClick={() => setWireframe((w) => !w)}
                className={`${btnCls} inline-flex items-center gap-1 ${
                  wireframe ? (isDark ? 'border-blue-500 text-blue-400' : 'border-blue-600 text-blue-600') : ''
                }`}
              >
                <Grid size={11} />
                <span>Lưới</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setReadout(null);
                applyCameraPreset('iso');
              }}
              className={`${btnCls} inline-flex items-center gap-1`}
            >
              <RotateCcw size={11} />
              <span>Đặt lại</span>
            </button>
            <button
              type="button"
              onClick={exportPng}
              className={`${btnCls} inline-flex items-center gap-1`}
              title="Lưu ảnh 3D PNG"
            >
              <Camera size={11} />
              <span>PNG</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
