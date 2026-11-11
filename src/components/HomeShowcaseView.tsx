import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Grid,
  Pause,
  Play,
  RotateCcw,
  Table2,
} from 'lucide-react';
import { ELEMENT_BY_SYMBOL } from '../chemistry/elements';
import { MOLECULE_BY_ID, MoleculeModel } from '../chemistry/molecules';
import { computeMoleculeElectrostatics } from '../chemistry/electrostatics';
import {
  computeSatelliteWorldPosition,
  HOME_HERO_MODELS,
  HOME_SATELLITE_CASES,
  HomeHeroSpec,
  HomeSatelliteCase,
  normalizeMoleculeCoordsForStage,
  ORBIT_RADIUS_X,
  ORBIT_RADIUS_Z,
  SatelliteVisualKind,
  ShowcaseTargetDestination,
} from '../chemistry/homeShowcase';
import { CameraPreset, ChemistryStage3DHandle } from './ChemistryStage3D';

interface HomeShowcaseViewProps {
  onNavigateToDestination: (dest: ShowcaseTargetDestination) => void;
  onOpenCatalog: () => void;
  onOpenPeriodicTable: () => void;
}

interface SatelliteRuntimeNode {
  spec: HomeSatelliteCase;
  anchorGroup: THREE.Group;
  modelSpinGroup: THREE.Group;
  pedestalMat: THREE.MeshBasicMaterial;
  tetherLine: THREE.Line;
  tetherMat: THREE.LineBasicMaterial;
  hitProxy: THREE.Mesh;
  currentScale: number;
  labelBtnEl: HTMLButtonElement | null;
}

const METALLIC_ELEMENTS = new Set([
  'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Fe', 'Cu', 'Zn', 'Ag', 'Pt', 'Au',
]);

// Reusable scratch math objects (zero GC pressure inside rAF)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _proj = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _mouse = new THREE.Vector2();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createShowcaseFloorTextures(maxAnisotropy: number) {
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 256;
  sCanvas.height = 256;
  const sCtx = sCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.82)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.34)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);
  const shadowTex = new THREE.CanvasTexture(sCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;

  const gCanvas = document.createElement('canvas');
  gCanvas.width = 512;
  gCanvas.height = 512;
  const gCtx = gCanvas.getContext('2d')!;
  const cx = 256;
  const cy = 256;

  // Concentric calibration circles
  for (let r = 48; r <= 240; r += 48) {
    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.strokeStyle =
      r === 96 ? 'rgba(56, 189, 248, 0.24)' : 'rgba(148, 163, 184, 0.12)';
    gCtx.lineWidth = r === 96 ? 1.5 : 1.0;
    gCtx.stroke();
  }

  // 8 radial azimuth ticks matching the 8 satellite sectors
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    gCtx.beginPath();
    gCtx.moveTo(cx + Math.cos(ang) * 56, cy + Math.sin(ang) * 56);
    gCtx.lineTo(cx + Math.cos(ang) * 238, cy + Math.sin(ang) * 238);
    gCtx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
    gCtx.lineWidth = 1;
    gCtx.stroke();
  }

  const gridTex = new THREE.CanvasTexture(gCanvas);
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.anisotropy = maxAnisotropy;

  return { shadowTex, gridTex };
}

/**
 * Builds a multi-part 3D molecular group normalized to `targetRadius`.
 */
function buildNormalizedMolecule3DGroup(
  molecule: MoleculeModel,
  targetRadius: number,
  sphereGeo: THREE.BufferGeometry,
  cylGeo: THREE.BufferGeometry,
  options?: { style?: 'cpk' | 'esp'; showDipole?: boolean; atomDensityScale?: number }
): THREE.Group {
  const group = new THREE.Group();
  const { atoms, scaleFactor } = normalizeMoleculeCoordsForStage(
    molecule,
    targetRadius
  );
  const atomMap = new Map<number, { x: number; y: number; z: number; element: string }>();
  for (const a of atoms) {
    atomMap.set(a.id, a);
  }

  const electrostatics =
    options?.style === 'esp' || options?.showDipole
      ? computeMoleculeElectrostatics(molecule)
      : null;

  const density =
    options?.atomDensityScale ??
    (molecule.atoms.length >= 40 ? 0.68 : molecule.atoms.length >= 18 ? 0.84 : 1.0);

  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const el = ELEMENT_BY_SYMBOL[a.element];
    const covAng = (el?.covalentRadius ?? 75) / 100;
    const baseR =
      Math.max(0.11, Math.min(0.36, (0.12 + covAng * 0.22) * scaleFactor * 0.85)) *
      density;

    let color = new THREE.Color(el?.cpkColor ?? '#94A3B8');
    if (options?.style === 'esp' && electrostatics) {
      const espHex = electrostatics.atomMap.get(a.id)?.espColorHex ?? '#E2E8F0';
      color = new THREE.Color(espHex);
    }

    const isMetal = METALLIC_ELEMENTS.has(a.element);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      roughness: isMetal ? 0.22 : 0.28,
      metalness: isMetal ? 0.72 : 0.08,
      clearcoat: 0.45,
      clearcoatRoughness: 0.2,
    });

    const mesh = new THREE.Mesh(sphereGeo, mat);
    mesh.position.set(a.x, a.y, a.z);
    mesh.scale.setScalar(baseR);
    group.add(mesh);
  }

  const bondMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.36,
    metalness: 0.25,
  });
  const bondRadius = Math.max(0.028, Math.min(0.075, targetRadius * 0.036)) * density;

  for (const bond of molecule.bonds) {
    const pA = atomMap.get(bond.from);
    const pB = atomMap.get(bond.to);
    if (!pA || !pB) continue;

    _vA.set(pA.x, pA.y, pA.z);
    _vB.set(pB.x, pB.y, pB.z);
    _vDir.subVectors(_vB, _vA);
    const dist = _vDir.length();
    if (dist < 0.001) continue;

    _vMid.addVectors(_vA, _vB).multiplyScalar(0.5);
    _vDir.normalize();
    _quat.setFromUnitVectors(_vUp, _vDir);

    const shaft = new THREE.Mesh(cylGeo, bondMat);
    shaft.position.copy(_vMid);
    shaft.quaternion.copy(_quat);
    shaft.scale.set(bondRadius, dist, bondRadius);
    group.add(shaft);
  }

  // Aromatic ring delocalized torus (e.g. Benzene)
  if (molecule.aromaticRings && molecule.aromaticRings.length > 0) {
    for (const ring of molecule.aromaticRings) {
      const torusGeo = new THREE.TorusGeometry(
        ring.radius * scaleFactor * 0.68,
        bondRadius * 0.55,
        10,
        36
      );
      const torusMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.68,
      });
      const torus = new THREE.Mesh(torusGeo, torusMat);
      _vDir.set(ring.normal[0], ring.normal[1], ring.normal[2]).normalize();
      _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _vDir);
      torus.quaternion.copy(_quat);
      group.add(torus);
    }
  }

  // Miniature 3D Dipole Vector Arrow (e.g. H2O ESP satellite)
  if (options?.showDipole && electrostatics && electrostatics.dipoleMagnitudeDebye > 0.1) {
    const dir = new THREE.Vector3(...electrostatics.dipoleVector).normalize();
    const arrowLen = targetRadius * 1.45;
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const dShaft = new THREE.Mesh(cylGeo, shaftMat);
    dShaft.position.copy(dir).multiplyScalar(arrowLen * 0.12);
    _quat.setFromUnitVectors(_vUp, dir);
    dShaft.quaternion.copy(_quat);
    dShaft.scale.set(bondRadius * 0.9, arrowLen, bondRadius * 0.9);
    group.add(dShaft);

    const coneGeo = new THREE.ConeGeometry(bondRadius * 2.5, arrowLen * 0.28, 14);
    const dCone = new THREE.Mesh(coneGeo, shaftMat);
    dCone.position.copy(dir).multiplyScalar(arrowLen * 0.66);
    dCone.quaternion.copy(_quat);
    group.add(dCone);
  }

  return group;
}

/**
 * Builds one of the 4 specialized 3D miniature satellite subjects.
 */
function buildSatelliteVisual3D(
  visual: SatelliteVisualKind,
  sphereGeo: THREE.BufferGeometry,
  cylGeo: THREE.BufferGeometry
): THREE.Group {
  if (visual.type === 'molecule') {
    const mol = MOLECULE_BY_ID[visual.moleculeId] ?? MOLECULE_BY_ID['caffeine'];
    return buildNormalizedMolecule3DGroup(mol, 0.82, sphereGeo, cylGeo, {
      style: visual.style,
      showDipole: visual.showDipole,
    });
  }

  if (visual.type === 'reaction-pair') {
    const group = new THREE.Group();
    const molA = MOLECULE_BY_ID[visual.reactantAId] ?? MOLECULE_BY_ID['methane'];
    const molB = MOLECULE_BY_ID[visual.reactantBId] ?? MOLECULE_BY_ID['oxygen'];

    const gA = buildNormalizedMolecule3DGroup(molA, 0.44, sphereGeo, cylGeo);
    gA.position.set(-0.48, 0.05, 0);
    group.add(gA);

    const gB = buildNormalizedMolecule3DGroup(molB, 0.44, sphereGeo, cylGeo);
    gB.position.set(0.48, -0.05, 0);
    group.add(gB);

    // 3-dash Transition-State partial bonds (rose breaking + emerald forming)
    const roseMat = new THREE.MeshBasicMaterial({ color: 0xfb7185 });
    const emeraldMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    for (let i = -1; i <= 1; i++) {
      const dashR = new THREE.Mesh(cylGeo, roseMat);
      dashR.rotation.z = Math.PI / 2;
      dashR.position.set(i * 0.22, 0.12, 0);
      dashR.scale.set(0.028, 0.13, 0.028);
      group.add(dashR);

      const dashF = new THREE.Mesh(cylGeo, emeraldMat);
      dashF.rotation.z = Math.PI / 2;
      dashF.position.set(i * 0.22, -0.12, 0);
      dashF.scale.set(0.028, 0.13, 0.028);
      group.add(dashF);
    }

    // Golden [‡] activation halo around reaction center
    const tsTorus = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.018, 10, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.72,
      })
    );
    tsTorus.rotation.x = Math.PI * 0.34;
    group.add(tsTorus);

    return group;
  }

  if (visual.type === 'bohr-atom') {
    const group = new THREE.Group();
    const el = ELEMENT_BY_SYMBOL[visual.elementSymbol];
    const nucMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(el?.cpkColor ?? '#FFD123'),
      roughness: 0.18,
      metalness: 0.85,
      clearcoat: 0.6,
    });
    const nuc = new THREE.Mesh(sphereGeo, nucMat);
    nuc.scale.setScalar(0.24);
    group.add(nuc);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.45,
    });
    const elecMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    const tilts: [number, number][] = [
      [0.42, 0.2],
      [-0.55, 0.85],
      [1.08, -0.4],
      [-0.25, 1.35],
    ];
    for (let s = 0; s < visual.shellCount; s++) {
      const r = 0.38 + s * 0.14;
      const shellGroup = new THREE.Group();
      const [rx, ry] = tilts[s % tilts.length];
      shellGroup.rotation.set(rx, ry, 0);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.012, 8, 40),
        ringMat
      );
      shellGroup.add(ring);

      const eCount = 2 + s * 2;
      for (let k = 0; k < eCount; k++) {
        const phi = (k / eCount) * Math.PI * 2;
        const eMesh = new THREE.Mesh(sphereGeo, elecMat);
        eMesh.scale.setScalar(0.042);
        eMesh.position.set(Math.cos(phi) * r, Math.sin(phi) * r, 0);
        shellGroup.add(eMesh);
      }
      group.add(shellGroup);
    }
    return group;
  }

  // Quantum Orbital (2pz dual-phase figure-eight lobes + equatorial nodal disc)
  const group = new THREE.Group();
  const coreMesh = new THREE.Mesh(
    sphereGeo,
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
  );
  coreMesh.scale.setScalar(0.1);
  group.add(coreMesh);

  const posLobeMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.86,
  });
  const negLobeMat = new THREE.MeshPhysicalMaterial({
    color: 0xfb7185,
    emissive: 0xe11d48,
    emissiveIntensity: 0.35,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.86,
  });

  const upperLobe = new THREE.Mesh(sphereGeo, posLobeMat);
  upperLobe.position.set(0, 0.38, 0);
  upperLobe.scale.set(0.32, 0.44, 0.32);
  group.add(upperLobe);

  const lowerLobe = new THREE.Mesh(sphereGeo, negLobeMat);
  lowerLobe.position.set(0, -0.38, 0);
  lowerLobe.scale.set(0.32, 0.44, 0.32);
  group.add(lowerLobe);

  const nodalPlane = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.72, 32),
    new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    })
  );
  nodalPlane.rotation.x = -Math.PI / 2;
  group.add(nodalPlane);

  return group;
}

export const HomeShowcaseView = forwardRef<
  ChemistryStage3DHandle,
  HomeShowcaseViewProps
>(function HomeShowcaseView(
  { onNavigateToDestination, onOpenCatalog, onOpenPeriodicTable },
  ref
) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const labelOverlayRef = useRef<HTMLDivElement | null>(null);

  const [activeHeroId, setActiveHeroId] = useState<string>(
    HOME_HERO_MODELS[0].id
  );
  const [hoveredCaseId, setHoveredCaseId] = useState<string | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  const [autoOrbit, setAutoOrbit] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false;
    }
    return !detectSoftwareWebGL();
  });

  const activeHero: HomeHeroSpec = useMemo(
    () =>
      HOME_HERO_MODELS.find((h) => h.id === activeHeroId) ?? HOME_HERO_MODELS[0],
    [activeHeroId]
  );

  const focusedSatellite: HomeSatelliteCase | null = useMemo(
    () =>
      hoveredCaseId
        ? HOME_SATELLITE_CASES.find((c) => c.id === hoveredCaseId) ?? null
        : null,
    [hoveredCaseId]
  );

  // Refs for WebGL render loop
  const activeHeroRef = useRef<HomeHeroSpec>(activeHero);
  activeHeroRef.current = activeHero;

  const hoveredCaseIdRef = useRef<string | null>(hoveredCaseId);
  hoveredCaseIdRef.current = hoveredCaseId;

  const autoOrbitRef = useRef<boolean>(autoOrbit);
  autoOrbitRef.current = autoOrbit;

  const onNavigateRef = useRef(onNavigateToDestination);
  onNavigateRef.current = onNavigateToDestination;

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    heroSpinGroup: THREE.Group;
    heroProxy: THREE.Mesh;
    satellites: SatelliteRuntimeNode[];
    sphereGeo: THREE.BufferGeometry;
    cylGeo: THREE.BufferGeometry;
    orbitAngleRad: number;
    cameraGoalPos: THREE.Vector3 | null;
    cameraGoalTarget: THREE.Vector3 | null;
    isSoftwareGl: boolean;
    requestRender: () => void;
    flushImmediateRender: () => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    setCameraPreset(preset: CameraPreset) {
      const eng = engineRef.current;
      if (!eng) return;
      const isPortrait =
        eng.renderer.domElement.clientWidth <
        eng.renderer.domElement.clientHeight * 0.85;
      eng.cameraGoalTarget = new THREE.Vector3(0, isPortrait ? 0.55 : -0.78, 0);
      if (preset === 'top') {
        eng.cameraGoalPos = new THREE.Vector3(0, 17.5, 0.02);
      } else if (preset === 'front') {
        eng.cameraGoalPos = new THREE.Vector3(0, 2.4, isPortrait ? 19.5 : 15.8);
      } else if (preset === 'side') {
        eng.cameraGoalPos = new THREE.Vector3(16.2, 2.6, 0);
      } else {
        eng.cameraGoalPos = new THREE.Vector3(
          0,
          isPortrait ? 5.8 : 5.3,
          isPortrait ? 19.6 : 15.6
        );
      }
      eng.requestRender();
    },
    exportSnapshotDataUrl() {
      const eng = engineRef.current;
      if (!eng) return null;
      eng.renderer.render(eng.scene, eng.camera);
      return eng.renderer.domElement.toDataURL('image/png');
    },
  }));

  // Keyboard shortcut 'H' to toggle bottom showcase dock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Initialize Three.js Orbital Showcase Scene once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const initW = Math.max(container.clientWidth, 320);
    const initH = Math.max(container.clientHeight, 320);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(initW, initH);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.018);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    // Studio 3-point warm/cool lighting
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.92);
    hemiLight.position.set(0, 18, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.85);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(-9, 5, -9);
    scene.add(rimLight);

    const initPortrait = initW < initH * 0.85;
    const camera = new THREE.PerspectiveCamera(40, initW / initH, 0.1, 180);
    camera.position.set(0, initPortrait ? 5.8 : 5.3, initPortrait ? 19.6 : 15.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, initPortrait ? 0.55 : -0.78, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.9;
    controls.minDistance = 6.5;
    controls.maxDistance = 28.0;
    controls.maxPolarAngle = Math.PI * 0.56;

    // Grounded Stage Pedestal & Calibration Floor
    const floorGroup = new THREE.Group();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { shadowTex, gridTex } = createShowcaseFloorTextures(maxAniso);

    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(9.2, 48),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.62,
      })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    floorGroup.add(shadowDisc);

    const gridDisc = new THREE.Mesh(
      new THREE.CircleGeometry(9.6, 56),
      new THREE.MeshBasicMaterial({
        map: gridTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.78,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    gridDisc.rotation.x = -Math.PI / 2;
    gridDisc.position.y = 0.02;
    floorGroup.add(gridDisc);

    // Central hero pedestal glowing ring
    const heroPedestalRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.45, 0.03, 12, 64),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.48,
      })
    );
    heroPedestalRing.rotation.x = -Math.PI / 2;
    heroPedestalRing.position.y = 0.04;
    floorGroup.add(heroPedestalRing);

    floorGroup.position.y = -2.35;
    scene.add(floorGroup);

    // Inclined 3D Keplerian Orbital Track Curve around centerpiece
    const trackPoints: THREE.Vector3[] = [];
    const trackSegments = 96;
    for (let s = 0; s < trackSegments; s++) {
      const th = (s / trackSegments) * Math.PI * 2;
      const x = Math.sin(th) * ORBIT_RADIUS_X;
      const z = Math.cos(th) * ORBIT_RADIUS_Z;
      const y = 0.28 - 0.78 * Math.cos(th);
      trackPoints.push(new THREE.Vector3(x, y, z));
    }
    const trackGeo = new THREE.BufferGeometry().setFromPoints(trackPoints);
    const trackMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.24,
    });
    const orbitalTrackLoop = new THREE.LineLoop(trackGeo, trackMat);
    scene.add(orbitalTrackLoop);

    // Shared primitive geometries across centerpiece & 8 satellites
    const sphereGeo = new THREE.SphereGeometry(1, 20, 20);
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
    const proxySphereGeo = new THREE.SphereGeometry(1, 12, 12);
    const proxyInvisibleMat = new THREE.MeshBasicMaterial({ visible: false });

    // Central Hero Group + Hit Proxy on Layer 1
    const heroAnchorGroup = new THREE.Group();
    heroAnchorGroup.position.set(0, 0.28, 0);
    scene.add(heroAnchorGroup);

    const heroSpinGroup = new THREE.Group();
    heroAnchorGroup.add(heroSpinGroup);

    const heroProxy = new THREE.Mesh(proxySphereGeo, proxyInvisibleMat);
    heroProxy.scale.setScalar(2.25);
    heroProxy.layers.set(1);
    heroProxy.userData = { kind: 'hero' };
    heroAnchorGroup.add(heroProxy);

    // Build 8 Orbiting Satellite 3D Mini-Models + Tether Lines + Projected Buttons
    const satellites: SatelliteRuntimeNode[] = [];
    if (labelOverlayRef.current) {
      labelOverlayRef.current.innerHTML = '';
    }

    const pedestalTorusGeo = new THREE.TorusGeometry(0.92, 0.022, 10, 40);

    for (let i = 0; i < HOME_SATELLITE_CASES.length; i++) {
      const spec = HOME_SATELLITE_CASES[i];
      const [ix, iy, iz] = computeSatelliteWorldPosition(
        i,
        HOME_SATELLITE_CASES.length,
        0
      );

      const anchorGroup = new THREE.Group();
      anchorGroup.position.set(ix, iy, iz);
      scene.add(anchorGroup);

      const modelSpinGroup = buildSatelliteVisual3D(
        spec.visual,
        sphereGeo,
        cylGeo
      );
      // Give each mini-model a slight natural tilt for richer 3D depth
      modelSpinGroup.rotation.set(0.22, i * 0.65, -0.1);
      anchorGroup.add(modelSpinGroup);

      const pedestalMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(spec.accentHex),
        transparent: true,
        opacity: 0.42,
      });
      const pedestalMesh = new THREE.Mesh(pedestalTorusGeo, pedestalMat);
      pedestalMesh.rotation.x = -Math.PI / 2;
      pedestalMesh.position.y = -0.78;
      anchorGroup.add(pedestalMesh);

      // Radial tether line from central hero envelope to satellite
      const tetherGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.28, 0),
        new THREE.Vector3(ix, iy - 0.78, iz),
      ]);
      const tetherMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(spec.accentHex),
        transparent: true,
        opacity: 0.16,
      });
      const tetherLine = new THREE.Line(tetherGeo, tetherMat);
      scene.add(tetherLine);

      // Clickable 3D hit proxy on Layer 1
      const hitProxy = new THREE.Mesh(proxySphereGeo, proxyInvisibleMat);
      hitProxy.scale.setScalar(1.15);
      hitProxy.layers.set(1);
      hitProxy.userData = { kind: 'satellite', caseId: spec.id };
      anchorGroup.add(hitProxy);

      // Projected semantic <button> label over 3D satellite (visible on sm+ screens)
      let labelBtnEl: HTMLButtonElement | null = null;
      if (labelOverlayRef.current) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute(
          'aria-label',
          `跳转案例详情：${spec.titleZh} (${spec.formulaOrTag})`
        );
        btn.className =
          'pointer-events-auto hidden sm:flex items-center gap-1.5 absolute top-0 left-0 px-2.5 py-1 rounded-lg bg-[#0B1222]/94 border border-slate-700/90 hover:border-cyan-400 text-left whitespace-nowrap transition-colors shadow-lg focus-visible:outline-2 focus-visible:outline-cyan-400 cursor-pointer';
        btn.innerHTML = `<span class="text-xs font-semibold text-white">${spec.titleZh}</span><span class="text-[11px] text-slate-400" aria-hidden="true">·</span><span class="font-mono text-[11px] text-cyan-300">${spec.formulaOrTag}</span>`;

        btn.addEventListener('mouseenter', () => {
          setHoveredCaseId(spec.id);
        });
        btn.addEventListener('mouseleave', () => {
          setHoveredCaseId((prev) => (prev === spec.id ? null : prev));
        });
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onNavigateRef.current(spec.destination);
        });

        labelOverlayRef.current.appendChild(btn);
        labelBtnEl = btn;
      }

      satellites.push({
        spec,
        anchorGroup,
        modelSpinGroup,
        pedestalMat,
        tetherLine,
        tetherMat,
        hitProxy,
        currentScale: 1.0,
        labelBtnEl,
      });
    }

    // Raycaster strictly targeting Layer 1 (9 bounding proxies total)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const interactableProxies: THREE.Object3D[] = [
      heroProxy,
      ...satellites.map((s) => s.hitProxy),
    ];

    let disposed = false;
    let frameId = 0;
    let timerId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        timerId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 80);
        }
      };
      timerId = window.setTimeout(poll, 5);
    }

    function updateScenePositionsAndLabels(dt: number): boolean {
      const eng = engineRef.current;
      if (!eng) return false;

      let keepAlive = false;

      // Advance orbital revolution + gentle self-spin when autoOrbit is active
      if (autoOrbitRef.current) {
        eng.orbitAngleRad += dt * 0.14;
        eng.heroSpinGroup.rotation.y += dt * 0.28;
        keepAlive = true;
      }

      // Smooth camera preset transitions
      if (eng.cameraGoalPos && eng.cameraGoalTarget) {
        const k = 1 - Math.exp(-8.5 * Math.min(dt, 0.08));
        eng.camera.position.lerp(eng.cameraGoalPos, k);
        eng.controls.target.lerp(eng.cameraGoalTarget, k);
        if (eng.camera.position.distanceTo(eng.cameraGoalPos) < 0.03) {
          eng.camera.position.copy(eng.cameraGoalPos);
          eng.controls.target.copy(eng.cameraGoalTarget);
          eng.cameraGoalPos = null;
          eng.cameraGoalTarget = null;
        } else {
          keepAlive = true;
        }
      }

      const controlsMoved = eng.controls.update();
      if (controlsMoved && !isSoftwareGl) {
        keepAlive = true;
      }

      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const hoveredId = hoveredCaseIdRef.current;

      for (let i = 0; i < eng.satellites.length; i++) {
        const sat = eng.satellites[i];
        const [sxPos, syPos, szPos] = computeSatelliteWorldPosition(
          i,
          eng.satellites.length,
          eng.orbitAngleRad
        );
        sat.anchorGroup.position.set(sxPos, syPos, szPos);

        if (autoOrbitRef.current) {
          sat.modelSpinGroup.rotation.y += dt * 0.45;
        }

        const isHovered = hoveredId === sat.spec.id;
        const targetScale = isHovered ? 1.24 : 1.0;
        if (Math.abs(sat.currentScale - targetScale) > 0.004) {
          const dampK = isSoftwareGl ? 1.0 : 1 - Math.exp(-12 * Math.min(dt, 0.08));
          sat.currentScale += (targetScale - sat.currentScale) * dampK;
          if (!isSoftwareGl) keepAlive = true;
        } else {
          sat.currentScale = targetScale;
        }
        sat.modelSpinGroup.scale.setScalar(sat.currentScale);
        sat.pedestalMat.opacity = isHovered ? 0.92 : 0.42;
        sat.tetherMat.opacity = isHovered ? 0.72 : 0.15;

        // Update radial tether line endpoint from central ring out to satellite pedestal
        const posAttr = sat.tetherLine.geometry.getAttribute(
          'position'
        ) as THREE.BufferAttribute;
        _vDir.set(sxPos, 0, szPos);
        const horizLen = Math.max(0.001, _vDir.length());
        _vDir.divideScalar(horizLen);
        posAttr.setXYZ(0, _vDir.x * 2.35, -0.15, _vDir.z * 2.35);
        posAttr.setXYZ(1, sxPos, syPos - 0.78, szPos);
        posAttr.needsUpdate = true;

        // Project 2D clickable badge cleanly clear of both centerpiece and bottom dock
        if (sat.labelBtnEl) {
          const placeAbove = szPos > 3.2 || szPos < -3.6;
          const anchorY = placeAbove ? syPos + 0.98 : syPos - 1.05;
          _proj.set(sxPos * 1.04, anchorY, szPos);
          _proj.project(eng.camera);
          if (_proj.z > 1 || _proj.z < -1) {
            sat.labelBtnEl.style.opacity = '0';
          } else {
            const px = (_proj.x * 0.5 + 0.5) * w;
            const py = (-_proj.y * 0.5 + 0.5) * h;
            sat.labelBtnEl.style.opacity = isHovered ? '1' : '0.94';
            sat.labelBtnEl.style.borderColor = isHovered
              ? '#22d3ee'
              : 'rgba(51, 65, 85, 0.9)';
            const yShift = placeAbove ? '-100%' : '0';
            sat.labelBtnEl.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, ${yShift})`;
          }
        }
      }

      return keepAlive;
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.1, Math.max(0.005, (now - lastTime) / 1000));
        lastTime = now;

        const needsMore = updateScenePositionsAndLabels(dt);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsMore || autoOrbitRef.current) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    function flushImmediateRender() {
      if (disposed) return;
      lastTime = performance.now();
      updateScenePositionsAndLabels(0.016);
      renderer.render(scene, camera);
      requestRender();
    }

    // Pointer hover & click raycasting on 3D hero + satellite models
    const domEl = renderer.domElement;
    let pointerDownX = 0;
    let pointerDownY = 0;
    let lastHoverRaycastMs = 0;

    const pickHit = (clientX: number, clientY: number) => {
      const rect = domEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_mouse, camera);
      const hits = raycaster.intersectObjects(interactableProxies, false);
      return hits.length > 0 ? hits[0].object : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverRaycastMs < 45) return;
      lastHoverRaycastMs = now;
      const hit = pickHit(e.clientX, e.clientY);
      if (!hit) {
        domEl.style.cursor = 'grab';
        if (hoveredCaseIdRef.current !== null) {
          setHoveredCaseId(null);
        }
        return;
      }
      domEl.style.cursor = 'pointer';
      if (hit.userData.kind === 'satellite') {
        const cid = String(hit.userData.caseId);
        if (hoveredCaseIdRef.current !== cid) {
          setHoveredCaseId(cid);
        }
      } else {
        if (hoveredCaseIdRef.current !== null) {
          setHoveredCaseId(null);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const moveDist = Math.hypot(
        e.clientX - pointerDownX,
        e.clientY - pointerDownY
      );
      if (moveDist > 6) return; // Ignore OrbitControls drag gestures
      const hit = pickHit(e.clientX, e.clientY);
      if (!hit) return;

      if (hit.userData.kind === 'satellite') {
        const sat = HOME_SATELLITE_CASES.find(
          (c) => c.id === hit.userData.caseId
        );
        if (sat) {
          onNavigateRef.current(sat.destination);
        }
      } else if (hit.userData.kind === 'hero') {
        const curHero = activeHeroRef.current;
        onNavigateRef.current({
          kind: 'molecule',
          moleculeId: curHero.moleculeId,
          renderStyle: 'ball-stick',
        });
      }
    };

    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);

    const onControlsStart = () => {
      if (engineRef.current) {
        engineRef.current.cameraGoalPos = null;
        engineRef.current.cameraGoalTarget = null;
      }
    };
    const onControlsChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlsStart);
    controls.addEventListener('change', onControlsChange);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      flushImmediateRender();
    };
    domEl.addEventListener('webglcontextlost', onContextLost);
    domEl.addEventListener('webglcontextrestored', onContextRestored);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(entry.contentRect.width, 240);
        const h = Math.max(entry.contentRect.height, 240);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        const portrait = w < h * 0.85;
        controls.target.set(0, portrait ? 0.55 : -0.78, 0);
        camera.position.set(0, portrait ? 5.8 : 5.3, portrait ? 19.6 : 15.6);
        flushImmediateRender();
      }
    });
    resizeObserver.observe(container);

    engineRef.current = {
      renderer,
      scene,
      camera,
      controls,
      heroSpinGroup,
      heroProxy,
      satellites,
      sphereGeo,
      cylGeo,
      orbitAngleRad: 0,
      cameraGoalPos: null,
      cameraGoalTarget: null,
      isSoftwareGl,
      requestRender,
      flushImmediateRender,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    flushImmediateRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timerId);
      resizeObserver.disconnect();
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      domEl.removeEventListener('webglcontextlost', onContextLost);
      domEl.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      sphereGeo.dispose();
      cylGeo.dispose();
      proxySphereGeo.dispose();
      pedestalTorusGeo.dispose();
      trackGeo.dispose();
      shadowTex.dispose();
      gridTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (domEl.parentElement === container) {
        container.removeChild(domEl);
      }
      engineRef.current = null;
    };
  }, []);

  // Rebuild ONLY the central hero 3D model when activeHero changes
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    eng.heroSpinGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (
          mesh.geometry &&
          mesh.geometry !== eng.sphereGeo &&
          mesh.geometry !== eng.cylGeo
        ) {
          mesh.geometry.dispose();
        }
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    eng.heroSpinGroup.clear();

    const heroMol =
      MOLECULE_BY_ID[activeHero.moleculeId] ?? MOLECULE_BY_ID['fullerene-c60'];
    const hero3D = buildNormalizedMolecule3DGroup(
      heroMol,
      2.05,
      eng.sphereGeo,
      eng.cylGeo,
      { style: 'cpk' }
    );
    eng.heroSpinGroup.add(hero3D);
    eng.heroSpinGroup.rotation.set(0.18, 0.35, 0);
    eng.flushImmediateRender();
  }, [activeHero]);

  // Sync hover highlight & orbital play toggle immediately
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (autoOrbit) {
      eng.requestRender();
    } else {
      eng.flushImmediateRender();
    }
  }, [hoveredCaseId, autoOrbit]);

  return (
    <section
      aria-label="三维化学星系展示首页"
      className="relative flex-1 min-h-0 w-full h-full flex flex-col lg:block overflow-y-auto lg:overflow-hidden bg-[#090D16]"
    >
      {/* 3D Orbital Constellation Stage (Central Hero + 8 Orbiting Mini-Models) */}
      <div
        className="relative h-[380px] sm:h-[460px] lg:h-full w-full shrink-0 overflow-hidden select-none"
        data-testid="home-orbital-stage"
        data-active-hero={activeHero.moleculeId}
      >
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Projected Semantic Clickable Case Tags over 3D Satellites (Desktop/Tablet) */}
        <div
          ref={labelOverlayRef}
          className="pointer-events-none absolute inset-0 overflow-hidden z-10"
        />

        {/* Top-Left Editorial Hero Title & Centerpiece Switcher (Zero Center Occlusion) */}
        <div className="pointer-events-none absolute top-3.5 left-3.5 sm:top-5 sm:left-6 z-10 max-w-[min(430px,92%)] space-y-2">
          <div className="text-[11px] sm:text-xs font-medium text-cyan-300/90 tracking-wide">
            核心主模型与周边精选案例 · 点击任一模型直达详情
          </div>

          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
              {activeHero.titleZh}
            </h1>
            <span className="font-mono text-sm sm:text-lg font-semibold text-cyan-300">
              {activeHero.formula}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed hidden sm:block">
            {activeHero.subtitle}
          </p>

          {/* Interactive Centerpiece Switcher + Direct Jump CTA */}
          <div className="pointer-events-auto pt-0.5 flex items-center gap-1.5 flex-wrap">
            <div
              role="group"
              aria-label="切换中心展示主模型"
              className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0D1424]/95 border border-slate-800"
            >
              {HOME_HERO_MODELS.map((h) => {
                const selected = h.id === activeHero.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setActiveHeroId(h.id)}
                    aria-pressed={selected}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      selected
                        ? 'bg-slate-800 text-cyan-300 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {h.titleZh}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                onNavigateToDestination({
                  kind: 'molecule',
                  moleculeId: activeHero.moleculeId,
                  renderStyle: 'ball-stick',
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              <span>查看主模型详情</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {contextLost && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090D16]/95 p-6 text-center">
            <p className="text-sm text-slate-300">
              三维星系视窗正在恢复渲染上下文，请稍候…
            </p>
          </div>
        )}
      </div>

      {/* Collapsible Bottom Satellite Case Strip (Synced with 3D Orbiting Mini-Models) */}
      <div
        aria-label="周边小模型案例导航栏"
        className="relative w-full px-3 py-3 bg-[#0B101B] border-t border-slate-800/90 lg:bg-transparent lg:border-t-0 lg:p-0 lg:pointer-events-none lg:absolute lg:bottom-3.5 lg:left-1/2 lg:-translate-x-1/2 z-20 lg:w-[min(1140px,96%)] flex flex-col items-center"
      >
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          aria-expanded={!dockCollapsed}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-[#0E1525] border border-slate-700/80 rounded-t-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
              <span>展开周边案例栏 (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <span>隐藏周边案例栏 (H)</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full rounded-xl bg-[#0E1525]/96 border border-slate-700/80 p-3 shadow-2xl space-y-2.5">
            {/* Top Status & Scene Utility Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1 text-slate-300 truncate">
                {focusedSatellite ? (
                  <span>
                    <strong className="text-cyan-300 font-semibold">
                      {focusedSatellite.titleZh} ({focusedSatellite.formulaOrTag})
                    </strong>
                    <span className="mx-1.5 text-slate-500" aria-hidden="true">
                      ·
                    </span>
                    <span>{focusedSatellite.description}</span>
                  </span>
                ) : (
                  <span>
                    围绕中心 <strong className="text-white">{activeHero.titleZh}</strong> 排布 8 组经典分子、原子与化学反应小模型，点击任一模型或下方卡片即可跳转对应详情页
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto flex-wrap">
                <button
                  type="button"
                  onClick={() => setAutoOrbit((prev) => !prev)}
                  aria-pressed={autoOrbit}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    autoOrbit
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {autoOrbit ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  <span>环绕公转</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const eng = engineRef.current;
                    if (!eng) return;
                    const portrait =
                      eng.renderer.domElement.clientWidth <
                      eng.renderer.domElement.clientHeight * 0.85;
                    eng.orbitAngleRad = 0;
                    eng.cameraGoalTarget = new THREE.Vector3(
                      0,
                      portrait ? 0.55 : -0.78,
                      0
                    );
                    eng.cameraGoalPos = new THREE.Vector3(
                      0,
                      portrait ? 5.8 : 5.3,
                      portrait ? 19.6 : 15.6
                    );
                    eng.flushImmediateRender();
                  }}
                  aria-label="重置首页三维视角"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>重置视角</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenPeriodicTable}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400/60 hover:text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <Table2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">118 元素周期表</span>
                  <span className="sm:hidden">周期表</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenCatalog}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400/60 hover:text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
                >
                  <Grid className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">全部结构图鉴</span>
                  <span className="sm:hidden">图鉴</span>
                </button>
              </div>
            </div>

            {/* 8 Surrounding Case Cards (1-Click Jump to Corresponding Detailed View) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {HOME_SATELLITE_CASES.map((sat) => {
                const isHovered = hoveredCaseId === sat.id;
                return (
                  <button
                    key={sat.id}
                    type="button"
                    onMouseEnter={() => setHoveredCaseId(sat.id)}
                    onMouseLeave={() =>
                      setHoveredCaseId((prev) => (prev === sat.id ? null : prev))
                    }
                    onFocus={() => setHoveredCaseId(sat.id)}
                    onBlur={() =>
                      setHoveredCaseId((prev) => (prev === sat.id ? null : prev))
                    }
                    onClick={() => onNavigateToDestination(sat.destination)}
                    className={`group rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                      isHovered
                        ? 'bg-cyan-950/45 border-cyan-400'
                        : 'bg-[#090E1A] border-slate-800/90 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-white truncate">
                        {sat.titleZh}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300 shrink-0 transition-colors" />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400 truncate">
                      <span className="font-mono text-cyan-300/90 truncate">
                        {sat.formulaOrTag}
                      </span>
                      <span className="lg:hidden" aria-hidden="true">
                        ·
                      </span>
                      <span className="lg:hidden truncate">
                        {sat.categoryLabel}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
});
