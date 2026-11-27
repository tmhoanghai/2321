import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Box, Eye, Image as ImageIcon, Maximize2, Minimize2, Play, Pause, RotateCcw, Sliders, Sun } from 'lucide-react';
import {
  computePhysicsSummary,
  ExtractedImageReliefGeometry,
  extractHeightmapGeometryFromPixels,
  generate4DPolytopeFrame,
  generate5DPolytopeFrame,
  Model3DPart,
  Model3DSpec,
  ModelPhysicsSummary,
  parseModel3DPayload,
} from '../lib/model3dEngine';
import { resolveImageDisplaySrc } from '../lib/fileGenerator';
import { acquireFullscreenLock, releaseFullscreenLock } from '../lib/fullscreenBus';

export interface Model3DPanelProps {
  config: string;
  theme?: 'dark' | 'light';
  attachedImages?: Record<string, string>;
}

interface MaterialOverrideState {
  metalness: number;
  roughness: number;
  emissiveIntensity: number;
  opacity: number;
  useOverride: boolean;
}

interface LightingControlState {
  pointEnabled: boolean;
  pointIntensity: number;
  dirEnabled: boolean;
  dirIntensity: number;
  aoEnabled: boolean;
  aoIntensity: number;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.30)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function buildCannonShapeForPart(part: Model3DPart, halfExtents: THREE.Vector3): CANNON.Shape {
  const maxScale = Math.max(Math.abs(part.scale[0]), Math.abs(part.scale[1]), Math.abs(part.scale[2]), 0.1);
  if (part.type === 'sphere' || part.type === 'icosahedron' || part.type === 'dodecahedron' || part.type === 'octahedron') {
    const radius = Math.max(0.05, (part.size[0] ?? 0.65) * maxScale);
    return new CANNON.Sphere(radius);
  }
  if (part.type === 'cylinder') {
    const rTop = Math.max(0.03, (part.size[0] ?? 0.4) * Math.abs(part.scale[0]));
    const rBot = Math.max(0.03, (part.size[1] ?? part.size[0] ?? 0.4) * Math.abs(part.scale[0]));
    const height = Math.max(0.06, (part.size[2] ?? 1.2) * Math.abs(part.scale[1]));
    return new CANNON.Cylinder(rTop, rBot, height, 12);
  }
  return new CANNON.Box(
    new CANNON.Vec3(
      Math.max(0.04, halfExtents.x),
      Math.max(0.04, halfExtents.y),
      Math.max(0.04, halfExtents.z)
    )
  );
}

function buildThreeGeometry(part: Model3DPart, lowDetail: boolean): THREE.BufferGeometry {
  const seg = lowDetail ? 16 : 28;
  const s = part.size;
  switch (part.type) {
    case 'sphere':
      return new THREE.SphereGeometry(Math.max(0.05, s[0] ?? 0.65), seg, seg);
    case 'cylinder':
      return new THREE.CylinderGeometry(
        Math.max(0.01, s[0] ?? 0.4),
        Math.max(0.01, s[1] ?? s[0] ?? 0.4),
        Math.max(0.05, s[2] ?? 1.2),
        seg
      );
    case 'cone':
      return new THREE.ConeGeometry(Math.max(0.05, s[0] ?? 0.6), Math.max(0.05, s[1] ?? 1.2), seg);
    case 'torus':
      return new THREE.TorusGeometry(
        Math.max(0.1, s[0] ?? 0.8),
        Math.max(0.02, s[1] ?? 0.2),
        lowDetail ? 12 : 20,
        lowDetail ? 28 : 48
      );
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(
        Math.max(0.1, s[0] ?? 0.7),
        Math.max(0.02, s[1] ?? 0.18),
        lowDetail ? 48 : 88,
        lowDetail ? 10 : 16
      );
    case 'octahedron':
      return new THREE.OctahedronGeometry(Math.max(0.05, s[0] ?? 0.7), 0);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(Math.max(0.05, s[0] ?? 0.7), 0);
    case 'dodecahedron':
      return new THREE.DodecahedronGeometry(Math.max(0.05, s[0] ?? 0.7), 0);
    case 'capsule':
      return new THREE.CapsuleGeometry(
        Math.max(0.03, s[0] ?? 0.35),
        Math.max(0.05, s[1] ?? 0.9),
        lowDetail ? 6 : 10,
        seg
      );
    case 'lathe': {
      const pts =
        part.points2d && part.points2d.length >= 2
          ? part.points2d.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y))
          : [
              new THREE.Vector2(0.05, -0.6),
              new THREE.Vector2(0.55, -0.2),
              new THREE.Vector2(0.42, 0.25),
              new THREE.Vector2(0.62, 0.6),
            ];
      return new THREE.LatheGeometry(pts, seg);
    }
    case 'tube': {
      const curvePts =
        part.curvePoints && part.curvePoints.length >= 2
          ? part.curvePoints.map(([x, y, z]) => new THREE.Vector3(x, y, z))
          : [
              new THREE.Vector3(-0.9, -0.3, 0),
              new THREE.Vector3(-0.3, 0.45, 0.35),
              new THREE.Vector3(0.4, -0.25, -0.3),
              new THREE.Vector3(0.95, 0.35, 0),
            ];
      const curve = new THREE.CatmullRomCurve3(curvePts);
      return new THREE.TubeGeometry(curve, lowDetail ? 24 : 44, Math.max(0.02, s[0] ?? 0.1), 12, false);
    }
    case 'plane':
      return new THREE.BoxGeometry(Math.max(0.05, s[0] ?? 2), Math.max(0.02, s[1] ?? 0.06), Math.max(0.05, s[2] ?? 2));
    case 'box':
    default:
      return new THREE.BoxGeometry(
        Math.max(0.05, s[0] ?? 1),
        Math.max(0.05, s[1] ?? 1),
        Math.max(0.05, s[2] ?? 1)
      );
  }
}

export const Model3DPanel: React.FC<Model3DPanelProps> = ({
  config,
  theme = 'dark',
  attachedImages,
}) => {
  const initialSpec = useMemo<Model3DSpec>(() => parseModel3DPayload(config), [config]);
  const isLight = theme === 'light';

  const mountRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [wireframe, setWireframe] = useState<boolean>(Boolean(initialSpec.wireframe));
  const [autoRotate, setAutoRotate] = useState<boolean>(Boolean(initialSpec.autoRotate));
  const [showMaterialsDrawer, setShowMaterialsDrawer] = useState<boolean>(false);
  const [showLightingDrawer, setShowLightingDrawer] = useState<boolean>(false);
  const [showPhysicsInspector, setShowPhysicsInspector] = useState<boolean>(false);
  const [physicsSimRunning, setPhysicsSimRunning] = useState<boolean>(false);
  const [liveCollisionCount, setLiveCollisionCount] = useState<number>(0);
  const [liveMaxSpeed, setLiveMaxSpeed] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const [lightingState, setLightingState] = useState<LightingControlState>({
    pointEnabled: true,
    pointIntensity: 1.8,
    dirEnabled: true,
    dirIntensity: 1.9,
    aoEnabled: true,
    aoIntensity: 0.85,
  });

  useEffect(() => {
    if (!isFullscreen) return;
    const lockToken = acquireFullscreenLock();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      releaseFullscreenLock(lockToken);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  // Surface material live sliders
  const defaultBaseMat = useMemo(() => {
    const first = initialSpec.parts[0];
    return {
      metalness: first?.metalness ?? 0.35,
      roughness: first?.roughness ?? 0.45,
      emissiveIntensity: first?.emissiveIntensity ?? 0,
      opacity: first?.opacity ?? 1,
      useOverride: false,
    };
  }, [initialSpec]);

  const [matState, setMatState] = useState<MaterialOverrideState>(defaultBaseMat);

  // Image-to-3D state
  const resolvedInitialImage = useMemo(() => {
    if (!initialSpec.imageSource) return undefined;
    return resolveImageDisplaySrc(initialSpec.imageSource, attachedImages);
  }, [initialSpec.imageSource, attachedImages]);

  const [customImageUrl, setCustomImageUrl] = useState<string | undefined>(resolvedInitialImage);
  const [imageDepthScale, setImageDepthScale] = useState<number>(0.8);
  const [extractedRelief, setExtractedRelief] = useState<ExtractedImageReliefGeometry | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  // 4D interactive projection controls
  const [xwAngle, setXwAngle] = useState<number>(
    initialSpec.model5d?.xwAngle ?? initialSpec.model4d?.xwAngle ?? 0.45
  );
  const [ywAngle, setYwAngle] = useState<number>(
    initialSpec.model5d?.ywAngle ?? initialSpec.model4d?.ywAngle ?? 0.35
  );
  const [zwAngle, setZwAngle] = useState<number>(initialSpec.model4d?.zwAngle ?? 0.2);
  const [dist4d, setDist4d] = useState<number>(
    initialSpec.model5d?.distance4d ?? initialSpec.model4d?.distance4d ?? 2.8
  );

  // 5D extra interactive projection controls
  const [xvAngle, setXvAngle] = useState<number>(initialSpec.model5d?.xvAngle ?? 0.35);
  const [wvAngle, setWvAngle] = useState<number>(initialSpec.model5d?.wvAngle ?? 0.3);
  const [dist5d, setDist5d] = useState<number>(initialSpec.model5d?.distance5d ?? 3.4);

  // Mutable Three.js & Cannon.js refs so controls update in-place without rebuilding WebGLRenderer
  const sceneObjectsRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls;
    modelGroup?: THREE.Group;
    physicsGroup?: THREE.Group;
    pointLight?: THREE.PointLight;
    keyLight?: THREE.DirectionalLight;
    rimLight?: THREE.DirectionalLight;
    hemiLight?: THREE.HemisphereLight;
    contactShadowMat?: THREE.MeshBasicMaterial;
    physicsWorld?: CANNON.World;
    groundBody?: CANNON.Body;
    meshes: Array<{
      mesh: THREE.Mesh;
      part: Model3DPart;
      material: THREE.MeshStandardMaterial;
      basePos: THREE.Vector3;
      baseQuat: THREE.Quaternion;
      simPos: THREE.Vector3;
      simVel: THREE.Vector3;
      halfExtents: THREE.Vector3;
      boxHelper?: THREE.Box3Helper;
      arrowHelper?: THREE.ArrowHelper;
      cannonBody?: CANNON.Body;
      defaultColorHex: number;
    }>;
    reliefMesh?: THREE.Mesh;
    reliefMat?: THREE.MeshStandardMaterial;
    polytopeLines?: THREE.LineSegments;
    polytopeVerts?: THREE.InstancedMesh;
    polytopeSurface?: THREE.Mesh;
    polytopeSurfaceMat?: THREE.MeshStandardMaterial;
    overallBoxHelper?: THREE.Box3Helper;
  }>({ meshes: [] });

  const stateRefs = useRef({
    wireframe,
    autoRotate,
    showPhysicsInspector,
    physicsSimRunning,
    lighting: lightingState,
    xwAngle,
    ywAngle,
    zwAngle,
    dist4d,
    xvAngle,
    wvAngle,
    dist5d,
  });

  stateRefs.current = {
    wireframe,
    autoRotate,
    showPhysicsInspector,
    physicsSimRunning,
    lighting: lightingState,
    xwAngle,
    ywAngle,
    zwAngle,
    dist4d,
    xvAngle,
    wvAngle,
    dist5d,
  };

  useEffect(() => {
    setCustomImageUrl(resolvedInitialImage);
  }, [resolvedInitialImage]);

  // Decode & extract 3D relief geometry whenever image source or depth changes
  useEffect(() => {
    if (!customImageUrl) {
      setExtractedRelief(null);
      return;
    }

    let cancelled = false;
    setExtractError(null);

    const img = new Image();
    if (/^https?:\/\//i.test(customImageUrl)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (cancelled) return;
      try {
        const sampleW = 64;
        const sampleH = 64;
        const canvas = document.createElement('canvas');
        canvas.width = sampleW;
        canvas.height = sampleH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setExtractError('Trình duyệt không hỗ trợ Canvas 2D để trích xuất ảnh.');
          return;
        }
        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
        const relief = extractHeightmapGeometryFromPixels(
          imgData.data,
          sampleW,
          sampleH,
          56,
          56,
          imageDepthScale,
          3.2
        );
        setExtractedRelief(relief);
      } catch {
        setExtractError('Không thể đọc pixel từ URL ảnh này do CORS. Hãy tải ảnh lên trực tiếp bằng nút "Ảnh → 3D".');
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setExtractError('Không thể tải ảnh nguồn để dựng mô hình 3D.');
      }
    };
    img.src = customImageUrl;

    return () => {
      cancelled = true;
    };
  }, [customImageUrl, imageDepthScale]);

  const handleUploadImageFor3D = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // Compute Physics summary for the active model
  const physicsSummary: ModelPhysicsSummary = useMemo(() => {
    if (extractedRelief) {
      const [minX, minY, minZ] = extractedRelief.boundsMin;
      const [maxX, maxY, maxZ] = extractedRelief.boundsMax;
      const w = Number((maxX - minX).toFixed(2));
      const h = Number((maxY - minY).toFixed(2));
      const d = Number(Math.max(0.1, maxZ - minZ).toFixed(2));
      const m = extractedRelief.estimatedMassKg;
      return {
        totalMassKg: m,
        centerOfMass: [0, 0, Number(((minZ + maxZ) / 2).toFixed(2))],
        boundsMin: [Number(minX.toFixed(2)), Number(minY.toFixed(2)), Number(minZ.toFixed(2))],
        boundsMax: [Number(maxX.toFixed(2)), Number(maxY.toFixed(2)), Number(maxZ.toFixed(2))],
        dimensions: [w, h, d],
        momentOfInertia: [
          Number(((m * (h * h + d * d)) / 12).toFixed(2)),
          Number(((m * (w * w + d * d)) / 12).toFixed(2)),
          Number(((m * (w * w + h * h)) / 12).toFixed(2)),
        ],
        partCount: 1,
        parts: [
          {
            id: 'relief-mesh',
            label: 'Khối nổi từ ảnh',
            mass: m,
            center: [0, 0, Number(((minZ + maxZ) / 2).toFixed(2))],
            halfExtents: [w / 2, h / 2, d / 2],
            velocity: [0, 0.4, 0],
            speed: 0.4,
          },
        ],
      };
    }

    if (initialSpec.category === 'shape_4d' || initialSpec.category === 'shape_5d') {
      const s =
        initialSpec.category === 'shape_5d'
          ? initialSpec.model5d?.size ?? 1.35
          : initialSpec.model4d?.size ?? 1.35;
      const massMul = initialSpec.category === 'shape_5d' ? 5.6 : 4.2;
      return {
        totalMassKg: Number((s * massMul).toFixed(2)),
        centerOfMass: [0, 0, 0],
        boundsMin: [-s * 1.4, -s * 1.4, -s * 1.4],
        boundsMax: [s * 1.4, s * 1.4, s * 1.4],
        dimensions: [Number((s * 2.8).toFixed(2)), Number((s * 2.8).toFixed(2)), Number((s * 2.8).toFixed(2))],
        momentOfInertia: [Number((s * 2.1).toFixed(2)), Number((s * 2.1).toFixed(2)), Number((s * 2.1).toFixed(2))],
        partCount: 1,
        parts: [],
      };
    }

    return computePhysicsSummary(initialSpec.parts);
  }, [extractedRelief, initialSpec]);

  // Core Three.js scene mount & disposal
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Thiết bị hoặc trình duyệt hiện không khả dụng WebGL để hiển thị mô hình 3D.');
      return;
    }

    const gl = renderer.getContext();
    const dbgInfo = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    const gpuName = dbgInfo && gl ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1.5 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 560;
    const height = container.clientHeight || 360;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isLight ? '#f4f6f8' : '#0b0e14');

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    const initLightCfg = stateRefs.current.lighting;
    scene.environmentIntensity = initLightCfg.aoEnabled
      ? Math.min(1.6, 0.35 + initLightCfg.aoIntensity * 0.7)
      : 0.12;
    roomEnv.dispose();

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);
    camera.position.set(4.2, 3.1, 5.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.2;
    controls.maxDistance = 26;

    // Dynamic Studio Lighting Rig: Ambient Occlusion (Hemisphere + IBL + Contact AO), Directional Lights, Point Light
    const hemi = new THREE.HemisphereLight(
      0xdbeafe,
      isLight ? 0xcbd5e1 : 0x1e293b,
      initLightCfg.aoEnabled ? initLightCfg.aoIntensity * 0.85 : 0.08
    );
    hemi.visible = initLightCfg.aoEnabled || (!initLightCfg.dirEnabled && !initLightCfg.pointEnabled);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1e0, initLightCfg.dirIntensity);
    keyLight.position.set(5, 8, 6);
    keyLight.visible = initLightCfg.dirEnabled;
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 28;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, initLightCfg.dirIntensity * 0.42);
    rimLight.position.set(-5, 3, -4);
    rimLight.visible = initLightCfg.dirEnabled;
    scene.add(rimLight);

    const pointLight = new THREE.PointLight(0xfef08a, initLightCfg.pointIntensity, 28, 1.3);
    pointLight.position.set(-3.2, 3.6, 3.4);
    pointLight.visible = initLightCfg.pointEnabled;
    scene.add(pointLight);

    // Subtle grounding stage + Contact Ambient Occlusion disc
    let floorMesh: THREE.Mesh | null = null;
    let contactShadowMesh: THREE.Mesh | null = null;
    let contactShadowTex: THREE.CanvasTexture | null = null;
    let contactShadowMat: THREE.MeshBasicMaterial | undefined;
    if (
      initialSpec.showFloor !== false &&
      !extractedRelief &&
      initialSpec.category !== 'shape_4d' &&
      initialSpec.category !== 'shape_5d'
    ) {
      const floorGeo = new THREE.CircleGeometry(6.5, 48);
      const floorMat = new THREE.MeshStandardMaterial({
        color: isLight ? 0xe5e7eb : 0x111827,
        roughness: 0.88,
        metalness: 0.05,
        transparent: true,
        opacity: 0.55,
      });
      floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = -0.01;
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      contactShadowTex = createContactShadowTexture();
      const shadowPlaneGeo = new THREE.PlaneGeometry(5.6, 5.6);
      contactShadowMat = new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        opacity: initLightCfg.aoEnabled ? Math.min(0.75, initLightCfg.aoIntensity * 0.42) : 0,
        depthWrite: false,
      });
      contactShadowMesh = new THREE.Mesh(shadowPlaneGeo, contactShadowMat);
      contactShadowMesh.rotation.x = -Math.PI / 2;
      contactShadowMesh.position.y = 0.002;
      scene.add(contactShadowMesh);
    }

    // Cannon.js Rigid-Body Physics World
    const physicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
    physicsWorld.allowSleep = false;

    const cannonMat = new CANNON.Material('studioMat');
    const cannonContact = new CANNON.ContactMaterial(cannonMat, cannonMat, {
      friction: 0.38,
      restitution: 0.48,
    });
    physicsWorld.addContactMaterial(cannonContact);
    physicsWorld.defaultContactMaterial = cannonContact;

    const groundBody = new CANNON.Body({
      mass: 0,
      material: cannonMat,
      shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.position.set(0, 0, 0);
    physicsWorld.addBody(groundBody);

    const modelGroup = new THREE.Group();
    const physicsGroup = new THREE.Group();
    physicsGroup.visible = stateRefs.current.showPhysicsInspector;
    scene.add(modelGroup);
    scene.add(physicsGroup);

    const disposables: Array<{ dispose: () => void }> = [];
    const meshRecords: typeof sceneObjectsRef.current.meshes = [];

    sceneObjectsRef.current = {
      renderer,
      scene,
      camera,
      controls,
      modelGroup,
      physicsGroup,
      pointLight,
      keyLight,
      rimLight,
      hemiLight: hemi,
      contactShadowMat,
      physicsWorld,
      groundBody,
      meshes: meshRecords,
    };

    if (extractedRelief) {
      // Image-to-3D relief geometry
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(extractedRelief.positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(extractedRelief.colors, 3));
      geo.setIndex(new THREE.BufferAttribute(extractedRelief.indices, 1));
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: matState.useOverride ? matState.metalness : 0.18,
        roughness: matState.useOverride ? matState.roughness : 0.52,
        emissive: new THREE.Color('#1d4ed8'),
        emissiveIntensity: matState.useOverride ? matState.emissiveIntensity : 0,
        transparent: true,
        opacity: matState.useOverride ? matState.opacity : 1,
        wireframe: stateRefs.current.wireframe,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      modelGroup.add(mesh);
      disposables.push(geo, mat);

      sceneObjectsRef.current.reliefMesh = mesh;
      sceneObjectsRef.current.reliefMat = mat;

      const box = new THREE.Box3().setFromObject(mesh);
      const boxHelper = new THREE.Box3Helper(box, 0x22d3ee);
      physicsGroup.add(boxHelper);
      sceneObjectsRef.current.overallBoxHelper = boxHelper;

      const velDir = new THREE.Vector3(0, 1, 0);
      const arrow = new THREE.ArrowHelper(velDir, new THREE.Vector3(0, 0, 0.35), 1.1, 0xf59e0b, 0.2, 0.1);
      physicsGroup.add(arrow);
      disposables.push(boxHelper, arrow);

      camera.position.set(0, 0.4, 4.6);
      controls.target.set(0, 0, 0);
      controls.update();
    } else if (
      (initialSpec.category === 'shape_4d' && initialSpec.model4d) ||
      (initialSpec.category === 'shape_5d' && initialSpec.model5d)
    ) {
      // 4D or 5D Polytope live interactive projection + optional Solid facet shell
      const is5dScene = initialSpec.category === 'shape_5d' && Boolean(initialSpec.model5d);
      const frame = is5dScene
        ? generate5DPolytopeFrame(
            {
              ...initialSpec.model5d!,
              distance5d: stateRefs.current.dist5d,
              distance4d: stateRefs.current.dist4d,
            },
            {
              xw: stateRefs.current.xwAngle,
              yw: stateRefs.current.ywAngle,
              xv: stateRefs.current.xvAngle,
              wv: stateRefs.current.wvAngle,
            }
          )
        : generate4DPolytopeFrame(
            { ...initialSpec.model4d!, distance4d: stateRefs.current.dist4d },
            {
              xw: stateRefs.current.xwAngle,
              yw: stateRefs.current.ywAngle,
              zw: stateRefs.current.zwAngle,
            }
          );

      const edgeColor = is5dScene
        ? initialSpec.model5d!.edgeColor || '#a78bfa'
        : initialSpec.model4d!.edgeColor || '#38bdf8';
      const vertexColor = is5dScene
        ? initialSpec.model5d!.vertexColor || '#f8fafc'
        : initialSpec.model4d!.vertexColor || '#f8fafc';

      const posArr = new Float32Array(frame.edges.length * 6);
      frame.edges.forEach(([a, b], idx) => {
        const va = frame.vertices[a];
        const vb = frame.vertices[b];
        posArr[idx * 6] = va[0];
        posArr[idx * 6 + 1] = va[1];
        posArr[idx * 6 + 2] = va[2];
        posArr[idx * 6 + 3] = vb[0];
        posArr[idx * 6 + 4] = vb[1];
        posArr[idx * 6 + 5] = vb[2];
      });
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(edgeColor),
        transparent: true,
        opacity: 0.92,
      });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      modelGroup.add(lines);
      disposables.push(lineGeo, lineMat);
      sceneObjectsRef.current.polytopeLines = lines;

      if (frame.faces.length > 0) {
        const facePosArr = new Float32Array(frame.faces.length * 9);
        frame.faces.forEach(([ia, ib, ic], fIdx) => {
          const va = frame.vertices[ia];
          const vb = frame.vertices[ib];
          const vc = frame.vertices[ic];
          facePosArr[fIdx * 9] = va[0];
          facePosArr[fIdx * 9 + 1] = va[1];
          facePosArr[fIdx * 9 + 2] = va[2];
          facePosArr[fIdx * 9 + 3] = vb[0];
          facePosArr[fIdx * 9 + 4] = vb[1];
          facePosArr[fIdx * 9 + 5] = vb[2];
          facePosArr[fIdx * 9 + 6] = vc[0];
          facePosArr[fIdx * 9 + 7] = vc[1];
          facePosArr[fIdx * 9 + 8] = vc[2];
        });
        const faceGeo = new THREE.BufferGeometry();
        faceGeo.setAttribute('position', new THREE.BufferAttribute(facePosArr, 3));
        faceGeo.computeVertexNormals();
        const faceMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(edgeColor),
          metalness: matState.useOverride ? matState.metalness : 0.25,
          roughness: matState.useOverride ? matState.roughness : 0.35,
          emissive: new THREE.Color(edgeColor),
          emissiveIntensity: matState.useOverride ? matState.emissiveIntensity : 0.08,
          transparent: true,
          opacity: matState.useOverride ? Math.min(0.65, matState.opacity * 0.28) : 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const faceMesh = new THREE.Mesh(faceGeo, faceMat);
        faceMesh.visible = !stateRefs.current.wireframe;
        modelGroup.add(faceMesh);
        disposables.push(faceGeo, faceMat);
        sceneObjectsRef.current.polytopeSurface = faceMesh;
        sceneObjectsRef.current.polytopeSurfaceMat = faceMat;
      }

      const sphereGeo = new THREE.SphereGeometry(is5dScene ? 0.048 : 0.055, 12, 12);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(vertexColor),
        metalness: 0.5,
        roughness: 0.25,
        emissive: new THREE.Color(edgeColor),
        emissiveIntensity: 0.35,
      });
      const inst = new THREE.InstancedMesh(sphereGeo, sphereMat, frame.vertices.length);
      const dummy = new THREE.Object3D();
      frame.vertices.forEach((v, idx) => {
        dummy.position.set(v[0], v[1], v[2]);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      modelGroup.add(inst);
      disposables.push(sphereGeo, sphereMat);
      sceneObjectsRef.current.polytopeVerts = inst;

      const box = new THREE.Box3().setFromObject(modelGroup);
      const boxHelper = new THREE.Box3Helper(box, 0x22d3ee);
      physicsGroup.add(boxHelper);
      sceneObjectsRef.current.overallBoxHelper = boxHelper;
      disposables.push(boxHelper);

      camera.position.set(is5dScene ? 4.0 : 3.4, is5dScene ? 2.8 : 2.4, is5dScene ? 5.0 : 4.4);
      controls.target.set(0, 0, 0);
      controls.update();
    } else {
      // Composite 3D Object / Design / Architecture
      initialSpec.parts.forEach((part, idx) => {
        const geo = buildThreeGeometry(part, isSoftwareGl);
        const effOpacity = matState.useOverride ? matState.opacity : part.opacity;
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(part.color || '#94a3b8'),
          metalness: matState.useOverride ? matState.metalness : part.metalness,
          roughness: matState.useOverride ? matState.roughness : part.roughness,
          emissive: new THREE.Color(
            part.emissive && part.emissive !== '#000000'
              ? part.emissive
              : matState.useOverride && matState.emissiveIntensity > 0
              ? part.color
              : '#000000'
          ),
          emissiveIntensity: matState.useOverride ? matState.emissiveIntensity : part.emissiveIntensity,
          transparent: effOpacity < 0.99,
          opacity: effOpacity,
          wireframe: stateRefs.current.wireframe,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(part.position[0], part.position[1], part.position[2]);
        mesh.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
        mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        modelGroup.add(mesh);
        disposables.push(geo, mat);

        const defaultColorHex = idx === 0 ? 0x22d3ee : 0x34d399;
        const partBox = new THREE.Box3().setFromObject(mesh);
        const partBoxHelper = new THREE.Box3Helper(partBox, defaultColorHex);
        physicsGroup.add(partBoxHelper);
        disposables.push(partBoxHelper);

        const v = new THREE.Vector3(part.velocity[0], part.velocity[1], part.velocity[2]);
        const speed = v.length();
        const arrowDir = speed > 0.01 ? v.clone().normalize() : new THREE.Vector3(0, 1, 0);
        const arrowLen = speed > 0.01 ? Math.min(2.2, Math.max(0.55, speed * 0.9)) : 0.65;
        const arrowHelper = new THREE.ArrowHelper(
          arrowDir,
          mesh.position.clone(),
          arrowLen,
          speed > 0.01 ? 0xf59e0b : 0x64748b,
          0.16,
          0.09
        );
        physicsGroup.add(arrowHelper);
        disposables.push(arrowHelper);

        const halfExtents = new THREE.Vector3();
        partBox.getSize(halfExtents).multiplyScalar(0.5);

        const cannonShape = buildCannonShapeForPart(part, halfExtents);
        const cannonBody = new CANNON.Body({
          mass: Math.max(0.25, part.mass ?? 1),
          material: cannonMat,
          shape: cannonShape,
          linearDamping: 0.08,
          angularDamping: 0.14,
        });
        cannonBody.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
        cannonBody.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
        cannonBody.velocity.set(part.velocity[0], part.velocity[1], part.velocity[2]);
        physicsWorld.addBody(cannonBody);

        meshRecords.push({
          mesh,
          part,
          material: mat,
          basePos: mesh.position.clone(),
          baseQuat: mesh.quaternion.clone(),
          simPos: mesh.position.clone(),
          simVel: v.clone(),
          halfExtents,
          boxHelper: partBoxHelper,
          arrowHelper,
          cannonBody,
          defaultColorHex,
        });
      });

      const overallBox = new THREE.Box3().setFromObject(modelGroup);
      if (!overallBox.isEmpty()) {
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        overallBox.getCenter(center);
        overallBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 1.5);
        camera.position.set(center.x + maxDim * 1.45, center.y + maxDim * 0.95, center.z + maxDim * 1.65);
        controls.target.copy(center);
        controls.update();

        const overallHelper = new THREE.Box3Helper(overallBox, 0xfbbf24);
        physicsGroup.add(overallHelper);
        sceneObjectsRef.current.overallBoxHelper = overallHelper;
        disposables.push(overallHelper);
      }
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(100, entry.contentRect.width);
        const h = Math.max(100, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    let rafId = 0;
    let prevTs = performance.now();
    let lastTelemetryTs = 0;
    const dummy4d = new THREE.Object3D();

    const animate = (ts: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, Math.max(0.001, (ts - prevTs) / 1000));
      prevTs = ts;

      if (stateRefs.current.autoRotate) {
        if (
          (initialSpec.category === 'shape_4d' || initialSpec.category === 'shape_5d') &&
          sceneObjectsRef.current.polytopeLines
        ) {
          const tSec = ts * 0.00072;
          const frame =
            initialSpec.category === 'shape_5d' && initialSpec.model5d
              ? generate5DPolytopeFrame(
                  {
                    ...initialSpec.model5d,
                    distance5d: stateRefs.current.dist5d,
                    distance4d: stateRefs.current.dist4d,
                  },
                  {
                    xw: stateRefs.current.xwAngle + tSec,
                    yw: stateRefs.current.ywAngle + tSec * 0.55,
                    xv: stateRefs.current.xvAngle + tSec * 0.8,
                    wv: stateRefs.current.wvAngle + tSec * 0.45,
                  }
                )
              : generate4DPolytopeFrame(
                  { ...initialSpec.model4d!, distance4d: stateRefs.current.dist4d },
                  {
                    xw: stateRefs.current.xwAngle + tSec,
                    yw: stateRefs.current.ywAngle + tSec * 0.6,
                    zw: stateRefs.current.zwAngle + tSec * 0.4,
                  }
                );

          const posAttr = sceneObjectsRef.current.polytopeLines.geometry.getAttribute('position') as THREE.BufferAttribute;
          const arr = posAttr.array as Float32Array;
          frame.edges.forEach(([a, b], idx) => {
            const va = frame.vertices[a];
            const vb = frame.vertices[b];
            arr[idx * 6] = va[0];
            arr[idx * 6 + 1] = va[1];
            arr[idx * 6 + 2] = va[2];
            arr[idx * 6 + 3] = vb[0];
            arr[idx * 6 + 4] = vb[1];
            arr[idx * 6 + 5] = vb[2];
          });
          posAttr.needsUpdate = true;

          if (sceneObjectsRef.current.polytopeSurface && frame.faces.length > 0) {
            const fAttr = sceneObjectsRef.current.polytopeSurface.geometry.getAttribute('position') as THREE.BufferAttribute;
            const farr = fAttr.array as Float32Array;
            frame.faces.forEach(([ia, ib, ic], fIdx) => {
              const va = frame.vertices[ia];
              const vb = frame.vertices[ib];
              const vc = frame.vertices[ic];
              farr[fIdx * 9] = va[0];
              farr[fIdx * 9 + 1] = va[1];
              farr[fIdx * 9 + 2] = va[2];
              farr[fIdx * 9 + 3] = vb[0];
              farr[fIdx * 9 + 4] = vb[1];
              farr[fIdx * 9 + 5] = vb[2];
              farr[fIdx * 9 + 6] = vc[0];
              farr[fIdx * 9 + 7] = vc[1];
              farr[fIdx * 9 + 8] = vc[2];
            });
            fAttr.needsUpdate = true;
            sceneObjectsRef.current.polytopeSurface.geometry.computeVertexNormals();
          }

          if (sceneObjectsRef.current.polytopeVerts) {
            frame.vertices.forEach((v, idx) => {
              dummy4d.position.set(v[0], v[1], v[2]);
              dummy4d.updateMatrix();
              sceneObjectsRef.current.polytopeVerts!.setMatrixAt(idx, dummy4d.matrix);
            });
            sceneObjectsRef.current.polytopeVerts.instanceMatrix.needsUpdate = true;
          }
        } else if (!stateRefs.current.physicsSimRunning) {
          modelGroup.rotation.y += dt * 0.5;
        }
      }

      // Cannon.js Rigid-Body Physics Step + Object-to-Object Collisions
      if (stateRefs.current.physicsSimRunning && meshRecords.length > 0) {
        modelGroup.rotation.set(0, 0, 0);
        physicsWorld.step(1 / 60, dt, 4);

        const collidingIds = new Set<number>();
        let pairCollisions = 0;
        for (const eq of physicsWorld.contacts) {
          if (eq.bi.id !== groundBody.id && eq.bj.id !== groundBody.id) {
            collidingIds.add(eq.bi.id);
            collidingIds.add(eq.bj.id);
            pairCollisions++;
          }
        }

        const overallBox = new THREE.Box3();
        let maxSpeed = 0;
        for (const rec of meshRecords) {
          const body = rec.cannonBody;
          if (!body) continue;

          // Keep objects softly bounded inside the studio pedestal
          const studioBound = 3.8;
          if (Math.abs(body.position.x) > studioBound) {
            body.position.x = Math.sign(body.position.x) * studioBound;
            body.velocity.x *= -0.7;
          }
          if (Math.abs(body.position.z) > studioBound) {
            body.position.z = Math.sign(body.position.z) * studioBound;
            body.velocity.z *= -0.7;
          }

          rec.mesh.position.set(body.position.x, body.position.y, body.position.z);
          rec.mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
          rec.simPos.copy(rec.mesh.position);
          rec.simVel.set(body.velocity.x, body.velocity.y, body.velocity.z);

          const speed = rec.simVel.length();
          if (speed > maxSpeed) maxSpeed = speed;

          const b = new THREE.Box3().setFromObject(rec.mesh);
          if (rec.boxHelper) {
            rec.boxHelper.box.copy(b);
            const mat = rec.boxHelper.material as THREE.LineBasicMaterial;
            if (mat && mat.color) {
              mat.color.setHex(collidingIds.has(body.id) ? 0xef4444 : rec.defaultColorHex);
            }
          }
          overallBox.union(b);
          if (rec.arrowHelper) {
            rec.arrowHelper.position.copy(rec.mesh.position);
            if (speed > 0.04) {
              const len = Math.min(2.2, Math.max(0.4, speed * 0.55));
              rec.arrowHelper.setDirection(rec.simVel.clone().normalize());
              rec.arrowHelper.setLength(len, 0.16, 0.09);
            } else {
              rec.arrowHelper.setDirection(new THREE.Vector3(0, -1, 0));
              rec.arrowHelper.setLength(0.25, 0.1, 0.06);
            }
          }
        }
        sceneObjectsRef.current.overallBoxHelper?.box.copy(overallBox);

        if (ts - lastTelemetryTs > 140) {
          lastTelemetryTs = ts;
          setLiveCollisionCount(pairCollisions);
          setLiveMaxSpeed(Number(maxSpeed.toFixed(2)));
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      });
      if (floorMesh) {
        floorMesh.geometry.dispose();
        (floorMesh.material as THREE.Material).dispose();
      }
      if (contactShadowMesh) {
        contactShadowMesh.geometry.dispose();
        (contactShadowMesh.material as THREE.Material).dispose();
      }
      if (contactShadowTex) {
        contactShadowTex.dispose();
      }
      envRT.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [initialSpec, extractedRelief, isLight, isFullscreen]);

  // Real-time update of 4D & 5D angles when sliders move (and auto-rotate is paused)
  useEffect(() => {
    if (initialSpec.category !== 'shape_4d' && initialSpec.category !== 'shape_5d') return;
    const { polytopeLines, polytopeVerts, polytopeSurface, overallBoxHelper } = sceneObjectsRef.current;
    if (!polytopeLines) return;
    const frame =
      initialSpec.category === 'shape_5d' && initialSpec.model5d
        ? generate5DPolytopeFrame(
            { ...initialSpec.model5d, distance5d: dist5d, distance4d: dist4d },
            { xw: xwAngle, yw: ywAngle, xv: xvAngle, wv: wvAngle }
          )
        : initialSpec.model4d
        ? generate4DPolytopeFrame(
            { ...initialSpec.model4d, distance4d: dist4d },
            { xw: xwAngle, yw: ywAngle, zw: zwAngle }
          )
        : null;
    if (!frame) return;

    const posAttr = polytopeLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    frame.edges.forEach(([a, b], idx) => {
      const va = frame.vertices[a];
      const vb = frame.vertices[b];
      arr[idx * 6] = va[0];
      arr[idx * 6 + 1] = va[1];
      arr[idx * 6 + 2] = va[2];
      arr[idx * 6 + 3] = vb[0];
      arr[idx * 6 + 4] = vb[1];
      arr[idx * 6 + 5] = vb[2];
    });
    posAttr.needsUpdate = true;
    polytopeLines.geometry.computeBoundingBox();

    if (polytopeSurface && frame.faces.length > 0) {
      const fAttr = polytopeSurface.geometry.getAttribute('position') as THREE.BufferAttribute;
      const farr = fAttr.array as Float32Array;
      frame.faces.forEach(([ia, ib, ic], fIdx) => {
        const va = frame.vertices[ia];
        const vb = frame.vertices[ib];
        const vc = frame.vertices[ic];
        farr[fIdx * 9] = va[0];
        farr[fIdx * 9 + 1] = va[1];
        farr[fIdx * 9 + 2] = va[2];
        farr[fIdx * 9 + 3] = vb[0];
        farr[fIdx * 9 + 4] = vb[1];
        farr[fIdx * 9 + 5] = vb[2];
        farr[fIdx * 9 + 6] = vc[0];
        farr[fIdx * 9 + 7] = vc[1];
        farr[fIdx * 9 + 8] = vc[2];
      });
      fAttr.needsUpdate = true;
      polytopeSurface.geometry.computeVertexNormals();
    }

    if (polytopeVerts) {
      const dummy = new THREE.Object3D();
      frame.vertices.forEach((v, idx) => {
        dummy.position.set(v[0], v[1], v[2]);
        dummy.updateMatrix();
        polytopeVerts.setMatrixAt(idx, dummy.matrix);
      });
      polytopeVerts.instanceMatrix.needsUpdate = true;
    }

    if (overallBoxHelper && polytopeLines.geometry.boundingBox) {
      overallBoxHelper.box.copy(polytopeLines.geometry.boundingBox);
    }
  }, [xwAngle, ywAngle, zwAngle, xvAngle, wvAngle, dist4d, dist5d, initialSpec]);

  // Real-time update of Physics Inspector visibility
  useEffect(() => {
    const { physicsGroup } = sceneObjectsRef.current;
    if (physicsGroup) {
      physicsGroup.visible = showPhysicsInspector;
    }
  }, [showPhysicsInspector]);

  // Real-time update of Wireframe and Surface Material properties (no scene rebuild!)
  useEffect(() => {
    const { meshes, reliefMat, polytopeSurface, polytopeSurfaceMat } = sceneObjectsRef.current;
    if (polytopeSurface) {
      polytopeSurface.visible = !wireframe;
    }
    if (polytopeSurfaceMat && matState.useOverride) {
      polytopeSurfaceMat.metalness = matState.metalness;
      polytopeSurfaceMat.roughness = matState.roughness;
      polytopeSurfaceMat.emissiveIntensity = matState.emissiveIntensity;
      polytopeSurfaceMat.opacity = Math.min(0.65, matState.opacity * 0.28);
      polytopeSurfaceMat.needsUpdate = true;
    }
    if (reliefMat) {
      reliefMat.wireframe = wireframe;
      if (matState.useOverride) {
        reliefMat.metalness = matState.metalness;
        reliefMat.roughness = matState.roughness;
        reliefMat.emissiveIntensity = matState.emissiveIntensity;
        reliefMat.opacity = matState.opacity;
        reliefMat.transparent = matState.opacity < 0.99;
      }
      reliefMat.needsUpdate = true;
    }
    for (const rec of meshes) {
      rec.material.wireframe = wireframe;
      if (matState.useOverride) {
        rec.material.metalness = matState.metalness;
        rec.material.roughness = matState.roughness;
        rec.material.emissive.set(
          rec.part.emissive && rec.part.emissive !== '#000000'
            ? rec.part.emissive
            : matState.emissiveIntensity > 0
            ? rec.part.color
            : '#000000'
        );
        rec.material.emissiveIntensity = matState.emissiveIntensity;
        rec.material.opacity = matState.opacity;
        rec.material.transparent = matState.opacity < 0.99;
      }
      rec.material.needsUpdate = true;
    }
  }, [wireframe, matState]);

  // Real-time update of Dynamic Studio Lighting (Point, Directional, Ambient Occlusion) without rebuilding scene
  useEffect(() => {
    const { scene, pointLight, keyLight, rimLight, hemiLight, contactShadowMat } = sceneObjectsRef.current;
    if (pointLight) {
      pointLight.visible = lightingState.pointEnabled;
      pointLight.intensity = lightingState.pointEnabled ? lightingState.pointIntensity : 0;
    }
    if (keyLight) {
      keyLight.visible = lightingState.dirEnabled;
      keyLight.intensity = lightingState.dirEnabled ? lightingState.dirIntensity : 0;
    }
    if (rimLight) {
      rimLight.visible = lightingState.dirEnabled;
      rimLight.intensity = lightingState.dirEnabled ? lightingState.dirIntensity * 0.42 : 0;
    }
    if (hemiLight) {
      const keepFallbackHemi = !lightingState.dirEnabled && !lightingState.pointEnabled;
      hemiLight.visible = lightingState.aoEnabled || keepFallbackHemi;
      hemiLight.intensity = lightingState.aoEnabled ? lightingState.aoIntensity * 0.85 : 0.08;
    }
    if (scene) {
      scene.environmentIntensity = lightingState.aoEnabled
        ? Math.min(1.6, 0.35 + lightingState.aoIntensity * 0.7)
        : 0.12;
    }
    if (contactShadowMat) {
      contactShadowMat.opacity = lightingState.aoEnabled
        ? Math.min(0.75, lightingState.aoIntensity * 0.42)
        : 0;
      contactShadowMat.needsUpdate = true;
    }
  }, [lightingState]);

  const handleTriggerDropCollision = useCallback(() => {
    const { meshes } = sceneObjectsRef.current;
    if (meshes.length === 0) return;
    meshes.forEach((rec, idx) => {
      const body = rec.cannonBody;
      if (!body) return;
      body.wakeUp();
      // Lift parts slightly so gravity + inter-object impacts visibly interact
      body.position.y = Math.max(body.position.y + 1.15 + idx * 0.35, rec.halfExtents.y + 0.8);
      const side = idx % 2 === 0 ? -1 : 1;
      body.velocity.set(
        rec.part.velocity[0] !== 0 ? rec.part.velocity[0] : side * 0.65,
        rec.part.velocity[1] !== 0 ? rec.part.velocity[1] : 0.9,
        rec.part.velocity[2] !== 0 ? rec.part.velocity[2] : (idx % 3 === 0 ? 0.45 : -0.45)
      );
      body.angularVelocity.set(side * 0.6, 0.35, -side * 0.5);
    });
    setShowPhysicsInspector(true);
    setPhysicsSimRunning(true);
  }, []);

  const handleResetViewAndPhysics = useCallback(() => {
    setPhysicsSimRunning(false);
    setLiveCollisionCount(0);
    setLiveMaxSpeed(0);
    setMatState(defaultBaseMat);
    setWireframe(Boolean(initialSpec.wireframe));
    const { modelGroup, meshes, camera, controls } = sceneObjectsRef.current;
    if (modelGroup) {
      modelGroup.rotation.set(0, 0, 0);
    }
    const overallBox = new THREE.Box3();
    for (const rec of meshes) {
      rec.simPos.copy(rec.basePos);
      rec.simVel.set(rec.part.velocity[0], rec.part.velocity[1], rec.part.velocity[2]);
      rec.mesh.position.copy(rec.basePos);
      rec.mesh.quaternion.copy(rec.baseQuat);
      if (rec.cannonBody) {
        rec.cannonBody.position.set(rec.basePos.x, rec.basePos.y, rec.basePos.z);
        rec.cannonBody.quaternion.set(rec.baseQuat.x, rec.baseQuat.y, rec.baseQuat.z, rec.baseQuat.w);
        rec.cannonBody.velocity.set(rec.part.velocity[0], rec.part.velocity[1], rec.part.velocity[2]);
        rec.cannonBody.angularVelocity.set(0, 0, 0);
        rec.cannonBody.wakeUp();
      }
      const b = new THREE.Box3().setFromObject(rec.mesh);
      if (rec.boxHelper) {
        rec.boxHelper.box.copy(b);
        const hMat = rec.boxHelper.material as THREE.LineBasicMaterial;
        if (hMat && hMat.color) hMat.color.setHex(rec.defaultColorHex);
      }
      if (rec.arrowHelper) {
        rec.arrowHelper.position.copy(rec.basePos);
        const speed = rec.simVel.length();
        const dir = speed > 0.01 ? rec.simVel.clone().normalize() : new THREE.Vector3(0, 1, 0);
        rec.arrowHelper.setDirection(dir);
        rec.arrowHelper.setLength(speed > 0.01 ? Math.min(2.2, Math.max(0.55, speed * 0.9)) : 0.65, 0.16, 0.09);
      }
      overallBox.union(b);
    }
    if (!overallBox.isEmpty()) {
      sceneObjectsRef.current.overallBoxHelper?.box.copy(overallBox);
      if (camera && controls) {
        const center = new THREE.Vector3();
        overallBox.getCenter(center);
        camera.position.set(center.x + 4.2, center.y + 3.0, center.z + 5.0);
        controls.target.copy(center);
        controls.update();
      }
    }
  }, [defaultBaseMat, initialSpec.wireframe]);

  const containerCls = isLight
    ? 'bg-white border-gray-200 text-gray-900'
    : 'bg-zinc-950 border-zinc-800 text-zinc-100';

  const btnCls = (active = false) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] transition-colors ${
      active
        ? isLight
          ? 'bg-zinc-900 text-white border-zinc-900'
          : 'bg-zinc-100 text-zinc-950 border-zinc-100 font-medium'
        : isLight
        ? 'border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
    }`;

  const panelNode = (
    <div
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-[9990] m-0 w-screen h-[100dvh] rounded-none border-0 flex flex-col'
          : 'my-3 rounded-xl border overflow-hidden'
      } ${containerCls}`}
    >
      {/* Minimalist Top Bar */}
      <div className="px-3.5 py-2.5 border-b border-border-color/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {initialSpec.category === 'shape_5d' ? (
            <Box size={15} className="text-violet-400 shrink-0" />
          ) : initialSpec.category === 'shape_4d' ? (
            <Box size={15} className="text-sky-400 shrink-0" />
          ) : (
            <Box size={15} className="text-blue-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{initialSpec.title}</div>
            {initialSpec.subtitle && (
              <div className="text-[11px] text-text-secondary truncate">{initialSpec.subtitle}</div>
            )}
          </div>
          <span className="px-1.5 py-0.5 rounded border border-border-color text-[10px] font-mono text-text-secondary">
            {extractedRelief
              ? 'Image→3D'
              : initialSpec.category === 'shape_5d'
              ? '5D'
              : initialSpec.category === 'shape_4d'
              ? '4D'
              : '3D'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={wireframe}
            aria-label="Wireframe Toggle"
            onClick={() => setWireframe((v) => !v)}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[11px] transition-colors ${
              isLight
                ? 'border-gray-200 text-gray-700 hover:bg-gray-100'
                : 'border-zinc-800 text-zinc-300 hover:bg-zinc-900'
            }`}
            title="Wireframe Toggle (Chuyển Solid / Wireframe)"
          >
            <span>Wireframe</span>
            <span
              aria-hidden="true"
              className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                wireframe
                  ? isLight
                    ? 'bg-zinc-900'
                    : 'bg-zinc-100'
                  : isLight
                  ? 'bg-gray-300'
                  : 'bg-zinc-700'
              }`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full transition-transform ${
                  wireframe ? 'translate-x-3' : 'translate-x-0.5'
                } ${wireframe && !isLight ? 'bg-zinc-950' : 'bg-white'}`}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className={btnCls(autoRotate)}
            title="Tự động xoay"
          >
            {autoRotate ? <Pause size={12} /> : <Play size={12} />}
            <span>Xoay</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMaterialsDrawer((v) => !v)}
            className={btnCls(showMaterialsDrawer)}
            title="Điều chỉnh chất liệu bề mặt"
          >
            <Sliders size={12} />
            <span>Chất liệu</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLightingDrawer((v) => !v)}
            className={btnCls(showLightingDrawer)}
            title="Điều khiển ánh sáng (Point Light, Directional Light, Ambient Occlusion)"
          >
            <Sun size={12} />
            <span>Ánh sáng</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPhysicsInspector((v) => !v)}
            className={btnCls(showPhysicsInspector)}
            title="Bật/tắt Physics Inspector (Cannon.js Rigid-Body, Bounding Box, Vận tốc, Khối lượng)"
          >
            <Eye size={12} />
            <span>Physics</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={btnCls(Boolean(extractedRelief))}
            title="Tải ảnh lên để trích xuất mô hình 3D"
          >
            <ImageIcon size={12} />
            <span>Ảnh → 3D</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadImageFor3D}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleResetViewAndPhysics}
            className={btnCls(false)}
            title="Đặt lại góc nhìn & trạng thái"
          >
            <RotateCcw size={12} />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className={btnCls(isFullscreen)}
            title={isFullscreen ? 'Thu nhỏ (Esc)' : 'Xem toàn màn hình'}
            aria-label={isFullscreen ? 'Thu nhỏ' : 'Xem toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* Viewport Wrapper: mountRef stays strictly empty inside */}
      <div className={`relative w-full ${isFullscreen ? 'flex-1 min-h-0' : 'h-[360px] sm:h-[400px]'}`}>
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-xs text-rose-400 bg-zinc-950">
            {webglError}
          </div>
        )}

        {extractError && (
          <div
            className="absolute top-2.5 left-2.5 right-2.5 px-3 py-2 rounded-lg border border-amber-500/40 text-[11px] text-amber-300"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.92)' }}
          >
            {extractError}
          </div>
        )}

        {/* Solid HUD for Physics Inspector (no backdrop-blur over WebGL) */}
        {showPhysicsInspector && (
          <div
            className="absolute top-2.5 left-2.5 max-w-[295px] rounded-lg border border-zinc-700/80 px-3 py-2.5 text-[11px] font-mono tabular-nums text-zinc-100 space-y-1.5"
            style={{ backgroundColor: 'rgba(9, 12, 18, 0.90)' }}
          >
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-zinc-800">
              <span className="font-semibold text-cyan-400">Physics · Cannon.js</span>
              {initialSpec.parts.length > 0 && !extractedRelief && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPhysicsSimRunning((v) => !v)}
                    className="px-1.5 py-0.5 rounded border border-zinc-700 text-[10px] hover:bg-zinc-800"
                  >
                    {physicsSimRunning ? 'Dừng' : 'Chạy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTriggerDropCollision}
                    className="px-1.5 py-0.5 rounded border border-zinc-700 text-[10px] text-amber-300 hover:bg-zinc-800"
                    title="Thả rơi & thử va chạm giữa các khối"
                  >
                    Thả rơi
                  </button>
                </div>
              )}
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Khối lượng:</span>
              <span>{physicsSummary.totalMassKg} kg</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Trọng lực g:</span>
              <span>9.82 m/s²</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Va chạm cặp / Vmax:</span>
              <span className={liveCollisionCount > 0 ? 'text-rose-400 font-semibold' : ''}>
                {liveCollisionCount} · {liveMaxSpeed} m/s
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Kích thước:</span>
              <span>
                {physicsSummary.dimensions[0]}×{physicsSummary.dimensions[1]}×{physicsSummary.dimensions[2]}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Trọng tâm:</span>
              <span>
                ({physicsSummary.centerOfMass[0]}, {physicsSummary.centerOfMass[1]}, {physicsSummary.centerOfMass[2]})
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-400">Quán tính I:</span>
              <span>
                [{physicsSummary.momentOfInertia[0]}, {physicsSummary.momentOfInertia[1]}, {physicsSummary.momentOfInertia[2]}]
              </span>
            </div>
            {physicsSummary.parts.length > 0 && (
              <div className="pt-1 border-t border-zinc-800 max-h-24 overflow-y-auto space-y-0.5 text-[10px]">
                {physicsSummary.parts.map((p) => (
                  <div key={p.id} className="flex justify-between gap-2 text-zinc-300">
                    <span className="truncate">{p.label}</span>
                    <span className="shrink-0 text-amber-300">
                      {p.mass}kg · {p.speed}m/s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Solid bottom-right hint */}
        <div
          className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded text-[10px] font-mono text-zinc-400 pointer-events-none"
          style={{ backgroundColor: isLight ? 'rgba(255,255,255,0.88)' : 'rgba(9,12,18,0.82)' }}
        >
          Kéo để xoay · Cuộn để zoom
        </div>
      </div>

      {/* Surface Materials Real-Time Sliders Drawer */}
      {showMaterialsDrawer && (
        <div className="px-3.5 py-2.5 border-t border-border-color/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Metalness</span>
              <span>{matState.metalness.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={matState.metalness}
              onChange={(e) =>
                setMatState((s) => ({ ...s, metalness: Number(e.target.value), useOverride: true }))
              }
              className="w-full accent-blue-500"
            />
          </label>

          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Roughness</span>
              <span>{matState.roughness.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={matState.roughness}
              onChange={(e) =>
                setMatState((s) => ({ ...s, roughness: Number(e.target.value), useOverride: true }))
              }
              className="w-full accent-blue-500"
            />
          </label>

          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Emission</span>
              <span>{matState.emissiveIntensity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={matState.emissiveIntensity}
              onChange={(e) =>
                setMatState((s) => ({ ...s, emissiveIntensity: Number(e.target.value), useOverride: true }))
              }
              className="w-full accent-blue-500"
            />
          </label>

          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Opacity</span>
              <span>{matState.opacity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={matState.opacity}
              onChange={(e) =>
                setMatState((s) => ({ ...s, opacity: Number(e.target.value), useOverride: true }))
              }
              className="w-full accent-blue-500"
            />
          </label>
        </div>
      )}

      {/* Dynamic Lighting Control Panel (Point Light, Directional Light, Ambient Occlusion) */}
      {showLightingDrawer && (
        <div className="px-3.5 py-2.5 border-t border-border-color/70 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={lightingState.pointEnabled}
                onClick={() => setLightingState((s) => ({ ...s, pointEnabled: !s.pointEnabled }))}
                className="flex items-center gap-2 font-medium text-text-primary hover:opacity-85"
              >
                <span>Point Light</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border-color text-text-secondary">
                  {lightingState.pointEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
              <span className="font-mono tabular-nums text-text-secondary">
                {lightingState.pointEnabled ? lightingState.pointIntensity.toFixed(2) : 'Tắt'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="6"
              step="0.1"
              disabled={!lightingState.pointEnabled}
              value={lightingState.pointIntensity}
              onChange={(e) =>
                setLightingState((s) => ({ ...s, pointIntensity: Number(e.target.value) }))
              }
              className="w-full accent-amber-400 disabled:opacity-40"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={lightingState.dirEnabled}
                onClick={() => setLightingState((s) => ({ ...s, dirEnabled: !s.dirEnabled }))}
                className="flex items-center gap-2 font-medium text-text-primary hover:opacity-85"
              >
                <span>Directional Light</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border-color text-text-secondary">
                  {lightingState.dirEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
              <span className="font-mono tabular-nums text-text-secondary">
                {lightingState.dirEnabled ? lightingState.dirIntensity.toFixed(2) : 'Tắt'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              disabled={!lightingState.dirEnabled}
              value={lightingState.dirIntensity}
              onChange={(e) =>
                setLightingState((s) => ({ ...s, dirIntensity: Number(e.target.value) }))
              }
              className="w-full accent-sky-400 disabled:opacity-40"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={lightingState.aoEnabled}
                onClick={() => setLightingState((s) => ({ ...s, aoEnabled: !s.aoEnabled }))}
                className="flex items-center gap-2 font-medium text-text-primary hover:opacity-85"
              >
                <span>Ambient Occlusion</span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border-color text-text-secondary">
                  {lightingState.aoEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
              <span className="font-mono tabular-nums text-text-secondary">
                {lightingState.aoEnabled ? lightingState.aoIntensity.toFixed(2) : 'Tắt'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              disabled={!lightingState.aoEnabled}
              value={lightingState.aoIntensity}
              onChange={(e) =>
                setLightingState((s) => ({ ...s, aoIntensity: Number(e.target.value) }))
              }
              className="w-full accent-emerald-400 disabled:opacity-40"
            />
          </div>
        </div>
      )}

      {/* 4D / 5D Projection Angles Bar */}
      {initialSpec.category === 'shape_4d' && !extractedRelief && (
        <div className="px-3.5 py-2 border-t border-border-color/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Xoay XW</span>
              <span>{xwAngle.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6.28"
              step="0.05"
              value={xwAngle}
              onChange={(e) => setXwAngle(Number(e.target.value))}
              className="w-full accent-sky-400"
            />
          </label>
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Xoay YW</span>
              <span>{ywAngle.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6.28"
              step="0.05"
              value={ywAngle}
              onChange={(e) => setYwAngle(Number(e.target.value))}
              className="w-full accent-sky-400"
            />
          </label>
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Xoay ZW</span>
              <span>{zwAngle.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6.28"
              step="0.05"
              value={zwAngle}
              onChange={(e) => setZwAngle(Number(e.target.value))}
              className="w-full accent-sky-400"
            />
          </label>
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Khoảng cách 4D</span>
              <span>{dist4d.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="1.8"
              max="5.5"
              step="0.1"
              value={dist4d}
              onChange={(e) => setDist4d(Number(e.target.value))}
              className="w-full accent-sky-400"
            />
          </label>
        </div>
      )}

      {initialSpec.category === 'shape_5d' && !extractedRelief && (
        <div className="px-3.5 py-2 border-t border-border-color/70 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px]">
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Xoay XW</span>
              <span>{xwAngle.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6.28"
              step="0.05"
              value={xwAngle}
              onChange={(e) => setXwAngle(Number(e.target.value))}
              className="w-full accent-violet-400"
            />
          </label>
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Xoay YW</span>
              <span>{ywAngle.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6.28"
              step="0.05"
              value={ywAngle}
              onChange={(e) => setYwAngle(Number(e.target.value))}
              className="w-full accent-violet-400"
            />
          </label>
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Xoay XV</span>
              <span>{xvAngle.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6.28"
              step="0.05"
              value={xvAngle}
              onChange={(e) => setXvAngle(Number(e.target.value))}
              className="w-full accent-violet-400"
            />
          </label>
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Xoay WV</span>
              <span>{wvAngle.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="6.28"
              step="0.05"
              value={wvAngle}
              onChange={(e) => setWvAngle(Number(e.target.value))}
              className="w-full accent-violet-400"
            />
          </label>
          <label className="space-y-1">
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-text-secondary">Khoảng cách 5D</span>
              <span>{dist5d.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="2.0"
              max="6.0"
              step="0.1"
              value={dist5d}
              onChange={(e) => setDist5d(Number(e.target.value))}
              className="w-full accent-violet-400"
            />
          </label>
        </div>
      )}

      {extractedRelief && (
        <div className="px-3.5 py-2 border-t border-border-color/70 flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <span className="text-text-secondary">
            Trích xuất hình học từ ảnh ({extractedRelief.cols}×{extractedRelief.rows} đỉnh)
          </span>
          <label className="flex items-center gap-2 font-mono tabular-nums">
            <span className="text-text-secondary">Độ nổi khối:</span>
            <input
              type="range"
              min="0.15"
              max="2"
              step="0.05"
              value={imageDepthScale}
              onChange={(e) => setImageDepthScale(Number(e.target.value))}
              className="w-28 accent-blue-500"
            />
            <span>{imageDepthScale.toFixed(2)}</span>
          </label>
        </div>
      )}
    </div>
  );

  return isFullscreen && typeof document !== 'undefined'
    ? createPortal(panelNode, document.body)
    : panelNode;
};

export default Model3DPanel;
