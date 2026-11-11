/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Download, ArrowLeft } from 'lucide-react';
import { ChemicalElement, ELEMENT_BY_SYMBOL } from './chemistry/elements';
import {
  MOLECULES,
  MOLECULE_BY_ID,
  MoleculeCategory,
  MoleculeModel,
} from './chemistry/molecules';
import {
  getDefaultOrbitalForElement,
  QuantumOrbitalId,
} from './chemistry/quantumOrbitals';
import {
  addBondedAtomWithVsepr,
  connectOrUpdateBond,
  createSeedMolecule,
  removeAtomFromMolecule,
  saturateWithHydrogens,
} from './chemistry/moleculeBuilder';
import {
  AtomViewMode,
  CameraPreset,
  ChemistryStage3D,
  ChemistryStage3DHandle,
  MoleculeToolMode,
  RenderStyle,
} from './components/ChemistryStage3D';
import {
  BottomControlDock,
  BuilderAction,
} from './components/BottomControlDock';
import {
  ElementInspectorPanel,
  InspectorTab,
} from './components/ElementInspectorPanel';
import { PeriodicTableView } from './components/PeriodicTableView';
import { MoleculeCatalogView } from './components/MoleculeCatalogModal';
import { ImportPubChemModal } from './components/ImportPubChemModal';
import { ReactionSimulatorView } from './components/ReactionSimulatorView';
import { HomeShowcaseView } from './components/HomeShowcaseView';
import {
  ShowcaseTargetDestination,
  toStageRenderStyle,
} from './chemistry/homeShowcase';

type AppView =
  | 'home'
  | 'molecule-3d'
  | 'atom-3d'
  | 'reaction-sim'
  | 'periodic-table'
  | 'catalog';

export default function App() {
  const stageRef = useRef<ChemistryStage3DHandle | null>(null);

  const [activeView, setActiveView] = useState<AppView>('home');
  const [reactionJumpState, setReactionJumpState] = useState<{
    reactantAId: string;
    reactantBId: string;
    nonce: number;
  }>({ reactantAId: 'methane', reactantBId: 'oxygen', nonce: 0 });
  const [customMolecules, setCustomMolecules] = useState<MoleculeModel[]>([]);
  const [selectedMolecule, setSelectedMolecule] = useState<MoleculeModel>(
    () => MOLECULE_BY_ID['caffeine']
  );
  const [moleculeRevision, setMoleculeRevision] = useState<number>(0);

  const [activeElement, setActiveElement] = useState<ChemicalElement>(
    () => ELEMENT_BY_SYMBOL['C']
  );
  const [atomViewMode, setAtomViewMode] = useState<AtomViewMode>('bohr');
  const [quantumOrbitalId, setQuantumOrbitalId] =
    useState<QuantumOrbitalId>('2pz');

  const [selectedAtomId, setSelectedAtomId] = useState<number | null>(0);
  const [highlightedElementSymbol, setHighlightedElementSymbol] = useState<
    string | null
  >(null);

  const [renderStyle, setRenderStyle] = useState<RenderStyle>('ball-stick');
  const [showDipoleVector, setShowDipoleVector] = useState<boolean>(false);
  const [toolMode, setToolMode] = useState<MoleculeToolMode>('inspect');
  const [measurementAtomIds, setMeasurementAtomIds] = useState<number[]>([]);

  const [builderAction, setBuilderAction] = useState<BuilderAction>('add-atom');
  const [builderElement, setBuilderElement] = useState<string>('C');
  const [builderBondOrder, setBuilderBondOrder] = useState<
    'single' | 'double' | 'triple'
  >('single');
  const [pendingConnectAtomId, setPendingConnectAtomId] = useState<
    number | null
  >(null);

  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [atomScale, setAtomScale] = useState<number>(1.0);
  const [showAtomLabels, setShowAtomLabels] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [moleculeCategoryFilter, setMoleculeCategoryFilter] = useState<
    MoleculeCategory | 'all'
  >('all');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('element');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const allMolecules = useMemo(
    () => [...customMolecules, ...MOLECULES],
    [customMolecules]
  );

  const upsertCustomMolecule = useCallback((mol: MoleculeModel) => {
    setCustomMolecules((prev) => {
      const idx = prev.findIndex((m) => m.id === mol.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = mol;
        return next;
      }
      return [mol, ...prev];
    });
  }, []);

  const handleSelectElement = useCallback((el: ChemicalElement) => {
    setActiveElement(el);
    setQuantumOrbitalId(getDefaultOrbitalForElement(el));
  }, []);

  const handleSelectAtom = useCallback(
    (atomId: number | null, elementSymbol?: string) => {
      setSelectedAtomId(atomId);
      if (elementSymbol && ELEMENT_BY_SYMBOL[elementSymbol]) {
        handleSelectElement(ELEMENT_BY_SYMBOL[elementSymbol]);
      }
    },
    [handleSelectElement]
  );

  const handleToggleMeasurementAtom = useCallback((atomId: number) => {
    setMeasurementAtomIds((prev) => {
      if (prev.includes(atomId)) {
        return prev.filter((id) => id !== atomId);
      }
      if (prev.length >= 4) {
        return [atomId];
      }
      return [...prev, atomId];
    });
  }, []);

  const handleAtomInteract = useCallback(
    (atomId: number, elementSymbol: string) => {
      if (activeView === 'atom-3d') {
        handleSelectAtom(atomId, elementSymbol);
        return;
      }

      if (toolMode === 'inspect') {
        handleSelectAtom(atomId, elementSymbol);
        return;
      }

      if (toolMode === 'measure') {
        handleToggleMeasurementAtom(atomId);
        handleSelectAtom(atomId, elementSymbol);
        setInspectorTab('molecule');
        return;
      }

      // 3D Molecule Builder Mode
      if (builderAction === 'add-atom') {
        const { molecule: nextMol, addedAtomId } = addBondedAtomWithVsepr(
          selectedMolecule,
          atomId,
          builderElement,
          builderBondOrder
        );
        setSelectedMolecule(nextMol);
        upsertCustomMolecule(nextMol);
        setMoleculeRevision((r) => r + 1);
        setSelectedAtomId(addedAtomId);
        setPendingConnectAtomId(null);
        setInspectorTab('molecule');
      } else if (builderAction === 'connect-bond') {
        if (pendingConnectAtomId === null) {
          setPendingConnectAtomId(atomId);
        } else if (pendingConnectAtomId === atomId) {
          setPendingConnectAtomId(null);
        } else {
          const nextMol = connectOrUpdateBond(
            selectedMolecule,
            pendingConnectAtomId,
            atomId,
            builderBondOrder
          );
          setSelectedMolecule(nextMol);
          upsertCustomMolecule(nextMol);
          setMoleculeRevision((r) => r + 1);
          setPendingConnectAtomId(null);
          setInspectorTab('molecule');
        }
      } else if (builderAction === 'delete-atom') {
        if (selectedMolecule.atoms.length <= 1) return;
        const nextMol = removeAtomFromMolecule(selectedMolecule, atomId);
        setSelectedMolecule(nextMol);
        upsertCustomMolecule(nextMol);
        setMoleculeRevision((r) => r + 1);
        setSelectedAtomId(nextMol.atoms[0]?.id ?? null);
        setPendingConnectAtomId(null);
      }
    },
    [
      activeView,
      toolMode,
      builderAction,
      selectedMolecule,
      builderElement,
      builderBondOrder,
      pendingConnectAtomId,
      handleSelectAtom,
      handleToggleMeasurementAtom,
      upsertCustomMolecule,
    ]
  );

  const handleSelectMolecule = useCallback(
    (mol: MoleculeModel) => {
      setSelectedMolecule(mol);
      setExplodeFactor(0);
      setHighlightedElementSymbol(null);
      setMeasurementAtomIds([]);
      setPendingConnectAtomId(null);
      const firstAtom = mol.atoms[0];
      setSelectedAtomId(firstAtom ? firstAtom.id : null);
      if (firstAtom && ELEMENT_BY_SYMBOL[firstAtom.element]) {
        handleSelectElement(ELEMENT_BY_SYMBOL[firstAtom.element]);
      }
      setActiveView('molecule-3d');
    },
    [handleSelectElement]
  );

  const handleImportMolecule = useCallback(
    (mol: MoleculeModel) => {
      upsertCustomMolecule(mol);
      setMoleculeCategoryFilter('all');
      if (activeView === 'reaction-sim') {
        return;
      }
      setToolMode('inspect');
      setInspectorTab('molecule');
      handleSelectMolecule(mol);
    },
    [activeView, upsertCustomMolecule, handleSelectMolecule]
  );

  const handleOpenReactionMoleculeInWorkspace = useCallback(
    (mol: MoleculeModel) => {
      if (!MOLECULE_BY_ID[mol.id]) {
        upsertCustomMolecule(mol);
      }
      setMoleculeCategoryFilter('all');
      setToolMode('inspect');
      setInspectorTab('molecule');
      handleSelectMolecule(mol);
    },
    [upsertCustomMolecule, handleSelectMolecule]
  );

  const handleSaturateHydrogens = useCallback(() => {
    const nextMol = saturateWithHydrogens(selectedMolecule);
    setSelectedMolecule(nextMol);
    upsertCustomMolecule(nextMol);
    setMoleculeRevision((r) => r + 1);
    setPendingConnectAtomId(null);
    setInspectorTab('molecule');
  }, [selectedMolecule, upsertCustomMolecule]);

  const handleNewSeedMolecule = useCallback(() => {
    const fresh = createSeedMolecule('C');
    upsertCustomMolecule(fresh);
    setMoleculeCategoryFilter('all');
    setSelectedMolecule(fresh);
    setMoleculeRevision((r) => r + 1);
    setSelectedAtomId(0);
    setMeasurementAtomIds([]);
    setPendingConnectAtomId(null);
    setToolMode('build');
    setBuilderAction('add-atom');
    setInspectorTab('molecule');
  }, [upsertCustomMolecule]);

  const handleInspectElement3DAtom = useCallback(
    (el: ChemicalElement) => {
      handleSelectElement(el);
      setAtomViewMode('bohr');
      setInspectorTab('element');
      setActiveView('atom-3d');
    },
    [handleSelectElement]
  );

  const handleInspectElementQuantumOrbital = useCallback(
    (el: ChemicalElement) => {
      handleSelectElement(el);
      setAtomViewMode('quantum');
      setInspectorTab('element');
      setActiveView('atom-3d');
    },
    [handleSelectElement]
  );

  const handleCameraPreset = useCallback((preset: CameraPreset) => {
    stageRef.current?.setCameraPreset(preset);
  }, []);

  const handleNavigateFromHome = useCallback(
    (dest: ShowcaseTargetDestination) => {
      if (dest.kind === 'molecule') {
        const mol =
          MOLECULE_BY_ID[dest.moleculeId] ?? MOLECULE_BY_ID['caffeine'];
        setRenderStyle(toStageRenderStyle(dest.renderStyle));
        setShowDipoleVector(Boolean(dest.showDipoleVector));
        setToolMode('inspect');
        setInspectorTab('molecule');
        handleSelectMolecule(mol);
        return;
      }

      if (dest.kind === 'atom') {
        const el =
          ELEMENT_BY_SYMBOL[dest.elementSymbol] ?? ELEMENT_BY_SYMBOL['C'];
        setActiveElement(el);
        setAtomViewMode(dest.atomViewMode);
        setQuantumOrbitalId(
          dest.quantumOrbitalId ?? getDefaultOrbitalForElement(el)
        );
        setInspectorTab('element');
        setActiveView('atom-3d');
        return;
      }

      if (dest.kind === 'reaction') {
        setReactionJumpState((prev) => ({
          reactantAId: dest.reactantAId,
          reactantBId: dest.reactantBId,
          nonce: prev.nonce + 1,
        }));
        setActiveView('reaction-sim');
      }
    },
    [handleSelectMolecule]
  );

  const handleExportSnapshot = useCallback(() => {
    const dataUrl = stageRef.current?.exportSnapshotDataUrl();
    if (!dataUrl) return;
    const link = document.createElement('a');
    const filename =
      activeView === 'home'
        ? 'chemvistas-orbital-showcase.png'
        : activeView === 'atom-3d'
          ? `atom-${activeElement.symbol}-${atomViewMode}.png`
          : activeView === 'reaction-sim'
            ? 'reaction-stage-snapshot.png'
            : `molecule-${selectedMolecule.id}.png`;
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setExportNotice(`已导出高清视图：${filename}`);
    window.setTimeout(() => {
      setExportNotice(null);
    }, 2600);
  }, [activeView, activeElement, atomViewMode, selectedMolecule]);

  const is3DStageActive =
    activeView === 'molecule-3d' || activeView === 'atom-3d';
  const hasSnapshotStage =
    activeView === 'home' || is3DStageActive || activeView === 'reaction-sim';

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#090D16] text-slate-100">
      {/* Strict 3-Zone Top Navigation Bar Contract (Mobile-safe spacing at 390px) */}
      <header className="h-14 shrink-0 flex items-center justify-between gap-1 sm:gap-6 px-2 sm:px-5 lg:px-6 border-b border-slate-800/90 bg-[#0B101B]">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('home');
          }}
          className="text-[13px] sm:text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
        >
          分子视界<span className="hidden xl:inline"> ChemVistas</span>
        </a>

        {/* Zone 2: 5 Concise Single-Line Navigation Links */}
        <nav
          aria-label="主导航"
          className="flex items-center gap-1.5 sm:gap-6 text-[11px] sm:text-sm font-medium overflow-x-auto"
        >
          {(
            [
              ['home', '首页'],
              ['molecule-3d', '分子模型'],
              ['atom-3d', '三维原子'],
              ['reaction-sim', '反应模拟'],
              ['periodic-table', '元素周期表'],
            ] as [AppView, string][]
          ).map(([viewKey, label]) => {
            const active = activeView === viewKey;
            return (
              <button
                key={viewKey}
                type="button"
                onClick={() => setActiveView(viewKey)}
                aria-current={active ? 'page' : undefined}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-cyan-400 text-white font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center shrink-0">
          {hasSnapshotStage ? (
            <button
              type="button"
              onClick={handleExportSnapshot}
              className="inline-flex items-center gap-1 px-2 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">导出快照</span>
              <span className="sm:hidden">快照</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveView('home')}
              className="inline-flex items-center gap-1 px-2 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">返回首页</span>
              <span className="sm:hidden">首页</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {activeView === 'home' ? (
          <div className="relative flex-1 min-h-0 flex w-full h-full">
            <HomeShowcaseView
              ref={stageRef}
              onNavigateToDestination={handleNavigateFromHome}
              onOpenCatalog={() => setActiveView('catalog')}
              onOpenPeriodicTable={() => setActiveView('periodic-table')}
            />
            {exportNotice && (
              <div
                role="status"
                className="pointer-events-none absolute top-4 right-5 z-20 px-3 py-1.5 rounded-lg bg-[#0E1628] border border-cyan-500/50 text-xs font-medium text-cyan-200 shadow-lg"
              >
                {exportNotice}
              </div>
            )}
          </div>
        ) : is3DStageActive ? (
          <>
            {/* Unobstructed 3D Viewport Stage + Unified Bottom Dock */}
            <div className="relative flex-1 flex flex-col lg:block lg:min-h-0 lg:h-full">
              <div className="relative h-[340px] sm:h-[420px] lg:h-full w-full shrink-0">
                <ChemistryStage3D
                  ref={stageRef}
                  stageMode={activeView === 'atom-3d' ? 'atom' : 'molecule'}
                  atomViewMode={atomViewMode}
                  quantumOrbitalId={quantumOrbitalId}
                  molecule={selectedMolecule}
                  moleculeRevision={moleculeRevision}
                  activeElement={activeElement}
                  selectedAtomId={selectedAtomId}
                  highlightedElementSymbol={highlightedElementSymbol}
                  renderStyle={renderStyle}
                  showDipoleVector={showDipoleVector}
                  toolMode={toolMode}
                  measurementAtomIds={measurementAtomIds}
                  pendingConnectAtomId={pendingConnectAtomId}
                  explodeFactor={explodeFactor}
                  atomScale={atomScale}
                  showAtomLabels={showAtomLabels}
                  autoRotate={autoRotate}
                  onAtomInteract={handleAtomInteract}
                />

                {exportNotice && (
                  <div
                    role="status"
                    className="pointer-events-none absolute top-4 right-5 z-20 px-3 py-1.5 rounded-lg bg-[#0E1628] border border-cyan-500/50 text-xs font-medium text-cyan-200 shadow-lg"
                  >
                    {exportNotice}
                  </div>
                )}
              </div>

              <BottomControlDock
                stageMode={activeView === 'atom-3d' ? 'atom' : 'molecule'}
                atomViewMode={atomViewMode}
                onChangeAtomViewMode={setAtomViewMode}
                quantumOrbitalId={quantumOrbitalId}
                onChangeQuantumOrbitalId={setQuantumOrbitalId}
                collapsed={dockCollapsed}
                onToggleCollapsed={() => setDockCollapsed((prev) => !prev)}
                molecules={allMolecules}
                selectedMolecule={selectedMolecule}
                onSelectMolecule={handleSelectMolecule}
                moleculeCategoryFilter={moleculeCategoryFilter}
                onChangeMoleculeCategory={setMoleculeCategoryFilter}
                onOpenImportModal={() => setIsImportModalOpen(true)}
                onOpenCatalog={() => setActiveView('catalog')}
                activeElement={activeElement}
                onSelectElement={(el) => {
                  handleSelectElement(el);
                  setInspectorTab('element');
                }}
                renderStyle={renderStyle}
                onChangeRenderStyle={setRenderStyle}
                showDipoleVector={showDipoleVector}
                onToggleDipoleVector={() =>
                  setShowDipoleVector((prev) => !prev)
                }
                toolMode={toolMode}
                onChangeToolMode={(mode) => {
                  setToolMode(mode);
                  setPendingConnectAtomId(null);
                  if (mode === 'measure' || mode === 'build') {
                    setInspectorTab('molecule');
                  }
                }}
                measurementAtomIds={measurementAtomIds}
                onClearMeasurement={() => setMeasurementAtomIds([])}
                builderAction={builderAction}
                onChangeBuilderAction={(act) => {
                  setBuilderAction(act);
                  setPendingConnectAtomId(null);
                }}
                builderElement={builderElement}
                onChangeBuilderElement={setBuilderElement}
                builderBondOrder={builderBondOrder}
                onChangeBuilderBondOrder={setBuilderBondOrder}
                pendingConnectAtomId={pendingConnectAtomId}
                onSaturateHydrogens={handleSaturateHydrogens}
                onNewSeedMolecule={handleNewSeedMolecule}
                explodeFactor={explodeFactor}
                onChangeExplodeFactor={setExplodeFactor}
                atomScale={atomScale}
                onChangeAtomScale={setAtomScale}
                showAtomLabels={showAtomLabels}
                onToggleAtomLabels={() => setShowAtomLabels((prev) => !prev)}
                autoRotate={autoRotate}
                onToggleAutoRotate={() => setAutoRotate((prev) => !prev)}
                onCameraPreset={handleCameraPreset}
              />
            </div>

            {/* Side-by-Side Element & Structure Property Panel (Zero 3D Occlusion) */}
            <ElementInspectorPanel
              activeTab={inspectorTab}
              onChangeTab={setInspectorTab}
              activeElement={activeElement}
              onSelectElement={handleSelectElement}
              molecules={allMolecules}
              molecule={selectedMolecule}
              onSelectMolecule={handleSelectMolecule}
              selectedAtomId={selectedAtomId}
              highlightedElementSymbol={highlightedElementSymbol}
              onSelectAtom={handleSelectAtom}
              onHighlightElementIn3D={setHighlightedElementSymbol}
              onInspectElement3DAtom={handleInspectElement3DAtom}
              onInspectElementQuantumOrbital={handleInspectElementQuantumOrbital}
              atomViewMode={atomViewMode}
              quantumOrbitalId={quantumOrbitalId}
              onChangeQuantumOrbitalId={setQuantumOrbitalId}
              renderStyle={renderStyle}
              onChangeRenderStyle={setRenderStyle}
              showDipoleVector={showDipoleVector}
              onToggleDipoleVector={() => setShowDipoleVector((prev) => !prev)}
              toolMode={toolMode}
              onChangeToolMode={(mode) => {
                setToolMode(mode);
                setPendingConnectAtomId(null);
              }}
              measurementAtomIds={measurementAtomIds}
              onToggleMeasurementAtom={handleToggleMeasurementAtom}
              onClearMeasurement={() => setMeasurementAtomIds([])}
              showMoleculeTab={activeView === 'molecule-3d'}
            />
          </>
        ) : activeView === 'reaction-sim' ? (
          <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row w-full">
            <ReactionSimulatorView
              key={`rxn-${reactionJumpState.nonce}`}
              ref={stageRef}
              molecules={allMolecules}
              initialReactantAId={reactionJumpState.reactantAId}
              initialReactantBId={reactionJumpState.reactantBId}
              onOpenMoleculeInWorkspace={handleOpenReactionMoleculeInWorkspace}
              onOpenImportModal={() => setIsImportModalOpen(true)}
            />
            {exportNotice && (
              <div
                role="status"
                className="pointer-events-none absolute top-4 right-5 z-20 px-3 py-1.5 rounded-lg bg-[#0E1628] border border-cyan-500/50 text-xs font-medium text-cyan-200 shadow-lg"
              >
                {exportNotice}
              </div>
            )}
          </div>
        ) : activeView === 'periodic-table' ? (
          <>
            <PeriodicTableView
              activeElement={activeElement}
              onSelectElement={handleSelectElement}
              onInspectElement3DAtom={handleInspectElement3DAtom}
            />
            <ElementInspectorPanel
              activeTab="element"
              onChangeTab={setInspectorTab}
              activeElement={activeElement}
              onSelectElement={handleSelectElement}
              molecules={allMolecules}
              molecule={selectedMolecule}
              onSelectMolecule={handleSelectMolecule}
              selectedAtomId={selectedAtomId}
              highlightedElementSymbol={highlightedElementSymbol}
              onSelectAtom={handleSelectAtom}
              onHighlightElementIn3D={setHighlightedElementSymbol}
              onInspectElement3DAtom={handleInspectElement3DAtom}
              onInspectElementQuantumOrbital={handleInspectElementQuantumOrbital}
              atomViewMode={atomViewMode}
              quantumOrbitalId={quantumOrbitalId}
              onChangeQuantumOrbitalId={setQuantumOrbitalId}
              renderStyle={renderStyle}
              onChangeRenderStyle={setRenderStyle}
              showDipoleVector={showDipoleVector}
              onToggleDipoleVector={() => setShowDipoleVector((prev) => !prev)}
              toolMode={toolMode}
              onChangeToolMode={setToolMode}
              measurementAtomIds={measurementAtomIds}
              onToggleMeasurementAtom={handleToggleMeasurementAtom}
              onClearMeasurement={() => setMeasurementAtomIds([])}
              showMoleculeTab={false}
            />
          </>
        ) : (
          <MoleculeCatalogView
            molecules={allMolecules}
            selectedMoleculeId={selectedMolecule.id}
            onSelectMoleculeAndOpen3D={handleSelectMolecule}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        )}
      </main>

      <ImportPubChemModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportMolecule={handleImportMolecule}
      />
    </div>
  );
}
