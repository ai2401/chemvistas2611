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
import { ChemicalElement, ELEMENT_BY_SYMBOL } from '../chemistry/elements';
import { BondOrder, MoleculeModel } from '../chemistry/molecules';
import {
  build3DAtomStructure,
  computeCenteredCoordinates,
  measureAtomSelection,
} from '../chemistry/calculations';
import { computeMoleculeElectrostatics } from '../chemistry/electrostatics';
import {
  buildQuantumOrbital3D,
  QUANTUM_ORBITAL_MAP,
  QuantumOrbitalId,
} from '../chemistry/quantumOrbitals';
import { getSafeElementNameZh } from '../utils/glyphSupport';

export type StageMode = 'molecule' | 'atom';
export type AtomViewMode = 'bohr' | 'quantum';
export type RenderStyle = 'ball-stick' | 'space-filling' | 'esp' | 'wireframe';
export type MoleculeToolMode = 'inspect' | 'measure' | 'build';
export type CameraPreset = 'isometric' | 'front' | 'top' | 'side' | 'reset';

export interface ChemistryStage3DHandle {
  setCameraPreset: (preset: CameraPreset) => void;
  exportSnapshotDataUrl: () => string | null;
}

interface ChemistryStage3DProps {
  stageMode: StageMode;
  atomViewMode: AtomViewMode;
  quantumOrbitalId: QuantumOrbitalId;
  molecule: MoleculeModel;
  moleculeRevision: number;
  activeElement: ChemicalElement;
  selectedAtomId: number | null;
  highlightedElementSymbol: string | null;
  renderStyle: RenderStyle;
  showDipoleVector: boolean;
  toolMode: MoleculeToolMode;
  measurementAtomIds: number[];
  pendingConnectAtomId: number | null;
  explodeFactor: number; // 0..1
  atomScale: number; // 0.5..1.5
  showAtomLabels: boolean;
  autoRotate: boolean;
  hideHeaderOverlay?: boolean;
  onAtomInteract: (atomId: number, elementSymbol: string) => void;
}

interface HoverReadout {
  x: number;
  y: number;
  title: string;
  subtitle: string;
}

interface AtomRuntimeRecord {
  atomId: number;
  elementSymbol: string;
  cpkColorHex: string;
  espColorHex: string;
  partialCharge: number;
  basePos: THREE.Vector3;
  currentPos: THREE.Vector3;
  group: THREE.Group;
  sphereMesh: THREE.Mesh;
  haloMesh: THREE.Mesh;
  baseRadius: number;
  labelEl: HTMLSpanElement | null;
  defaultLabelText: string;
}

interface BondRuntimeRecord {
  fromId: number;
  toId: number;
  order: BondOrder;
  group: THREE.Group;
  shafts: THREE.Mesh[];
  collars: THREE.Mesh[];
}

interface OrbitalElectronRuntime {
  mesh: THREE.Mesh;
  shellIndex: number;
  radius: number;
  baseAngle: number;
  speed: number;
}

// Pre-allocated math scratch objects outside render loop (zero GC per frame)
const _vStart = new THREE.Vector3();
const _vEnd = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vPerp = new THREE.Vector3();
const _vPerp2 = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _vAlt = new THREE.Vector3(1, 0, 0);
const _quat = new THREE.Quaternion();
const _proj = new THREE.Vector3();
const _camOffset = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl');
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

function createCalibrationStageTextures(maxAnisotropy: number): {
  shadowTex: THREE.CanvasTexture;
  gridTex: THREE.CanvasTexture;
  particleTex: THREE.CanvasTexture;
} {
  // 1. Soft radial contact shadow
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 256;
  sCanvas.height = 256;
  const sCtx = sCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(128, 128, 12, 128, 128, 120);
  grad.addColorStop(0, 'rgba(2, 6, 16, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 6, 16, 0.28)');
  grad.addColorStop(1, 'rgba(2, 6, 16, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);
  const shadowTex = new THREE.CanvasTexture(sCanvas);

  // 2. Scientific Ångström concentric calibration dial
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 512;
  gCanvas.height = 512;
  const gCtx = gCanvas.getContext('2d')!;
  gCtx.clearRect(0, 0, 512, 512);
  const cx = 256;
  const cy = 256;

  gCtx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
  gCtx.lineWidth = 1.2;
  const radii = [60, 120, 180, 236];
  radii.forEach((r, idx) => {
    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.stroke();

    gCtx.fillStyle = 'rgba(148, 163, 184, 0.55)';
    gCtx.font = '500 13px "IBM Plex Mono", monospace';
    gCtx.fillText(`${idx + 1} Å`, cx + r + 4, cy - 4);
  });

  gCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  gCtx.beginPath();
  gCtx.moveTo(cx - 244, cy);
  gCtx.lineTo(cx + 244, cy);
  gCtx.moveTo(cx, cy - 244);
  gCtx.lineTo(cx, cy + 244);
  gCtx.stroke();

  const gridTex = new THREE.CanvasTexture(gCanvas);
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.anisotropy = maxAnisotropy;

  // 3. Soft radial glow sprite for quantum wavefunction probability clouds
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 64;
  pCanvas.height = 64;
  const pCtx = pCanvas.getContext('2d')!;
  const pGrad = pCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  pGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  pGrad.addColorStop(0.42, 'rgba(255, 255, 255, 0.68)');
  pGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 64, 64);
  const particleTex = new THREE.CanvasTexture(pCanvas);
  particleTex.colorSpace = THREE.SRGBColorSpace;

  return { shadowTex, gridTex, particleTex };
}

function createTeardropLobeGeometry(length: number, maxWidth: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 at nucleus -> 1 at outer tip
    const y = t * length;
    // Teardrop profile: pinches smoothly at origin (0) and rounds smoothly at outer tip (length)
    const radial = Math.sin(t * Math.PI) * Math.pow(t, 0.38) * (maxWidth * 0.56);
    pts.push(new THREE.Vector2(Math.max(0, radial), y));
  }
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.computeVertexNormals();
  return geo;
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const anyObj = obj as THREE.Mesh | THREE.Points | THREE.LineSegments;
    if (anyObj.geometry) {
      anyObj.geometry.dispose();
    }
    const mat = (anyObj as THREE.Mesh).material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
}

const METALLIC_ELEMENTS = new Set([
  'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn',
  'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo',
  'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Cs', 'Ba', 'Hf', 'Ta', 'W',
  'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi',
]);

export const ChemistryStage3D = forwardRef<ChemistryStage3DHandle, ChemistryStage3DProps>(
  function ChemistryStage3D(
    {
      stageMode,
      atomViewMode,
      quantumOrbitalId,
      molecule,
      moleculeRevision,
      activeElement,
      selectedAtomId,
      highlightedElementSymbol,
      renderStyle,
      showDipoleVector,
      toolMode,
      measurementAtomIds,
      pendingConnectAtomId,
      explodeFactor,
      atomScale,
      showAtomLabels,
      autoRotate,
      hideHeaderOverlay = false,
      onAtomInteract,
    },
    ref
  ) {
    const canvasMountRef = useRef<HTMLDivElement | null>(null);
    const labelLayerRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);
    const [hoverReadout, setHoverReadout] = useState<HoverReadout | null>(null);

    const electrostatics = useMemo(
      () => computeMoleculeElectrostatics(molecule),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [molecule, moleculeRevision]
    );

    const measurementSummary = useMemo(
      () => measureAtomSelection(molecule, measurementAtomIds),
      [molecule, measurementAtomIds]
    );

    // Keep latest props in refs so WebGL scene never tears down on HUD updates
    const onAtomInteractRef = useRef(onAtomInteract);
    onAtomInteractRef.current = onAtomInteract;

    const showLabelsRef = useRef(showAtomLabels);
    showLabelsRef.current = showAtomLabels;

    const toolModeRef = useRef(toolMode);
    toolModeRef.current = toolMode;

    const measurementIdsRef = useRef(measurementAtomIds);
    measurementIdsRef.current = measurementAtomIds;

    const targetExplodeRef = useRef(explodeFactor);
    targetExplodeRef.current = explodeFactor;

    const currentExplodeRef = useRef(explodeFactor);
    const atomScaleRef = useRef(atomScale);
    atomScaleRef.current = atomScale;

    const autoRotateRef = useRef(autoRotate);
    autoRotateRef.current = autoRotate;

    const stageModeRef = useRef(stageMode);
    stageModeRef.current = stageMode;

    const renderStyleRef = useRef(renderStyle);
    renderStyleRef.current = renderStyle;

    const prevSceneIdentityRef = useRef<string>('');

    // Scene internals stored in ref for imperative camera & rebuild triggers
    const engineRef = useRef<{
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      subjectGroup: THREE.Group;
      dipoleGroup: THREE.Group | null;
      rulerGroup: THREE.Group | null;
      stageGroup: THREE.Group;
      particleTex: THREE.CanvasTexture;
      interactables: THREE.Object3D[];
      atomRecords: AtomRuntimeRecord[];
      bondRecords: BondRuntimeRecord[];
      orbitalElectrons: OrbitalElectronRuntime[];
      boundingDistance: number;
      cameraGoalPos: THREE.Vector3 | null;
      cameraGoalTarget: THREE.Vector3 | null;
      requestRender: () => void;
      flushImmediateRender: () => void;
      isSoftwareGl: boolean;
    } | null>(null);

    const updateBondTransform = (
      bond: BondRuntimeRecord,
      atomMap: Map<number, AtomRuntimeRecord>,
      style: RenderStyle
    ) => {
      const a = atomMap.get(bond.fromId);
      const b = atomMap.get(bond.toId);
      if (!a || !b) return;

      if (style === 'space-filling') {
        bond.group.visible = false;
        return;
      }
      bond.group.visible = true;

      _vStart.copy(a.currentPos);
      _vEnd.copy(b.currentPos);
      _vDir.subVectors(_vEnd, _vStart);
      const dist = _vDir.length();
      if (dist < 0.0001) return;

      _vMid.addVectors(_vStart, _vEnd).multiplyScalar(0.5);
      _vDir.normalize();
      _quat.setFromUnitVectors(_vUp, _vDir);

      const refVec = Math.abs(_vDir.dot(_vUp)) > 0.9 ? _vAlt : _vUp;
      _vPerp.crossVectors(_vDir, refVec).normalize();
      _vPerp2.crossVectors(_vDir, _vPerp).normalize();

      const shaftCount = bond.shafts.length;
      const thinScale = style === 'wireframe' ? 0.55 : 1.0;

      if (shaftCount === 1) {
        const shaft = bond.shafts[0];
        shaft.position.copy(_vMid);
        shaft.quaternion.copy(_quat);
        shaft.scale.set(thinScale, dist, thinScale);
      } else if (shaftCount === 2) {
        const sep = bond.order === 'aromatic' ? 0.095 : 0.105;
        bond.shafts.forEach((shaft, idx) => {
          const sign = idx === 0 ? -1 : 1;
          shaft.position.copy(_vMid).addScaledVector(_vPerp, sign * sep);
          shaft.quaternion.copy(_quat);
          const lenScale = bond.order === 'aromatic' && idx === 1 ? dist * 0.72 : dist;
          shaft.scale.set(thinScale * 0.76, lenScale, thinScale * 0.76);
        });
      } else if (shaftCount === 3) {
        const sep = 0.115;
        const offsets = [-1, 0, 1];
        bond.shafts.forEach((shaft, idx) => {
          shaft.position.copy(_vMid).addScaledVector(_vPerp, offsets[idx] * sep);
          shaft.quaternion.copy(_quat);
          shaft.scale.set(thinScale * 0.65, dist, thinScale * 0.65);
        });
      }

      if (bond.collars.length === 2) {
        const showCollars = style === 'ball-stick' || style === 'esp';
        bond.collars[0].visible = showCollars;
        bond.collars[1].visible = showCollars;
        if (showCollars) {
          const rA = a.baseRadius * atomScaleRef.current;
          const rB = b.baseRadius * atomScaleRef.current;
          bond.collars[0].position
            .copy(_vStart)
            .addScaledVector(_vDir, Math.min(dist * 0.35, rA * 0.92));
          bond.collars[0].quaternion.copy(_quat);

          bond.collars[1].position
            .copy(_vEnd)
            .addScaledVector(_vDir, -Math.min(dist * 0.35, rB * 0.92));
          bond.collars[1].quaternion.copy(_quat);
        }
      }
    };

    const rebuildRulerOverlay = (
      rulerGroup: THREE.Group,
      atomMap: Map<number, AtomRuntimeRecord>,
      ids: number[]
    ) => {
      disposeObjectTree(rulerGroup);
      rulerGroup.clear();
      if (ids.length < 2) return;

      const rodGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 10);
      const rodMat = new THREE.MeshBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.92,
      });

      for (let i = 0; i < ids.length - 1; i++) {
        const a = atomMap.get(ids[i]);
        const b = atomMap.get(ids[i + 1]);
        if (!a || !b) continue;
        _vStart.copy(a.currentPos);
        _vEnd.copy(b.currentPos);
        _vDir.subVectors(_vEnd, _vStart);
        const len = _vDir.length();
        if (len < 1e-4) continue;
        _vMid.addVectors(_vStart, _vEnd).multiplyScalar(0.5);
        _vDir.normalize();
        _quat.setFromUnitVectors(_vUp, _vDir);

        const seg = new THREE.Mesh(rodGeo.clone(), rodMat.clone());
        seg.position.copy(_vMid);
        seg.quaternion.copy(_quat);
        seg.scale.set(1, len, 1);
        rulerGroup.add(seg);
      }

      rodGeo.dispose();
      rodMat.dispose();
    };

    useImperativeHandle(ref, () => ({
      setCameraPreset(preset: CameraPreset) {
        const eng = engineRef.current;
        if (!eng) return;
        const d = eng.boundingDistance;
        eng.cameraGoalTarget = new THREE.Vector3(0, 0, 0);

        switch (preset) {
          case 'front':
            eng.cameraGoalPos = new THREE.Vector3(0, 0.15 * d, d);
            break;
          case 'top':
            eng.cameraGoalPos = new THREE.Vector3(0, d * 1.05, 0.08 * d);
            break;
          case 'side':
            eng.cameraGoalPos = new THREE.Vector3(d, 0.12 * d, 0);
            break;
          case 'isometric':
          case 'reset':
          default:
            eng.cameraGoalPos = new THREE.Vector3(d * 0.62, d * 0.44, d * 0.76);
            break;
        }
        eng.requestRender();
      },
      exportSnapshotDataUrl() {
        const eng = engineRef.current;
        if (!eng) return null;
        try {
          eng.renderer.render(eng.scene, eng.camera);
          return eng.renderer.domElement.toDataURL('image/png');
        } catch {
          return null;
        }
      },
    }));

    // Mount WebGLRenderer & Scene ONCE
    useEffect(() => {
      const container = canvasMountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareGl();
      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const initW = Math.max(container.clientWidth, 320);
      const initH = Math.max(container.clientHeight, 320);
      renderer.setSize(initW, initH);
      renderer.domElement.className = 'block w-full h-full outline-none';
      renderer.domElement.setAttribute('data-testid', 'chemistry-3d-canvas');
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x090d16);
      scene.fog = new THREE.FogExp2(0x090d16, 0.02);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      pmremGenerator.dispose();

      // Balanced 3-Point Warm/Cool Studio Rig
      const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.85);
      hemiLight.position.set(0, 15, 0);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.85);
      keyLight.position.set(6, 9, 7);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        const sd = 7;
        keyLight.shadow.camera.left = -sd;
        keyLight.shadow.camera.right = sd;
        keyLight.shadow.camera.top = sd;
        keyLight.shadow.camera.bottom = -sd;
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 26;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.02;
      }
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
      rimLight.position.set(-6, 4, -7);
      scene.add(rimLight);

      const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.1, 140);
      camera.position.set(4.5, 3.2, 5.6);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.rotateSpeed = 0.85;
      controls.zoomSpeed = 0.95;
      controls.minDistance = 1.8;
      controls.maxDistance = 36.0;
      controls.autoRotate = false;

      const subjectGroup = new THREE.Group();
      scene.add(subjectGroup);

      // Grounded Calibration Stage Group (Contact shadow + Ångström dial)
      const stageGroup = new THREE.Group();
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const { shadowTex, gridTex, particleTex } =
        createCalibrationStageTextures(maxAniso);

      const shadowDisc = new THREE.Mesh(
        new THREE.CircleGeometry(4.2, 40),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.55,
        })
      );
      shadowDisc.rotation.x = -Math.PI / 2;
      shadowDisc.position.y = 0;
      stageGroup.add(shadowDisc);

      const dialDisc = new THREE.Mesh(
        new THREE.CircleGeometry(4.6, 48),
        new THREE.MeshBasicMaterial({
          map: gridTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.78,
        })
      );
      dialDisc.rotation.x = -Math.PI / 2;
      dialDisc.position.y = 0.025;
      stageGroup.add(dialDisc);
      scene.add(stageGroup);

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

      function updateAtomLabelsDOM() {
        const eng = engineRef.current;
        if (!eng) return;
        const isMol = stageModeRef.current === 'molecule';
        const mIds = measurementIdsRef.current;
        const isMeasureMode = toolModeRef.current === 'measure';
        const showAll = showLabelsRef.current && isMol;
        const w = renderer.domElement.clientWidth;
        const h = renderer.domElement.clientHeight;

        for (const rec of eng.atomRecords) {
          if (!rec.labelEl) continue;
          const measureRank = isMeasureMode ? mIds.indexOf(rec.atomId) : -1;
          const shouldShow = isMol && (showAll || measureRank >= 0);

          if (!shouldShow) {
            rec.labelEl.style.opacity = '0';
            continue;
          }

          if (measureRank >= 0) {
            rec.labelEl.textContent = `#${measureRank + 1} ${rec.defaultLabelText}`;
            rec.labelEl.style.borderColor = '#34D399';
            rec.labelEl.style.color = '#6EE7B7';
          } else {
            rec.labelEl.textContent = rec.defaultLabelText;
            rec.labelEl.style.borderColor = 'rgba(51, 65, 85, 0.7)';
            rec.labelEl.style.color = '#F1F5F9';
          }

          _proj.copy(rec.currentPos);
          eng.subjectGroup.localToWorld(_proj);
          _proj.project(eng.camera);

          if (_proj.z > 1 || _proj.z < -1) {
            rec.labelEl.style.opacity = '0';
            continue;
          }
          const sx = (_proj.x * 0.5 + 0.5) * w;
          const sy = (-_proj.y * 0.5 + 0.5) * h;
          rec.labelEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
          rec.labelEl.style.opacity = '1';
        }
      }

      function stepScene(dt: number): boolean {
        const eng = engineRef.current;
        if (!eng) return false;
        let keepAnimating = false;

        if (eng.cameraGoalPos && eng.cameraGoalTarget) {
          const alpha = 1 - Math.exp(-7.5 * dt);
          eng.camera.position.lerp(eng.cameraGoalPos, alpha);
          eng.controls.target.lerp(eng.cameraGoalTarget, alpha);
          if (
            eng.camera.position.distanceTo(eng.cameraGoalPos) < 0.02 &&
            eng.controls.target.distanceTo(eng.cameraGoalTarget) < 0.02
          ) {
            eng.camera.position.copy(eng.cameraGoalPos);
            eng.controls.target.copy(eng.cameraGoalTarget);
            eng.cameraGoalPos = null;
            eng.cameraGoalTarget = null;
          } else {
            keepAnimating = true;
          }
        }

        const explodeDiff = Math.abs(targetExplodeRef.current - currentExplodeRef.current);
        if (explodeDiff > 0.001 && stageModeRef.current === 'molecule') {
          currentExplodeRef.current = THREE.MathUtils.damp(
            currentExplodeRef.current,
            targetExplodeRef.current,
            9,
            dt
          );
          const scale = 1 + currentExplodeRef.current * 1.15;
          const atomMap = new Map<number, AtomRuntimeRecord>();
          for (const rec of eng.atomRecords) {
            rec.currentPos.copy(rec.basePos).multiplyScalar(scale);
            rec.group.position.copy(rec.currentPos);
            atomMap.set(rec.atomId, rec);
          }
          for (const bond of eng.bondRecords) {
            updateBondTransform(bond, atomMap, renderStyleRef.current);
          }
          if (eng.rulerGroup && measurementIdsRef.current.length >= 2) {
            rebuildRulerOverlay(eng.rulerGroup, atomMap, measurementIdsRef.current);
          }
          keepAnimating = true;
        }

        if (autoRotateRef.current) {
          eng.subjectGroup.rotation.y += dt * 0.55;
          keepAnimating = true;
        }

        if (stageModeRef.current === 'atom' && autoRotateRef.current) {
          for (const elOrb of eng.orbitalElectrons) {
            elOrb.baseAngle += dt * elOrb.speed;
            elOrb.mesh.position.set(
              Math.cos(elOrb.baseAngle) * elOrb.radius,
              Math.sin(elOrb.baseAngle) * elOrb.radius,
              0
            );
          }
          keepAnimating = true;
        }

        const controlsChanged = eng.controls.update();
        if (controlsChanged && !isSoftwareGl) {
          keepAnimating = true;
        }

        return keepAnimating;
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
          const dt = Math.min(0.06, Math.max(0.001, (now - lastTime) / 1000));
          lastTime = now;

          const needsMoreFrames = stepScene(dt);
          renderer.render(scene, camera);
          updateAtomLabelsDOM();

          const done = () => {
            renderBusy = false;
            if (renderDirty || needsMoreFrames) {
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
        stepScene(0.016);
        renderer.render(scene, camera);
        updateAtomLabelsDOM();
        requestRender();
      }

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

      const onKeyDown = (e: KeyboardEvent) => {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
          return;
        }
        const eng = engineRef.current;
        if (!eng) return;

        const rotStep = 0.14;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          _camOffset.subVectors(eng.camera.position, eng.controls.target);
          _camOffset.applyAxisAngle(_vUp, -rotStep);
          eng.camera.position.copy(eng.controls.target).add(_camOffset);
          eng.camera.lookAt(eng.controls.target);
          requestRender();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          _camOffset.subVectors(eng.camera.position, eng.controls.target);
          _camOffset.applyAxisAngle(_vUp, rotStep);
          eng.camera.position.copy(eng.controls.target).add(_camOffset);
          eng.camera.lookAt(eng.controls.target);
          requestRender();
        } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          eng.subjectGroup.rotation.x -= rotStep;
          requestRender();
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          eng.subjectGroup.rotation.x += rotStep;
          requestRender();
        }
      };
      window.addEventListener('keydown', onKeyDown);

      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();
      let downX = 0;
      let downY = 0;
      let lastHoverCheck = 0;

      const onPointerDown = (e: PointerEvent) => {
        downX = e.clientX;
        downY = e.clientY;
      };

      const onPointerUp = (e: PointerEvent) => {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moved > 6) return;

        const eng = engineRef.current;
        if (!eng || stageModeRef.current !== 'molecule') return;

        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointerNdc, eng.camera);
        const hits = raycaster.intersectObjects(eng.interactables, false);
        if (hits.length > 0) {
          const hitObj = hits[0].object;
          const atomId = hitObj.userData.atomId as number | undefined;
          const elementSymbol = hitObj.userData.elementSymbol as string | undefined;
          if (typeof atomId === 'number' && elementSymbol) {
            onAtomInteractRef.current(atomId, elementSymbol);
          }
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        const now = performance.now();
        if (now - lastHoverCheck < 45) return;
        lastHoverCheck = now;

        const eng = engineRef.current;
        if (!eng || stageModeRef.current !== 'molecule') {
          setHoverReadout(null);
          renderer.domElement.style.cursor = 'grab';
          return;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointerNdc, eng.camera);
        const hits = raycaster.intersectObjects(eng.interactables, false);
        if (hits.length > 0) {
          const hitObj = hits[0].object;
          const atomId = hitObj.userData.atomId as number;
          const sym = hitObj.userData.elementSymbol as string;
          const q = hitObj.userData.partialCharge as number | undefined;
          const el = ELEMENT_BY_SYMBOL[sym];
          renderer.domElement.style.cursor = 'pointer';
          if (el) {
            const safeZh = getSafeElementNameZh(el.number, el.nameZh);
            const actionHint =
              toolModeRef.current === 'build'
                ? '点击执行三维分子搭建操作'
                : toolModeRef.current === 'measure'
                  ? '点击加入自由几何测量尺'
                  : `局部电荷 ${q !== undefined ? (q >= 0 ? `+${q.toFixed(2)}` : q.toFixed(2)) : '0.00'} e · 点击查看键角`;
            setHoverReadout({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              title: `${el.symbol} · ${safeZh.text} (#${atomId + 1})`,
              subtitle: actionHint,
            });
          }
        } else {
          renderer.domElement.style.cursor = 'grab';
          setHoverReadout(null);
        }
      };

      const onPointerLeave = () => {
        setHoverReadout(null);
      };

      const domEl = renderer.domElement;
      domEl.addEventListener('pointerdown', onPointerDown);
      domEl.addEventListener('pointerup', onPointerUp);
      domEl.addEventListener('pointermove', onPointerMove);
      domEl.addEventListener('pointerleave', onPointerLeave);

      const onContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onContextRestored = () => {
        setContextLost(false);
        requestRender();
      };
      domEl.addEventListener('webglcontextlost', onContextLost);
      domEl.addEventListener('webglcontextrestored', onContextRestored);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = Math.max(entry.contentRect.width, 200);
          const height = Math.max(entry.contentRect.height, 200);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          renderer.render(scene, camera);
          updateAtomLabelsDOM();
          requestRender();
        }
      });
      resizeObserver.observe(container);

      engineRef.current = {
        renderer,
        scene,
        camera,
        controls,
        subjectGroup,
        dipoleGroup: null,
        rulerGroup: null,
        stageGroup,
        particleTex,
        interactables: [],
        atomRecords: [],
        bondRecords: [],
        orbitalElectrons: [],
        boundingDistance: 7.5,
        cameraGoalPos: null,
        cameraGoalTarget: null,
        requestRender,
        flushImmediateRender,
        isSoftwareGl,
      };

      requestRender();

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(timerId);
        resizeObserver.disconnect();
        window.removeEventListener('keydown', onKeyDown);
        controls.removeEventListener('start', onControlsStart);
        controls.removeEventListener('change', onControlsChange);
        domEl.removeEventListener('pointerdown', onPointerDown);
        domEl.removeEventListener('pointerup', onPointerUp);
        domEl.removeEventListener('pointermove', onPointerMove);
        domEl.removeEventListener('pointerleave', onPointerLeave);
        domEl.removeEventListener('webglcontextlost', onContextLost);
        domEl.removeEventListener('webglcontextrestored', onContextRestored);
        controls.dispose();
        disposeObjectTree(subjectGroup);
        disposeObjectTree(stageGroup);
        shadowTex.dispose();
        gridTex.dispose();
        particleTex.dispose();
        envTexture.dispose();
        renderer.dispose();
        if (domEl.parentElement === container) {
          container.removeChild(domEl);
        }
        engineRef.current = null;
      };
    }, []);

    // Rebuild 3D Subject when stageMode, atomViewMode, quantumOrbitalId, molecule, or activeElement changes
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      const nextIdentity =
        stageMode === 'molecule'
          ? `mol:${molecule.id}`
          : `atom:${atomViewMode}:${activeElement.number}:${quantumOrbitalId}`;
      const preserveCamera =
        stageMode === 'molecule' && prevSceneIdentityRef.current === nextIdentity;
      prevSceneIdentityRef.current = nextIdentity;

      const savedRotation = eng.subjectGroup.rotation.clone();

      disposeObjectTree(eng.subjectGroup);
      eng.subjectGroup.clear();
      if (preserveCamera) {
        eng.subjectGroup.rotation.copy(savedRotation);
      } else {
        eng.subjectGroup.rotation.set(0, 0, 0);
      }

      eng.dipoleGroup = null;
      eng.rulerGroup = null;
      eng.interactables = [];
      eng.atomRecords = [];
      eng.bondRecords = [];
      eng.orbitalElectrons = [];
      setHoverReadout(null);

      if (labelLayerRef.current) {
        labelLayerRef.current.innerHTML = '';
      }

      if (stageMode === 'molecule') {
        const { centroid, centeredPositions, boundingRadius } =
          computeCenteredCoordinates(molecule.atoms);

        currentExplodeRef.current = targetExplodeRef.current;
        const explodeScale = 1 + currentExplodeRef.current * 1.15;

        const segs = molecule.atoms.length > 36 ? 20 : 28;
        const sphereGeo = new THREE.SphereGeometry(1, segs, segs);
        const haloGeo = new THREE.TorusGeometry(1.38, 0.055, 12, 36);
        const shaftGeo = new THREE.CylinderGeometry(0.085, 0.085, 1, 14, 1, false);
        const collarGeo = new THREE.CylinderGeometry(0.118, 0.118, 0.075, 14);

        const collarMat = new THREE.MeshStandardMaterial({
          color: 0x94a3b8,
          roughness: 0.32,
          metalness: 0.72,
        });

        let minY = 0;

        for (const atom of molecule.atoms) {
          const el = ELEMENT_BY_SYMBOL[atom.element];
          const espInfo = electrostatics.atomMap.get(atom.id);
          const basePosArr = centeredPositions.get(atom.id) ?? [0, 0, 0];
          const basePos = new THREE.Vector3(basePosArr[0], basePosArr[1], basePosArr[2]);
          const curPos = basePos.clone().multiplyScalar(explodeScale);
          if (curPos.y < minY) minY = curPos.y;

          const covAngstrom = (el?.covalentRadius ?? 75) / 100;
          const densityScale = molecule.atoms.length >= 25 ? 0.82 : 1.0;
          const baseRadius =
            Math.max(0.24, Math.min(0.68, 0.18 + covAngstrom * 0.28)) *
            densityScale;

          const cpkColorHex = el?.cpkColor ?? '#94A3B8';
          const espColorHex = espInfo?.espColorHex ?? '#E2E8F0';
          const isMetal = METALLIC_ELEMENTS.has(atom.element);

          const atomMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(renderStyle === 'esp' ? espColorHex : cpkColorHex),
            roughness: isMetal && renderStyle !== 'esp' ? 0.18 : 0.22,
            metalness: isMetal && renderStyle !== 'esp' ? 0.85 : 0.08,
            clearcoat: 0.65,
            clearcoatRoughness: 0.14,
          });

          const atomGroup = new THREE.Group();
          atomGroup.position.copy(curPos);

          const sphereMesh = new THREE.Mesh(sphereGeo.clone(), atomMat);
          sphereMesh.scale.setScalar(baseRadius);
          sphereMesh.castShadow = !eng.isSoftwareGl;
          sphereMesh.receiveShadow = !eng.isSoftwareGl;
          sphereMesh.userData = {
            atomId: atom.id,
            elementSymbol: atom.element,
            partialCharge: espInfo?.partialCharge ?? 0,
          };
          atomGroup.add(sphereMesh);

          const haloMat = new THREE.MeshBasicMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.92,
          });
          const haloMesh = new THREE.Mesh(haloGeo.clone(), haloMat);
          haloMesh.visible = false;
          atomGroup.add(haloMesh);

          eng.subjectGroup.add(atomGroup);
          eng.interactables.push(sphereMesh);

          const defaultLabelText = `${atom.element}${molecule.atoms.length <= 32 ? atom.id + 1 : ''}`;
          let labelEl: HTMLSpanElement | null = null;
          if (labelLayerRef.current) {
            labelEl = document.createElement('span');
            labelEl.className =
              'pointer-events-none absolute left-0 top-0 select-none font-mono text-[11px] font-semibold text-slate-100 bg-[#090D16]/90 border border-slate-700/70 px-1.5 py-0.5 rounded transition-opacity duration-100';
            labelEl.textContent = defaultLabelText;
            labelEl.style.opacity = '0';
            labelLayerRef.current.appendChild(labelEl);
          }

          eng.atomRecords.push({
            atomId: atom.id,
            elementSymbol: atom.element,
            cpkColorHex,
            espColorHex,
            partialCharge: espInfo?.partialCharge ?? 0,
            basePos,
            currentPos: curPos,
            group: atomGroup,
            sphereMesh,
            haloMesh,
            baseRadius,
            labelEl,
            defaultLabelText,
          });
        }

        const atomRecMap = new Map(eng.atomRecords.map((r) => [r.atomId, r]));

        for (const bond of molecule.bonds) {
          const bondGroup = new THREE.Group();
          const isIonic = bond.order === 'ionic';
          const isAromatic = bond.order === 'aromatic';

          const primaryShaftMat = new THREE.MeshStandardMaterial({
            color: isIonic ? 0x64748b : 0xcbd5e1,
            roughness: 0.65,
            metalness: isIonic ? 0.35 : 0.15,
            transparent: isIonic,
            opacity: isIonic ? 0.55 : 1.0,
          });

          const secondaryShaftMat = new THREE.MeshStandardMaterial({
            color: isAromatic ? 0x38bdf8 : 0x94a3b8,
            roughness: 0.52,
            metalness: 0.25,
          });

          const shafts: THREE.Mesh[] = [];
          const count =
            bond.order === 'triple'
              ? 3
              : bond.order === 'double' || bond.order === 'aromatic'
                ? 2
                : 1;

          for (let s = 0; s < count; s++) {
            const mat = s === 1 && isAromatic ? secondaryShaftMat.clone() : primaryShaftMat.clone();
            const m = new THREE.Mesh(shaftGeo.clone(), mat);
            m.castShadow = !eng.isSoftwareGl && !isIonic;
            bondGroup.add(m);
            shafts.push(m);
          }

          const collars: THREE.Mesh[] = [];
          if (!isIonic && molecule.atoms.length <= 36) {
            const c1 = new THREE.Mesh(collarGeo.clone(), collarMat.clone());
            const c2 = new THREE.Mesh(collarGeo.clone(), collarMat.clone());
            bondGroup.add(c1, c2);
            collars.push(c1, c2);
          }

          eng.subjectGroup.add(bondGroup);
          const bondRec: BondRuntimeRecord = {
            fromId: bond.from,
            toId: bond.to,
            order: bond.order,
            group: bondGroup,
            shafts,
            collars,
          };
          eng.bondRecords.push(bondRec);
          updateBondTransform(bondRec, atomRecMap, renderStyle);
        }

        if (molecule.aromaticRings) {
          for (const ring of molecule.aromaticRings) {
            const piTorus = new THREE.Mesh(
              new THREE.TorusGeometry(ring.radius, 0.032, 12, 48),
              new THREE.MeshStandardMaterial({
                color: 0x38bdf8,
                emissive: 0x0284c7,
                emissiveIntensity: 0.35,
                roughness: 0.35,
                metalness: 0.4,
                transparent: true,
                opacity: 0.65,
              })
            );
            piTorus.position.set(
              ring.center[0] - centroid[0],
              ring.center[1] - centroid[1],
              ring.center[2] - centroid[2]
            );
            const normalVec = new THREE.Vector3(...ring.normal).normalize();
            piTorus.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normalVec);
            eng.subjectGroup.add(piTorus);
          }
        }

        // Build 3D Molecular Dipole Moment Vector (+--> arrow) & Bond Polarity Micro-Cones
        const dipoleGroup = new THREE.Group();
        dipoleGroup.visible = showDipoleVector;

        if (electrostatics.dipoleMagnitudeDebye >= 0.06) {
          const dir = new THREE.Vector3(...electrostatics.dipoleVector).normalize();
          const arrowLen = Math.max(
            2.1,
            Math.min(4.2, 1.55 + electrostatics.dipoleMagnitudeDebye * 0.65)
          );
          const arrowQuat = new THREE.Quaternion().setFromUnitVectors(_vUp, dir);

          const goldMat = new THREE.MeshPhysicalMaterial({
            color: 0xfbbf24,
            emissive: 0xb45309,
            emissiveIntensity: 0.38,
            roughness: 0.22,
            metalness: 0.78,
            clearcoat: 0.7,
          });

          const shaftLen = arrowLen - 0.42;
          const dShaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.052, 0.052, shaftLen, 16),
            goldMat
          );
          dShaft.position.copy(dir).multiplyScalar(-0.21);
          dShaft.quaternion.copy(arrowQuat);
          dipoleGroup.add(dShaft);

          // Arrowhead cone at δ- tip
          const dHead = new THREE.Mesh(
            new THREE.ConeGeometry(0.165, 0.44, 20),
            goldMat.clone()
          );
          dHead.position.copy(dir).multiplyScalar(arrowLen * 0.5 - 0.22);
          dHead.quaternion.copy(arrowQuat);
          dipoleGroup.add(dHead);

          // Chemistry dipole '+' cross-tick near δ+ tail
          const crossRef = Math.abs(dir.y) < 0.85 ? _vUp : _vAlt;
          const crossDir = new THREE.Vector3().crossVectors(dir, crossRef).normalize();
          const crossQuat = new THREE.Quaternion().setFromUnitVectors(_vUp, crossDir);
          const dCross = new THREE.Mesh(
            new THREE.CylinderGeometry(0.042, 0.042, 0.38, 12),
            goldMat.clone()
          );
          dCross.position.copy(dir).multiplyScalar(-arrowLen * 0.5 + 0.32);
          dCross.quaternion.copy(crossQuat);
          dipoleGroup.add(dCross);
        }

        // Subtle cyan-rose micro-cones along individual polar covalent bonds
        const microConeGeo = new THREE.ConeGeometry(0.125, 0.28, 14);
        const microConeMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.35,
          roughness: 0.3,
          metalness: 0.5,
        });
        for (const bd of electrostatics.bondDipoles) {
          if (bd.magnitudeDebye < 0.32) continue;
          const posRec = atomRecMap.get(bd.positiveAtomId);
          const negRec = atomRecMap.get(bd.negativeAtomId);
          if (!posRec || !negRec) continue;
          const bVec = new THREE.Vector3().subVectors(negRec.currentPos, posRec.currentPos);
          if (bVec.length() < 0.2) continue;
          const bMid = new THREE.Vector3()
            .addVectors(posRec.currentPos, negRec.currentPos)
            .multiplyScalar(0.5);
          bVec.normalize();
          const cone = new THREE.Mesh(microConeGeo.clone(), microConeMat.clone());
          cone.position.copy(bMid);
          cone.quaternion.setFromUnitVectors(_vUp, bVec);
          dipoleGroup.add(cone);
        }
        microConeGeo.dispose();
        microConeMat.dispose();

        eng.subjectGroup.add(dipoleGroup);
        eng.dipoleGroup = dipoleGroup;

        // Multi-Atom Free Geometry Ruler Group
        const rulerGroup = new THREE.Group();
        eng.subjectGroup.add(rulerGroup);
        eng.rulerGroup = rulerGroup;
        rebuildRulerOverlay(rulerGroup, atomRecMap, measurementAtomIds);

        sphereGeo.dispose();
        haloGeo.dispose();
        shaftGeo.dispose();
        collarGeo.dispose();
        collarMat.dispose();

        eng.stageGroup.position.y = Math.min(-1.65, minY - 1.15);
        const stageScale = Math.max(0.85, Math.min(1.65, boundingRadius / 2.6));
        eng.stageGroup.scale.set(stageScale, 1, stageScale);

        const dist = Math.max(5.4, boundingRadius * 2.75 + 2.15);
        const targetY = -Math.min(0.55, boundingRadius * 0.18);
        eng.boundingDistance = dist;

        if (!preserveCamera) {
          eng.controls.target.set(0, targetY, 0);
          eng.camera.position.set(dist * 0.62, dist * 0.44 + targetY, dist * 0.76);
          eng.camera.lookAt(0, targetY, 0);
        }
      } else if (atomViewMode === 'quantum') {
        // 3D Quantum Wavefunction Orbital Cloud & Dual-Phase Isosurface Lobes
        const orbData = buildQuantumOrbital3D(
          quantumOrbitalId,
          eng.isSoftwareGl ? 1500 : 2400
        );

        // 1. Compact Atomic Nucleus Core
        const nucCore = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 20, 20),
          new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(activeElement.cpkColor),
            emissive: 0x0e7490,
            emissiveIntensity: 0.35,
            roughness: 0.2,
            metalness: 0.4,
            clearcoat: 0.85,
          })
        );
        eng.subjectGroup.add(nucCore);

        // 2. Cartesian X / Y / Z Reference Hairlines + Equatorial Nodal Ring
        const axisLen = 3.1;
        const axisGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-axisLen, 0, 0),
          new THREE.Vector3(axisLen, 0, 0),
          new THREE.Vector3(0, -axisLen, 0),
          new THREE.Vector3(0, axisLen, 0),
          new THREE.Vector3(0, 0, -axisLen),
          new THREE.Vector3(0, 0, axisLen),
        ]);
        const axisLines = new THREE.LineSegments(
          axisGeom,
          new THREE.LineBasicMaterial({
            color: 0x475569,
            transparent: true,
            opacity: 0.55,
          })
        );
        eng.subjectGroup.add(axisLines);

        const nodalRing = new THREE.Mesh(
          new THREE.TorusGeometry(2.55, 0.014, 10, 64),
          new THREE.MeshBasicMaterial({
            color: 0x334155,
            transparent: true,
            opacity: 0.65,
          })
        );
        nodalRing.rotation.x = Math.PI / 2;
        eng.subjectGroup.add(nodalRing);

        // 3. Smooth Dual-Phase Analytical Isosurface Lobes
        for (const lobe of orbData.lobes) {
          const phaseHex = lobe.phase > 0 ? 0x38bdf8 : 0xfb7185;
          const emissiveHex = lobe.phase > 0 ? 0x0284c7 : 0xe11d48;
          const lobeMat = new THREE.MeshPhysicalMaterial({
            color: phaseHex,
            emissive: emissiveHex,
            emissiveIntensity: 0.22,
            roughness: 0.2,
            metalness: 0.05,
            clearcoat: 0.8,
            transparent: true,
            opacity: quantumOrbitalId === '2s' && lobe.phase < 0 ? 0.16 : 0.26,
            depthWrite: false,
            side: THREE.DoubleSide,
          });

          if (lobe.isTorusBelt) {
            const belt = new THREE.Mesh(
              new THREE.TorusGeometry(
                lobe.torusRadius ?? 1.4,
                lobe.torusTube ?? 0.34,
                18,
                56
              ),
              lobeMat
            );
            belt.rotation.x = Math.PI / 2;
            if (quantumOrbitalId === '4fz3') {
              belt.position.y = lobe.length;
            }
            belt.renderOrder = 2;
            eng.subjectGroup.add(belt);
          } else if (quantumOrbitalId === '1s' || quantumOrbitalId === '2s') {
            const sph = new THREE.Mesh(
              new THREE.SphereGeometry(lobe.length, 28, 28),
              lobeMat
            );
            sph.renderOrder = lobe.phase > 0 ? 1 : 2;
            eng.subjectGroup.add(sph);
          } else {
            const tearGeo = createTeardropLobeGeometry(lobe.length, lobe.width);
            const lobeMesh = new THREE.Mesh(tearGeo, lobeMat);
            const dirVec = new THREE.Vector3(...lobe.direction).normalize();
            lobeMesh.quaternion.setFromUnitVectors(_vUp, dirVec);
            lobeMesh.renderOrder = 2;
            eng.subjectGroup.add(lobeMesh);
          }
        }

        // 4. Monte-Carlo Wavefunction Probability Density Cloud (|ψ|²)
        const ptCount = orbData.points.length;
        const positions = new Float32Array(ptCount * 3);
        const colors = new Float32Array(ptCount * 3);
        const posColor = new THREE.Color(0x38bdf8);
        const negColor = new THREE.Color(0xfb7185);
        const tmpColor = new THREE.Color();

        for (let i = 0; i < ptCount; i++) {
          const p = orbData.points[i];
          positions[i * 3] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;

          tmpColor.copy(p.phase > 0 ? posColor : negColor);
          const bright = 0.72 + p.density * 0.45;
          colors[i * 3] = Math.min(1, tmpColor.r * bright);
          colors[i * 3 + 1] = Math.min(1, tmpColor.g * bright);
          colors[i * 3 + 2] = Math.min(1, tmpColor.b * bright);
        }

        const cloudGeo = new THREE.BufferGeometry();
        cloudGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        cloudGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const cloudMat = new THREE.PointsMaterial({
          size: 0.145,
          map: eng.particleTex,
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        });
        const cloudPoints = new THREE.Points(cloudGeo, cloudMat);
        cloudPoints.renderOrder = 3;
        eng.subjectGroup.add(cloudPoints);

        eng.stageGroup.position.y = -3.15;
        eng.stageGroup.scale.set(1.15, 1, 1.15);

        const dist = 8.2;
        eng.boundingDistance = dist;
        eng.controls.target.set(0, -0.25, 0);
        eng.camera.position.set(dist * 0.58, dist * 0.42, dist * 0.76);
        eng.camera.lookAt(0, -0.25, 0);
      } else {
        // 3D Bohr Shell Atomic Structure Mode
        const atom3D = build3DAtomStructure(activeElement);

        const nucleusGroup = new THREE.Group();
        const nucleonGeo = new THREE.SphereGeometry(0.16, 18, 18);
        const protonMat = new THREE.MeshPhysicalMaterial({
          color: 0xef4444,
          roughness: 0.2,
          metalness: 0.15,
          clearcoat: 0.8,
        });
        const neutronMat = new THREE.MeshStandardMaterial({
          color: 0x64748b,
          roughness: 0.62,
          metalness: 0.45,
        });

        for (const nuc of atom3D.nucleons) {
          const mesh = new THREE.Mesh(
            nucleonGeo.clone(),
            nuc.type === 'proton' ? protonMat.clone() : neutronMat.clone()
          );
          mesh.position.set(nuc.x, nuc.y, nuc.z);
          mesh.castShadow = !eng.isSoftwareGl;
          nucleusGroup.add(mesh);
        }
        eng.subjectGroup.add(nucleusGroup);

        const electronGeo = new THREE.SphereGeometry(0.105, 16, 16);
        const outerShellIndex = atom3D.shellRadii.length - 1;

        for (const sh of atom3D.shellRadii) {
          const shellGroup = new THREE.Group();
          const isValenceShell = sh.shellIndex === outerShellIndex;
          const ringMesh = new THREE.Mesh(
            new THREE.TorusGeometry(sh.radius, isValenceShell ? 0.022 : 0.014, 12, 72),
            new THREE.MeshStandardMaterial({
              color: isValenceShell ? 0x22d3ee : 0x475569,
              emissive: isValenceShell ? 0x0891b2 : 0x0f172a,
              emissiveIntensity: isValenceShell ? 0.35 : 0.1,
              roughness: 0.35,
              metalness: 0.65,
            })
          );
          shellGroup.add(ringMesh);

          shellGroup.rotation.set(Math.PI / 2.5 + sh.tiltX, 0, sh.tiltZ);
          const orbitSpeed = 1.15 / Math.sqrt(1 + sh.shellIndex * 0.75);
          for (let eIdx = 0; eIdx < sh.count; eIdx++) {
            const angle = (eIdx * 2 * Math.PI) / sh.count;
            const eMat = new THREE.MeshPhysicalMaterial({
              color: isValenceShell ? 0x38bdf8 : 0xe2e8f0,
              emissive: isValenceShell ? 0x06b6d4 : 0x334155,
              emissiveIntensity: isValenceShell ? 0.55 : 0.2,
              roughness: 0.18,
              metalness: 0.3,
              clearcoat: 0.9,
            });
            const eMesh = new THREE.Mesh(electronGeo.clone(), eMat);
            eMesh.position.set(
              Math.cos(angle) * sh.radius,
              Math.sin(angle) * sh.radius,
              0
            );
            shellGroup.add(eMesh);
            eng.orbitalElectrons.push({
              mesh: eMesh,
              shellIndex: sh.shellIndex,
              radius: sh.radius,
              baseAngle: angle,
              speed: orbitSpeed,
            });
          }

          eng.subjectGroup.add(shellGroup);
        }

        nucleonGeo.dispose();
        electronGeo.dispose();
        protonMat.dispose();
        neutronMat.dispose();

        const maxShellR =
          atom3D.shellRadii[atom3D.shellRadii.length - 1]?.radius ?? 2.0;
        eng.stageGroup.position.y = -(maxShellR * 0.72 + 1.2);
        const stageScale = Math.max(1.0, maxShellR / 2.8);
        eng.stageGroup.scale.set(stageScale, 1, stageScale);

        const dist = Math.max(6.2, maxShellR * 2.35 + 1.8);
        eng.boundingDistance = dist;
        eng.controls.target.set(0, 0, 0);
        eng.camera.position.set(dist * 0.58, dist * 0.48, dist * 0.75);
        eng.camera.lookAt(0, 0, 0);
      }

      if (!eng.isSoftwareGl) {
        eng.renderer.compile(eng.scene, eng.camera);
      }
      eng.requestRender();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      stageMode,
      atomViewMode,
      quantumOrbitalId,
      molecule.id,
      moleculeRevision,
      activeElement.number,
    ]);

    // Synchronize visual styles, ESP colors, dipole visibility, ruler rods, and highlights without rebuilding
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng) return;

      if (stageMode === 'molecule') {
        const atomMap = new Map(eng.atomRecords.map((r) => [r.atomId, r]));
        const measuredSet = new Set(
          toolMode === 'measure' ? measurementAtomIds : []
        );

        for (const rec of eng.atomRecords) {
          let styleMult = 1.0;
          if (renderStyle === 'space-filling') {
            const el = ELEMENT_BY_SYMBOL[rec.elementSymbol];
            const vdw = (el?.vdwRadius ?? 160) / 100;
            styleMult = (vdw * 0.68) / rec.baseRadius;
          } else if (renderStyle === 'wireframe') {
            styleMult = 0.42;
          }

          const radius = rec.baseRadius * styleMult * atomScale;
          rec.sphereMesh.scale.setScalar(radius);

          const isSelected = selectedAtomId === rec.atomId;
          const isMeasured = measuredSet.has(rec.atomId);
          const isPendingConnect = pendingConnectAtomId === rec.atomId;
          const isElementHighlighted =
            highlightedElementSymbol !== null &&
            rec.elementSymbol === highlightedElementSymbol;

          rec.haloMesh.visible =
            isSelected || isMeasured || isPendingConnect || isElementHighlighted;
          if (rec.haloMesh.visible) {
            rec.haloMesh.scale.setScalar(radius * 1.06);
            rec.haloMesh.lookAt(eng.camera.position);
            const hMat = rec.haloMesh.material as THREE.MeshBasicMaterial;
            if (isPendingConnect) {
              hMat.color.setHex(0xf43f5e);
            } else if (isMeasured) {
              hMat.color.setHex(0x34d399);
            } else if (isSelected) {
              hMat.color.setHex(0x22d3ee);
            } else {
              hMat.color.setHex(0xfbbf24);
            }
            hMat.opacity = 0.92;
          }

          const mat = rec.sphereMesh.material as THREE.MeshPhysicalMaterial;
          const isMetal = METALLIC_ELEMENTS.has(rec.elementSymbol);
          mat.color.set(renderStyle === 'esp' ? rec.espColorHex : rec.cpkColorHex);
          mat.metalness = isMetal && renderStyle !== 'esp' ? 0.85 : 0.08;
          mat.roughness = isMetal && renderStyle !== 'esp' ? 0.18 : 0.22;
          mat.wireframe = renderStyle === 'wireframe';

          if (isPendingConnect) {
            mat.emissive.setHex(0xbe123c);
            mat.emissiveIntensity = 0.45;
          } else if (isMeasured) {
            mat.emissive.setHex(0x059669);
            mat.emissiveIntensity = 0.38;
          } else if (isSelected && renderStyle !== 'esp') {
            mat.emissive.setHex(0x0891b2);
            mat.emissiveIntensity = 0.38;
          } else if (isElementHighlighted) {
            mat.emissive.setHex(0x854d0e);
            mat.emissiveIntensity = 0.28;
          } else {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
        }

        for (const bond of eng.bondRecords) {
          updateBondTransform(bond, atomMap, renderStyle);
        }

        if (eng.dipoleGroup) {
          eng.dipoleGroup.visible = showDipoleVector;
        }
        if (eng.rulerGroup) {
          rebuildRulerOverlay(
            eng.rulerGroup,
            atomMap,
            toolMode === 'measure' ? measurementAtomIds : []
          );
        }
      }

      eng.flushImmediateRender();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      stageMode,
      molecule.id,
      moleculeRevision,
      renderStyle,
      showDipoleVector,
      toolMode,
      measurementAtomIds,
      pendingConnectAtomId,
      atomScale,
      selectedAtomId,
      highlightedElementSymbol,
      showAtomLabels,
      explodeFactor,
      autoRotate,
    ]);

    const orbitalMeta = QUANTUM_ORBITAL_MAP[quantumOrbitalId];

    return (
      <div
        className="relative w-full h-full overflow-hidden bg-[#090D16] select-none"
        data-stage-mode={stageMode}
        data-atom-view-mode={atomViewMode}
        data-molecule-id={molecule.id}
        data-element-symbol={activeElement.symbol}
      >
        {/* Isolated WebGL Canvas Mount */}
        <div ref={canvasMountRef} className="w-full h-full" />

        {/* Projected 2D Atom Labels Layer */}
        <div
          ref={labelLayerRef}
          className="pointer-events-none absolute inset-0 overflow-hidden z-10"
          aria-hidden="true"
        />

        {/* Minimal Top-Left Non-Occluding Spec Readout */}
        <div className="pointer-events-none absolute top-4 left-5 z-10 max-w-lg space-y-2">
          {stageMode === 'molecule' ? (
            <>
              {!hideHeaderOverlay && (
                <div>
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <h1 className="text-xl font-bold tracking-tight text-slate-50">
                      {molecule.nameZh}
                    </h1>
                    <span className="font-mono text-sm font-medium text-cyan-400">
                      {molecule.formulaDisplay}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    <span>{molecule.nameEn}</span>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>
                      {toolMode === 'build'
                        ? '三维搭建模式：点击原子接枝生长或连键'
                        : toolMode === 'measure'
                          ? '自由测距尺：依次点击 2–4 个原子测距 / 键角 / 二面角'
                          : '拖拽旋转 / 滚轮缩放 / 点击原子测键角'}
                    </span>
                  </p>
                </div>
              )}

              {/* ESP Color Legend & Dipole Vector Readout when active */}
              {(renderStyle === 'esp' || showDipoleVector) && (
                <div className="inline-flex items-center gap-3 flex-wrap rounded-lg bg-[#0E1525]/92 border border-slate-800 px-3 py-1.5 text-[11px] text-slate-200">
                  {renderStyle === 'esp' && (
                    <div className="flex items-center gap-2">
                      <span className="text-rose-300 font-mono">δ⁻ 负电势</span>
                      <span
                        className="w-20 h-2 rounded-full border border-slate-700"
                        style={{
                          background:
                            'linear-gradient(90deg, #EF4444 0%, #E2E8F0 50%, #2563EB 100%)',
                        }}
                      />
                      <span className="text-blue-300 font-mono">δ⁺ 正电势</span>
                    </div>
                  )}
                  {showDipoleVector && (
                    <div className="font-mono tabular-nums text-amber-300">
                      {electrostatics.dipoleMagnitudeDebye >= 0.06
                        ? `总偶极矩 |μ| = ${electrostatics.dipoleMagnitudeDebye.toFixed(2)} D (δ⁺ → δ⁻)`
                        : '对称抵消净偶极矩 |μ| = 0.00 D'}
                    </div>
                  )}
                </div>
              )}

              {/* Live Multi-Atom Geometry Ruler HUD Readout */}
              {toolMode === 'measure' && measurementSummary.atoms.length > 0 && (
                <div className="inline-flex items-center gap-3 flex-wrap rounded-lg bg-[#0E1525]/92 border border-emerald-500/40 px-3 py-1.5 text-xs text-slate-200">
                  <span className="font-mono text-emerald-300">
                    选点:{' '}
                    {measurementSummary.atoms
                      .map((a, idx) => `#${idx + 1}${a.element}${a.id + 1}`)
                      .join(' → ')}
                  </span>
                  {measurementSummary.distanceAB && (
                    <span className="font-mono tabular-nums">
                      间距: <strong>{measurementSummary.distanceAB.angstrom} Å</strong>
                    </span>
                  )}
                  {measurementSummary.angleABC && (
                    <span className="font-mono tabular-nums">
                      夹角: <strong>{measurementSummary.angleABC.degrees}°</strong>
                    </span>
                  )}
                  {measurementSummary.dihedralABCD && (
                    <span className="font-mono tabular-nums text-cyan-300">
                      二面角 φ: <strong>{measurementSummary.dihedralABCD.degrees}°</strong>
                    </span>
                  )}
                </div>
              )}
            </>
          ) : atomViewMode === 'quantum' ? (
            <div className="space-y-1">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-slate-50">
                  {activeElement.number}.{' '}
                  {getSafeElementNameZh(activeElement.number, activeElement.nameZh).text} (
                  {activeElement.symbol}) · {orbitalMeta.subshellTitle}
                </h1>
                <span className="font-mono text-xs font-medium text-cyan-400">
                  {orbitalMeta.quantumNumbers}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                <span>{orbitalMeta.nodalSummary}</span>
                <span className="mx-1.5 text-slate-600" aria-hidden="true">·</span>
                <span className="text-sky-300">青色 ψ(+) 正相位</span>
                <span className="mx-1.5 text-slate-600" aria-hidden="true">/</span>
                <span className="text-rose-300">珊瑚红 ψ(-) 负相位</span>
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-slate-50">
                  {activeElement.number}.{' '}
                  {getSafeElementNameZh(activeElement.number, activeElement.nameZh).text} (
                  {activeElement.symbol}) 三维玻尔原子壳层
                </h1>
                <span className="font-mono text-sm font-medium text-cyan-400">
                  {activeElement.electronConfig}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                <span>质子 {activeElement.number}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>电子层排布 {activeElement.shells.join(' - ')}</span>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>可切换底部“量子轨道电子云”观察 s/p/d/f 波函数</span>
              </p>
            </div>
          )}
        </div>

        {/* Raycast Hover Cursor Tooltip */}
        {hoverReadout && stageMode === 'molecule' && (
          <div
            className="pointer-events-none absolute z-20 rounded-md bg-[#0E1628] border border-slate-700 px-2.5 py-1.5 shadow-lg"
            style={{
              transform: `translate3d(${Math.min(hoverReadout.x + 14, 920)}px, ${Math.max(hoverReadout.y - 44, 12)}px, 0)`,
            }}
          >
            <div className="text-xs font-semibold text-slate-100 whitespace-nowrap">
              {hoverReadout.title}
            </div>
            <div className="font-mono text-[11px] text-cyan-300 whitespace-nowrap">
              {hoverReadout.subtitle}
            </div>
          </div>
        )}

        {/* WebGL Context Lost Graceful Recovery */}
        {contextLost && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#090D16] p-6 text-center">
            <p className="text-base font-semibold text-slate-200">
              三维图形上下文暂时挂起
            </p>
            <p className="mt-1 text-xs text-slate-400">
              正在自动恢复硬件/软件 WebGL 渲染管线，您仍可在右侧查看完整元素属性数据。
            </p>
          </div>
        )}
      </div>
    );
  }
);
