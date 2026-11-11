import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ELEMENT_BY_SYMBOL } from '../chemistry/elements';
import { BondOrder } from '../chemistry/molecules';
import {
  evaluateReactionPathwayFrame,
  PathwayBondSpec,
  ReactionPathwayModel,
} from '../chemistry/reactionPathway';
import { CameraPreset, ChemistryStage3DHandle, RenderStyle } from './ChemistryStage3D';

interface ReactionPathwayStage3DProps {
  pathway: ReactionPathwayModel;
  progress: number; // 0..1
  isPlaying: boolean;
  playbackSeed: number; // incremented on explicit replay
  renderStyle: RenderStyle;
  showAtomLabels: boolean;
  autoRotate: boolean;
  onProgressSync: (nextProgress: number) => void;
  onPlaybackComplete: () => void;
}

interface PathwayAtomRuntime {
  index: number;
  element: string;
  transfersFragment: boolean;
  baseRadius: number;
  group: THREE.Group;
  sphereMesh: THREE.Mesh;
  transferHalo: THREE.Mesh;
  atomLabelEl: HTMLSpanElement | null;
}

interface PathwayBondRuntime {
  spec: PathwayBondSpec;
  group: THREE.Group;
  shafts: [THREE.Mesh, THREE.Mesh, THREE.Mesh];
  material: THREE.MeshStandardMaterial;
}

const METALLIC_ELEMENTS = new Set([
  'Li', 'Be', 'Na', 'Mg', 'Al', 'K', 'Ca', 'Fe', 'Cu', 'Zn', 'Ag', 'Pt', 'Au',
]);

// Pre-allocated scratch math helpers (zero per-frame allocations)
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vMid = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vPerp = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _vAlt = new THREE.Vector3(1, 0, 0);
const _proj = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _colNeutral = new THREE.Color(0xcbd5e1);
const _colBroken = new THREE.Color(0xfb7185);
const _colFormed = new THREE.Color(0x34d399);
const _colTransform = new THREE.Color(0x38bdf8);
const _colIonic = new THREE.Color(0xfbbf24);
const _colWork = new THREE.Color();
const _colEmissive = new THREE.Color();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
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

function createPathwayFloorTextures(maxAnisotropy: number) {
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 256;
  sCanvas.height = 256;
  const sCtx = sCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(128, 128, 10, 128, 128, 122);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.28)');
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

  gCtx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
  gCtx.lineWidth = 1.2;
  for (let r = 64; r <= 240; r += 56) {
    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.stroke();
  }

  // Reaction coordinate horizontal axis arrow on stage floor
  gCtx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
  gCtx.lineWidth = 1.6;
  gCtx.beginPath();
  gCtx.moveTo(36, cy);
  gCtx.lineTo(476, cy);
  gCtx.stroke();

  gCtx.beginPath();
  gCtx.moveTo(cx, 44);
  gCtx.lineTo(cx, 468);
  gCtx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  gCtx.stroke();

  const gridTex = new THREE.CanvasTexture(gCanvas);
  gridTex.colorSpace = THREE.SRGBColorSpace;
  gridTex.anisotropy = maxAnisotropy;

  return { shadowTex, gridTex };
}

function getShaftCountForOrder(order: BondOrder): number {
  if (order === 'triple') return 3;
  if (order === 'double' || order === 'aromatic') return 2;
  return 1;
}

export const ReactionPathwayStage3D = forwardRef<
  ChemistryStage3DHandle,
  ReactionPathwayStage3DProps
>(function ReactionPathwayStage3D(
  {
    pathway,
    progress,
    isPlaying,
    playbackSeed,
    renderStyle,
    showAtomLabels,
    autoRotate,
    onProgressSync,
    onPlaybackComplete,
  },
  ref
) {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const atomLabelLayerRef = useRef<HTMLDivElement | null>(null);
  const clusterLabelLayerRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // Mutable refs so 3D loop never tears down WebGL on prop ticks
  const pathwayRef = useRef<ReactionPathwayModel>(pathway);
  pathwayRef.current = pathway;

  const progressRef = useRef<number>(progress);
  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;

  const renderStyleRef = useRef<RenderStyle>(renderStyle);
  renderStyleRef.current = renderStyle;

  const showAtomLabelsRef = useRef<boolean>(showAtomLabels);
  showAtomLabelsRef.current = showAtomLabels;

  const autoRotateRef = useRef<boolean>(autoRotate);
  autoRotateRef.current = autoRotate;

  const onProgressSyncRef = useRef(onProgressSync);
  onProgressSyncRef.current = onProgressSync;

  const onPlaybackCompleteRef = useRef(onPlaybackComplete);
  onPlaybackCompleteRef.current = onPlaybackComplete;

  const engineRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    subjectGroup: THREE.Group;
    stageGroup: THREE.Group;
    tsRingGroup: THREE.Group;
    tsRingMatA: THREE.MeshBasicMaterial;
    tsRingMatB: THREE.MeshBasicMaterial;
    atomRuntimes: PathwayAtomRuntime[];
    bondRuntimes: PathwayBondRuntime[];
    clusterLabelEls: Map<string, HTMLDivElement>;
    boundingDistance: number;
    cameraGoalPos: THREE.Vector3 | null;
    cameraGoalTarget: THREE.Vector3 | null;
    isSoftwareGl: boolean;
    requestRender: () => void;
    flushImmediateRender: () => void;
    ensureLoopRunning: () => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    setCameraPreset(preset: CameraPreset) {
      const eng = engineRef.current;
      if (!eng) return;
      const d = eng.boundingDistance;
      eng.subjectGroup.rotation.set(0, 0, 0);
      eng.cameraGoalTarget = new THREE.Vector3(0, 0, 0);
      if (preset === 'front') {
        eng.cameraGoalPos = new THREE.Vector3(0, d * 0.14, d * 1.12);
      } else if (preset === 'top') {
        eng.cameraGoalPos = new THREE.Vector3(0, d * 1.22, 0.01);
      } else if (preset === 'side') {
        eng.cameraGoalPos = new THREE.Vector3(d * 1.12, d * 0.14, 0);
      } else {
        eng.cameraGoalPos = new THREE.Vector3(0, d * 0.34, d * 1.08);
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

  // Initialize Three.js Renderer, Studio Lighting & Stage Floor once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const initW = Math.max(container.clientWidth, 320);
    const initH = Math.max(container.clientHeight, 260);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(initW, initH);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.022);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.88);
    hemiLight.position.set(0, 16, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.82);
    keyLight.position.set(6, 10, 8);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(-7, 4, -7);
    scene.add(rimLight);

    const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.1, 160);
    camera.position.set(0, 2.8, 8.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.95;
    controls.minDistance = 2.2;
    controls.maxDistance = 42.0;

    const subjectGroup = new THREE.Group();
    scene.add(subjectGroup);

    // Transition-State [‡] Energy Halo Group at reaction center (0, 0, 0)
    const tsRingGroup = new THREE.Group();
    const tsGeoA = new THREE.TorusGeometry(1.55, 0.026, 12, 56);
    const tsGeoB = new THREE.TorusGeometry(1.92, 0.018, 12, 56);
    const tsRingMatA = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const tsRingMatB = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const tsRingMeshA = new THREE.Mesh(tsGeoA, tsRingMatA);
    tsRingMeshA.rotation.x = Math.PI * 0.36;
    const tsRingMeshB = new THREE.Mesh(tsGeoB, tsRingMatB);
    tsRingMeshB.rotation.x = -Math.PI * 0.32;
    tsRingMeshB.rotation.y = Math.PI * 0.22;
    tsRingGroup.add(tsRingMeshA, tsRingMeshB);
    tsRingGroup.visible = false;
    scene.add(tsRingGroup);

    // Grounded Stage Disc
    const stageGroup = new THREE.Group();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { shadowTex, gridTex } = createPathwayFloorTextures(maxAniso);

    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 40),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    stageGroup.add(shadowDisc);

    const gridDisc = new THREE.Mesh(
      new THREE.CircleGeometry(5.6, 48),
      new THREE.MeshBasicMaterial({
        map: gridTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    gridDisc.rotation.x = -Math.PI / 2;
    gridDisc.position.y = 0.02;
    stageGroup.add(gridDisc);
    stageGroup.position.y = -2.25;
    scene.add(stageGroup);

    let disposed = false;
    let frameId = 0;
    let timerId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();
    let lastReactSyncTime = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        timerId = window.setTimeout(cb, 45);
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
          timerId = window.setTimeout(cb, 45);
        }
      };
      timerId = window.setTimeout(poll, 5);
    }

    function applyPathwayFrameToScene() {
      const eng = engineRef.current;
      if (!eng) return;

      const curPathway = pathwayRef.current;
      const curProgress = progressRef.current;
      const style = renderStyleRef.current;
      const frame = evaluateReactionPathwayFrame(curPathway, curProgress);

      // 1. Update Atom Positions & Radii
      for (let i = 0; i < eng.atomRuntimes.length; i++) {
        const rt = eng.atomRuntimes[i];
        const pos = frame.atomPositions[i];
        if (!pos) continue;
        rt.group.position.set(pos[0], pos[1], pos[2]);

        let mult = 1.0;
        if (style === 'space-filling') {
          const el = ELEMENT_BY_SYMBOL[rt.element];
          const vdw = (el?.vdwRadius ?? 160) / 100;
          mult = (vdw * 0.62) / rt.baseRadius;
        } else if (style === 'wireframe') {
          mult = 0.42;
        }
        const r = rt.baseRadius * mult;
        rt.sphereMesh.scale.setScalar(r);

        // Highlight migrating atoms subtly during Transition State
        const showHalo = rt.transfersFragment && frame.tsIntensity > 0.14;
        rt.transferHalo.visible = showHalo;
        if (showHalo) {
          rt.transferHalo.scale.setScalar(r * 1.12);
          rt.transferHalo.lookAt(eng.camera.position);
          const hMat = rt.transferHalo.material as THREE.MeshBasicMaterial;
          hMat.opacity = Math.min(0.85, frame.tsIntensity * 0.9);
        }
      }

      // 2. Update Covalent / Breaking / Forming Bonds
      for (let i = 0; i < eng.bondRuntimes.length; i++) {
        const brt = eng.bondRuntimes[i];
        const bf = frame.bonds[i];
        if (!bf || style === 'space-filling' || bf.opacity < 0.025) {
          brt.group.visible = false;
          continue;
        }

        const posA = frame.atomPositions[brt.spec.atomA];
        const posB = frame.atomPositions[brt.spec.atomB];
        if (!posA || !posB) {
          brt.group.visible = false;
          continue;
        }

        _vA.set(posA[0], posA[1], posA[2]);
        _vB.set(posB[0], posB[1], posB[2]);
        _vDir.subVectors(_vB, _vA);
        const dist = _vDir.length();
        // Hide severely overstretched cleaved bonds (> 3.6 Å) cleanly
        if (dist < 0.001 || (brt.spec.role === 'broken' && dist > 3.65)) {
          brt.group.visible = false;
          continue;
        }

        brt.group.visible = true;
        _vMid.addVectors(_vA, _vB).multiplyScalar(0.5);
        _vDir.normalize();
        _quat.setFromUnitVectors(_vUp, _vDir);

        const refAxis = Math.abs(_vDir.dot(_vUp)) > 0.9 ? _vAlt : _vUp;
        _vPerp.crossVectors(_vDir, refAxis).normalize();

        const shaftCount = getShaftCountForOrder(bf.activeOrder);
        const thin = style === 'wireframe' ? 0.56 : 1.0;

        // Color & opacity signaling for breaking (rose) vs forming (emerald) vs preserved (slate)
        const isPartialDynamicBond =
          (brt.spec.role === 'broken' || brt.spec.role === 'formed') &&
          bf.opacity > 0.04 &&
          bf.opacity < 0.94;

        if (brt.spec.role === 'broken') {
          _colWork.copy(_colNeutral).lerp(_colBroken, Math.min(1, bf.stressFactor * 1.3 + 0.25));
          _colEmissive.copy(_colBroken).multiplyScalar(isPartialDynamicBond ? 0.65 : bf.stressFactor * 0.35);
          const visAlpha = isPartialDynamicBond
            ? Math.min(0.94, 0.24 + bf.opacity * 1.1)
            : bf.opacity;
          brt.material.opacity = visAlpha;
          brt.material.transparent = visAlpha < 0.99;
        } else if (brt.spec.role === 'formed') {
          _colWork.copy(_colNeutral).lerp(_colFormed, Math.min(1, bf.stressFactor * 1.3 + 0.25));
          _colEmissive.copy(_colFormed).multiplyScalar(isPartialDynamicBond ? 0.65 : bf.stressFactor * 0.35);
          const visAlpha = isPartialDynamicBond
            ? Math.min(0.94, 0.24 + bf.opacity * 1.1)
            : bf.opacity;
          brt.material.opacity = visAlpha;
          brt.material.transparent = visAlpha < 0.99;
        } else if (bf.activeOrder === 'ionic') {
          _colWork.copy(_colIonic);
          _colEmissive.setRGB(0, 0, 0);
          brt.material.opacity = 0.85;
          brt.material.transparent = true;
        } else {
          _colWork.copy(_colNeutral).lerp(_colTransform, bf.stressFactor);
          _colEmissive.copy(_colTransform).multiplyScalar(bf.stressFactor * 0.25);
          brt.material.opacity = 1;
          brt.material.transparent = false;
        }
        brt.material.color.copy(_colWork);
        brt.material.emissive.copy(_colEmissive);

        if (isPartialDynamicBond) {
          // IUPAC 3-dash collinear partial bond geometry (non-hue-only signaling for [‡] breaking/forming bonds!)
          const dashPositions = [-0.31, 0, 0.31];
          const dashLen = dist * 0.21;
          const dashRad = thin * 0.88;
          for (let sIdx = 0; sIdx < 3; sIdx++) {
            const shaft = brt.shafts[sIdx];
            shaft.visible = true;
            shaft.position
              .copy(_vMid)
              .addScaledVector(_vDir, dashPositions[sIdx] * dist);
            shaft.quaternion.copy(_quat);
            shaft.scale.set(dashRad, dashLen, dashRad);
          }
        } else if (shaftCount === 1) {
          const s0 = brt.shafts[0];
          s0.visible = true;
          s0.position.copy(_vMid);
          s0.quaternion.copy(_quat);
          s0.scale.set(thin, dist, thin);
          brt.shafts[1].visible = false;
          brt.shafts[2].visible = false;
        } else if (shaftCount === 2) {
          const sep = bf.activeOrder === 'aromatic' ? 0.095 : 0.105;
          for (let sIdx = 0; sIdx < 2; sIdx++) {
            const shaft = brt.shafts[sIdx];
            shaft.visible = true;
            const sign = sIdx === 0 ? -1 : 1;
            shaft.position.copy(_vMid).addScaledVector(_vPerp, sign * sep);
            shaft.quaternion.copy(_quat);
            const len = bf.activeOrder === 'aromatic' && sIdx === 1 ? dist * 0.74 : dist;
            shaft.scale.set(thin * 0.76, len, thin * 0.76);
          }
          brt.shafts[2].visible = false;
        } else {
          const sep = 0.115;
          const offs = [-1, 0, 1];
          for (let sIdx = 0; sIdx < 3; sIdx++) {
            const shaft = brt.shafts[sIdx];
            shaft.visible = true;
            shaft.position.copy(_vMid).addScaledVector(_vPerp, offs[sIdx] * sep);
            shaft.quaternion.copy(_quat);
            shaft.scale.set(thin * 0.65, dist, thin * 0.65);
          }
        }
      }

      // 3. Transition-State [‡] Energy Ring
      if (frame.tsIntensity > 0.04) {
        eng.tsRingGroup.visible = true;
        const pulseScale = 0.92 + frame.tsIntensity * 0.18;
        eng.tsRingGroup.scale.setScalar(pulseScale);
        eng.tsRingMatA.opacity = frame.tsIntensity * (curPathway.occurs ? 0.42 : 0.22);
        eng.tsRingMatB.opacity = frame.tsIntensity * (curPathway.occurs ? 0.3 : 0.14);
      } else {
        eng.tsRingGroup.visible = false;
      }

      // 4. Project 2D Atom Labels & Species Cluster Labels
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const showAtoms = showAtomLabelsRef.current && eng.atomRuntimes.length <= 42;

      eng.subjectGroup.updateMatrixWorld();

      for (const rt of eng.atomRuntimes) {
        if (!rt.atomLabelEl) continue;
        if (!showAtoms) {
          rt.atomLabelEl.style.opacity = '0';
          continue;
        }
        rt.group.getWorldPosition(_proj);
        _proj.project(eng.camera);
        if (_proj.z > 1 || _proj.z < -1) {
          rt.atomLabelEl.style.opacity = '0';
          continue;
        }
        const sx = (_proj.x * 0.5 + 0.5) * w;
        const sy = (-_proj.y * 0.5 + 0.5) * h;
        rt.atomLabelEl.style.opacity = '0.9';
        rt.atomLabelEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }

      const activeClusterIds = new Set<string>();
      if (clusterLabelLayerRef.current) {
        for (const lbl of frame.labels) {
          activeClusterIds.add(lbl.id);
          let el = eng.clusterLabelEls.get(lbl.id);
          if (!el) {
            el = document.createElement('div');
            el.className =
              'pointer-events-none absolute top-0 left-0 px-2 py-0.5 rounded bg-[#0B1120]/90 border text-center whitespace-nowrap transition-opacity duration-75';
            clusterLabelLayerRef.current.appendChild(el);
            eng.clusterLabelEls.set(lbl.id, el);
          }

          if (lbl.tone === 'transition') {
            el.style.borderColor = 'rgba(251, 191, 36, 0.6)';
            el.style.color = '#fde68a';
          } else if (lbl.tone === 'product') {
            el.style.borderColor = 'rgba(52, 211, 153, 0.55)';
            el.style.color = '#a7f3d0';
          } else {
            el.style.borderColor = 'rgba(56, 189, 248, 0.45)';
            el.style.color = '#bae6fd';
          }

          const htmlSig = `${lbl.text}|${lbl.subtext}`;
          if (el.dataset.sig !== htmlSig) {
            el.dataset.sig = htmlSig;
            el.innerHTML = `<div class="font-mono text-[11px] font-semibold leading-tight">${lbl.text}</div><div class="text-[10px] text-slate-300 leading-tight">${lbl.subtext}</div>`;
          }

          _proj.set(lbl.position[0], lbl.position[1], lbl.position[2]);
          _proj.applyMatrix4(eng.subjectGroup.matrixWorld);
          _proj.project(eng.camera);

          if (_proj.z > 1 || _proj.z < -1) {
            el.style.opacity = '0';
          } else {
            const sx = (_proj.x * 0.5 + 0.5) * w;
            const sy = (-_proj.y * 0.5 + 0.5) * h;
            el.style.opacity = String(Number(lbl.opacity.toFixed(2)));
            el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
          }
        }

        for (const [id, el] of eng.clusterLabelEls.entries()) {
          if (!activeClusterIds.has(id)) {
            el.style.opacity = '0';
          }
        }
      }
    }

    function stepAndCheckKeepAlive(dt: number, now: number): boolean {
      const eng = engineRef.current;
      if (!eng) return false;

      let keepAlive = false;

      // Advance reaction pathway progress when playing (2.6s real wall-clock transition)
      if (isPlayingRef.current) {
        const durationSec = 2.6;
        const nextP = Math.min(1, progressRef.current + dt / durationSec);
        progressRef.current = nextP;

        if (now - lastReactSyncTime >= 85 || nextP >= 1) {
          lastReactSyncTime = now;
          onProgressSyncRef.current(nextP);
        }

        if (nextP >= 1) {
          isPlayingRef.current = false;
          onPlaybackCompleteRef.current();
        } else {
          keepAlive = true;
        }
      }

      // Smooth camera preset interpolation
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

      if (autoRotateRef.current && !isSoftwareGl) {
        eng.subjectGroup.rotation.y += Math.min(dt, 0.08) * 0.42;
        keepAlive = true;
      }

      eng.tsRingGroup.rotation.z += Math.min(dt, 0.08) * 0.55;

      const controlsMoved = eng.controls.update();
      if (controlsMoved && !isSoftwareGl) {
        keepAlive = true;
      }

      applyPathwayFrameToScene();
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
        const dt = Math.min(0.35, Math.max(0.005, (now - lastTime) / 1000));
        lastTime = now;

        const needsMore = stepAndCheckKeepAlive(dt, now);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsMore || isPlayingRef.current) {
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
      engControlsUpdateAndDraw();
      requestRender();
    }

    function engControlsUpdateAndDraw() {
      controls.update();
      applyPathwayFrameToScene();
      renderer.render(scene, camera);
    }

    function ensureLoopRunning() {
      lastTime = performance.now();
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

    const domEl = renderer.domElement;
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
        const w = Math.max(entry.contentRect.width, 200);
        const h = Math.max(entry.contentRect.height, 200);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        engControlsUpdateAndDraw();
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
      stageGroup,
      tsRingGroup,
      tsRingMatA,
      tsRingMatB,
      atomRuntimes: [],
      bondRuntimes: [],
      clusterLabelEls: new Map(),
      boundingDistance: 8.5,
      cameraGoalPos: null,
      cameraGoalTarget: null,
      isSoftwareGl,
      requestRender,
      flushImmediateRender,
      ensureLoopRunning,
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(timerId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlsStart);
      controls.removeEventListener('change', onControlsChange);
      domEl.removeEventListener('webglcontextlost', onContextLost);
      domEl.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      tsGeoA.dispose();
      tsGeoB.dispose();
      tsRingMatA.dispose();
      tsRingMatB.dispose();
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

  // Rebuild 3D Conserved Atoms & Bonds whenever pathway.simulationId changes
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;

    // Dispose previous meshes/materials in subjectGroup
    eng.subjectGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    eng.subjectGroup.clear();
    eng.subjectGroup.rotation.set(0, 0, 0);
    eng.atomRuntimes = [];
    eng.bondRuntimes = [];
    eng.clusterLabelEls.clear();

    if (atomLabelLayerRef.current) {
      atomLabelLayerRef.current.innerHTML = '';
    }
    if (clusterLabelLayerRef.current) {
      clusterLabelLayerRef.current.innerHTML = '';
    }

    const segs = pathway.atoms.length > 48 ? 16 : 24;
    const sphereGeo = new THREE.SphereGeometry(1, segs, segs);
    const haloGeo = new THREE.TorusGeometry(1.36, 0.055, 10, 32);
    const shaftGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 12, 1, false);

    const densityScale = pathway.atoms.length > 40 ? 0.82 : 1.0;

    for (const atom of pathway.atoms) {
      const el = ELEMENT_BY_SYMBOL[atom.element];
      const covAngstrom = (el?.covalentRadius ?? 75) / 100;
      const baseRadius =
        Math.max(0.23, Math.min(0.65, 0.18 + covAngstrom * 0.28)) *
        densityScale;

      const cpkHex = el?.cpkColor ?? '#94A3B8';
      const isMetal = METALLIC_ELEMENTS.has(atom.element);

      const atomMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(cpkHex),
        roughness: isMetal ? 0.22 : 0.3,
        metalness: isMetal ? 0.72 : 0.08,
        clearcoat: 0.45,
        clearcoatRoughness: 0.2,
      });

      const group = new THREE.Group();
      const sphereMesh = new THREE.Mesh(sphereGeo, atomMat);
      sphereMesh.scale.setScalar(baseRadius);
      group.add(sphereMesh);

      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const transferHalo = new THREE.Mesh(haloGeo, haloMat);
      transferHalo.visible = false;
      group.add(transferHalo);

      eng.subjectGroup.add(group);

      let atomLabelEl: HTMLSpanElement | null = null;
      if (atomLabelLayerRef.current && pathway.atoms.length <= 42) {
        atomLabelEl = document.createElement('span');
        atomLabelEl.textContent = atom.element;
        atomLabelEl.className =
          'pointer-events-none absolute top-0 left-0 px-1 py-0.2 rounded bg-slate-950/85 border border-slate-700/80 font-mono text-[10px] font-semibold text-slate-100';
        atomLabelEl.style.opacity = '0';
        atomLabelLayerRef.current.appendChild(atomLabelEl);
      }

      eng.atomRuntimes.push({
        index: atom.index,
        element: atom.element,
        transfersFragment: atom.transfersFragment,
        baseRadius,
        group,
        sphereMesh,
        transferHalo,
        atomLabelEl,
      });
    }

    for (const spec of pathway.bonds) {
      const bondMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.34,
        metalness: 0.28,
      });
      const bGroup = new THREE.Group();
      const s0 = new THREE.Mesh(shaftGeo, bondMat);
      const s1 = new THREE.Mesh(shaftGeo, bondMat);
      const s2 = new THREE.Mesh(shaftGeo, bondMat);
      s1.visible = false;
      s2.visible = false;
      bGroup.add(s0, s1, s2);
      eng.subjectGroup.add(bGroup);

      eng.bondRuntimes.push({
        spec,
        group: bGroup,
        shafts: [s0, s1, s2],
        material: bondMat,
      });
    }

    // Frame camera cleanly for the reaction span
    const dist = Math.max(6.8, pathway.sceneRadius * 2.05 + 1.6);
    eng.boundingDistance = dist;
    eng.stageGroup.position.y = -Math.max(1.85, pathway.sceneRadius * 0.42);
    const discScale = Math.max(0.95, pathway.sceneRadius / 3.8);
    eng.stageGroup.scale.set(discScale, 1, discScale);

    eng.cameraGoalPos = null;
    eng.cameraGoalTarget = null;
    eng.controls.target.set(0, 0, 0);
    eng.camera.position.set(0, dist * 0.32, dist * 1.08);
    eng.camera.lookAt(0, 0, 0);

    eng.flushImmediateRender();
  }, [pathway]);

  // Sync external manual progress changes (scrubber / stage jump / replay seed)
  useEffect(() => {
    // When not playing, or when replay resets progress to 0, sync progressRef immediately
    if (!isPlaying || progress === 0) {
      progressRef.current = progress;
    } else if (Math.abs(progress - progressRef.current) > 0.18) {
      progressRef.current = progress;
    }
    engineRef.current?.flushImmediateRender();
  }, [progress, playbackSeed, isPlaying]);

  // Trigger loop when playback starts or visual toggles change
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (isPlaying) {
      eng.ensureLoopRunning();
    } else {
      eng.flushImmediateRender();
    }
  }, [isPlaying, renderStyle, showAtomLabels, autoRotate]);

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#090D16] select-none"
      data-testid="reaction-pathway-stage"
      data-simulation-id={pathway.simulationId}
      data-pathway-occurs={String(pathway.occurs)}
    >
      {/* Isolated WebGL Canvas */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Projected 2D Atom Element Symbols */}
      <div
        ref={atomLabelLayerRef}
        className="pointer-events-none absolute inset-0 overflow-hidden z-10"
        aria-hidden="true"
      />

      {/* Projected 2D Reactant / Transition-State / Product Species Labels */}
      <div
        ref={clusterLabelLayerRef}
        className="pointer-events-none absolute inset-0 overflow-hidden z-10"
        aria-hidden="true"
      />

      {/* Subtle Top-Left Bond Color Legend (Non-Hue-Only Text + Line Swatches) */}
      <div className="pointer-events-none absolute top-3 left-3 sm:left-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[#0C1322]/90 border border-slate-800/90 px-2.5 py-1 text-[11px] text-slate-300">
        {pathway.occurs ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-0.5 bg-slate-300" />
              <span>保留键 ({pathway.preservedBondCount})</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-300">
              <span className="inline-block w-3.5 border-t-2 border-dashed border-rose-400" />
              <span>断裂旧键 ({pathway.brokenBondCount})</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <span className="inline-block w-3.5 border-t-2 border-dashed border-emerald-400" />
              <span>生成新键 ({pathway.formedBondCount})</span>
            </span>
          </>
        ) : (
          <span className="text-slate-300">
            物理碰撞路径：共价键全部保留 ({pathway.preservedBondCount}) · 无断键重排
          </span>
        )}
      </div>

      {contextLost && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090D16]/95 p-6 text-center">
          <p className="text-sm text-slate-300">
            三维渲染上下文正在恢复，请稍候…
          </p>
        </div>
      )}
    </div>
  );
});
