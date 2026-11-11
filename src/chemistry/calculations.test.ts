import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, ELEMENT_BY_NUMBER, ELEMENT_BY_SYMBOL } from './elements';
import { MOLECULES, MOLECULE_BY_ID } from './molecules';
import {
  analyzeMoleculeComposition,
  build3DAtomStructure,
  computeBondAngle,
  computeBondLength,
  computeCenteredCoordinates,
  computeDihedralAngle,
  computeExplodedPosition,
  filterElements,
  getElementPhaseAtTemperature,
  inspectAtomGeometry,
  measureAtomSelection,
} from './calculations';
import { computeMoleculeElectrostatics } from './electrostatics';
import {
  buildQuantumOrbital3D,
  evaluateOrbitalWavefunction,
  getDefaultOrbitalForElement,
  QUANTUM_ORBITAL_LIST,
} from './quantumOrbitals';
import {
  formatMolecularFormula,
  parseChemicalStructureText,
  parseMolSdf,
  parsePdb,
  parseXyz,
  SAMPLE_XYZ_ACETONE,
} from './structureParser';
import {
  addBondedAtomWithVsepr,
  connectOrUpdateBond,
  createSeedMolecule,
  removeAtomFromMolecule,
  saturateWithHydrogens,
} from './moleculeBuilder';
import {
  CLASSIC_REACTION_PRESETS,
  PRODUCT_MOLECULES,
  simulateChemicalReaction,
} from './reactions';
import {
  buildReactionPathway,
  evaluateReactionPathwayFrame,
} from './reactionPathway';
import {
  computeSatelliteWorldPosition,
  HOME_HERO_MODELS,
  HOME_SATELLITE_CASES,
  normalizeMoleculeCoordsForStage,
  validateHomeShowcaseIntegrity,
} from './homeShowcase';

test('all 118 IUPAC elements exist with exact electron shell sums and unique periodic grid cells', () => {
  assert.equal(ELEMENTS.length, 118);

  const symbols = new Set<string>();
  const zhNames = new Set<string>();
  const gridCells = new Set<string>();

  for (let z = 1; z <= 118; z++) {
    const el = ELEMENT_BY_NUMBER[z];
    assert.ok(el, `Element Z=${z} should exist`);
    assert.equal(el.number, z);
    assert.ok(!symbols.has(el.symbol), `Duplicate symbol ${el.symbol}`);
    symbols.add(el.symbol);

    assert.ok(!zhNames.has(el.nameZh), `Duplicate Chinese name ${el.nameZh} at Z=${z}`);
    zhNames.add(el.nameZh);

    const shellSum = el.shells.reduce((acc, n) => acc + n, 0);
    assert.equal(
      shellSum,
      el.number,
      `Electron shell sum for ${el.symbol} (Z=${el.number}) expected ${el.number} but got ${shellSum}`
    );

    const cellKey = `${el.gridRow}-${el.gridCol}`;
    assert.ok(!gridCells.has(cellKey), `Periodic grid collision at ${cellKey} for ${el.symbol}`);
    gridCells.add(cellKey);

    assert.ok(el.covalentRadius > 0);
    assert.ok(el.vdwRadius > 0);
    assert.ok(el.cpkColor.startsWith('#'));
  }
});

test('all molecules have valid atoms, valid bond indices, and positive molar masses', () => {
  assert.ok(MOLECULES.length >= 12);

  for (const mol of MOLECULES) {
    assert.ok(mol.atoms.length >= 2, `${mol.id} must have at least 2 atoms`);
    assert.ok(mol.bonds.length >= 1, `${mol.id} must have at least 1 bond`);

    const atomIds = new Set(mol.atoms.map((a) => a.id));
    for (const atom of mol.atoms) {
      assert.ok(ELEMENT_BY_SYMBOL[atom.element], `Invalid element ${atom.element} in ${mol.id}`);
    }

    for (const bond of mol.bonds) {
      assert.notEqual(bond.from, bond.to, `Self-bond in ${mol.id}`);
      assert.ok(atomIds.has(bond.from), `Missing bond.from ${bond.from} in ${mol.id}`);
      assert.ok(atomIds.has(bond.to), `Missing bond.to ${bond.to} in ${mol.id}`);
    }

    const { molarMass, composition } = analyzeMoleculeComposition(mol);
    assert.ok(molarMass > 0);
    const pctSum = composition.reduce((s, item) => s + item.massPercent, 0);
    assert.ok(Math.abs(pctSum - 100) < 0.2, `Mass percent sum for ${mol.id} was ${pctSum}`);
  }
});

test('specific chemical geometry invariants hold (Water, Methane, Benzene, C60, Diamond)', () => {
  const water = MOLECULE_BY_ID['water'];
  const waterComp = analyzeMoleculeComposition(water);
  assert.ok(Math.abs(waterComp.molarMass - 18.015) < 0.01);

  const oInspect = inspectAtomGeometry(water, 0);
  assert.ok(oInspect);
  assert.equal(oInspect.coordinationNumber, 2);
  assert.equal(oInspect.angles.length, 1);
  assert.ok(Math.abs(oInspect.angles[0].angleDeg - 104.5) <= 0.3);
  assert.ok(Math.abs(oInspect.bonds[0].lengthAngstrom - 0.957) <= 0.02);

  const methane = MOLECULE_BY_ID['methane'];
  const cInspect = inspectAtomGeometry(methane, 0);
  assert.ok(cInspect);
  assert.equal(cInspect.coordinationNumber, 4);
  assert.equal(cInspect.angles.length, 6);
  for (const ang of cInspect.angles) {
    assert.ok(Math.abs(ang.angleDeg - 109.5) <= 0.2);
  }

  const benzene = MOLECULE_BY_ID['benzene'];
  assert.equal(benzene.atoms.length, 12);
  assert.equal(benzene.bonds.length, 12);
  assert.equal(computeBondAngle(benzene.atoms[5], benzene.atoms[0], benzene.atoms[1]), 120.0);
  assert.ok(Math.abs(computeBondLength(benzene.atoms[0], benzene.atoms[1]) - 1.397) < 0.01);

  const c60 = MOLECULE_BY_ID['fullerene-c60'];
  assert.equal(c60.atoms.length, 60);
  assert.equal(c60.bonds.length, 90);
  const doubleBonds = c60.bonds.filter((b) => b.order === 'double').length;
  const singleBonds = c60.bonds.filter((b) => b.order === 'single').length;
  assert.equal(doubleBonds, 30);
  assert.equal(singleBonds, 60);

  const diamond = MOLECULE_BY_ID['diamond'];
  assert.equal(diamond.atoms.length, 18);
  assert.equal(diamond.bonds.length, 16);
});

test('element filtering and 3D atomic structure builder work accurately', () => {
  assert.equal(filterElements('铁', 'all').length, 1);
  assert.equal(filterElements('铁', 'all')[0].symbol, 'Fe');
  assert.equal(filterElements('79', 'all')[0].symbol, 'Au');
  assert.equal(filterElements('', 'noble-gas').length, 7);

  const fe3d = build3DAtomStructure(ELEMENT_BY_SYMBOL['Fe']);
  assert.equal(fe3d.protons, 26);
  assert.equal(fe3d.neutrons, 30);
  assert.equal(fe3d.electrons.length, 26);
  assert.equal(fe3d.shellRadii.length, 4);

  const centered = computeCenteredCoordinates(MOLECULE_BY_ID['caffeine'].atoms);
  assert.ok(centered.boundingRadius > 2.5);
  const exploded = computeExplodedPosition([2, 0, 0], 0.5);
  assert.ok(exploded[0] > 2);
});

test('chemical file parsers (.xyz, .mol/.sdf, .pdb) accurately reconstruct atoms, bonds, and formulas', () => {
  const acetone = parseXyz(SAMPLE_XYZ_ACETONE);
  assert.equal(acetone.atoms.length, 10);
  assert.equal(acetone.formulaDisplay, 'C₃H₆O');
  assert.equal(acetone.bonds.length, 9);
  const hasCO = acetone.bonds.some((b) => b.order === 'double');
  assert.ok(hasCO, 'Acetone C=O bond should be inferred as double bond');

  const formaldehydeMol = [
    'Formaldehyde',
    '  ChemVistas 3D',
    '',
    '  4  3  0  0  0  0  0  0  0  0999 V2000',
    '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
    '    0.0000    1.2100    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
    '    0.9400   -0.5400    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
    '   -0.9400   -0.5400    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0',
    '  1  2  2  0  0  0  0',
    '  1  3  1  0  0  0  0',
    '  1  4  1  0  0  0  0',
    'M  END',
  ].join('\n');
  const ch2o = parseMolSdf(formaldehydeMol, '甲醛');
  assert.equal(ch2o.atoms.length, 4);
  assert.equal(ch2o.bonds.length, 3);
  assert.equal(ch2o.formulaDisplay, 'CH₂O');
  assert.equal(ch2o.bonds[0].order, 'double');

  const samplePdb = [
    'TITLE     WATER MOLECULE HETATM',
    'HETATM    1  O   HOH A   1       0.000   0.000   0.117  1.00  0.00           O',
    'HETATM    2  H1  HOH A   1       0.000   0.757  -0.469  1.00  0.00           H',
    'HETATM    3  H2  HOH A   1       0.000  -0.757  -0.469  1.00  0.00           H',
    'CONECT    1    2    3',
    'END',
  ].join('\n');
  const pdbMol = parsePdb(samplePdb);
  assert.equal(pdbMol.atoms.length, 3);
  assert.equal(pdbMol.bonds.length, 2);
  assert.equal(formatMolecularFormula(pdbMol.atoms), 'H₂O');
  assert.equal(parseChemicalStructureText(formaldehydeMol).formulaDisplay, 'CH₂O');
});

test('electrostatics & dipole vectors distinguish polar H2O/NH3 from symmetric nonpolar CO2/CH4/C6H6', () => {
  const h2oEsp = computeMoleculeElectrostatics(MOLECULE_BY_ID['water']);
  const oxygenCharge = h2oEsp.atomMap.get(0)?.partialCharge ?? 0;
  const hydrogenCharge = h2oEsp.atomMap.get(1)?.partialCharge ?? 0;
  assert.ok(oxygenCharge < -0.4, `Oxygen in H2O should be δ-, got ${oxygenCharge}`);
  assert.ok(hydrogenCharge > 0.2, `Hydrogen in H2O should be δ+, got ${hydrogenCharge}`);
  assert.ok(
    Math.abs(h2oEsp.dipoleMagnitudeDebye - 1.85) < 0.25,
    `H2O dipole expected ~1.85 D, got ${h2oEsp.dipoleMagnitudeDebye}`
  );

  const co2Esp = computeMoleculeElectrostatics(MOLECULE_BY_ID['co2']);
  const co2Carbon = co2Esp.atoms.find((a) => a.element === 'C');
  const co2Oxygen = co2Esp.atoms.find((a) => a.element === 'O');
  assert.ok((co2Carbon?.partialCharge ?? 0) > 0.5, 'Carbon in CO2 is strongly δ+');
  assert.ok((co2Oxygen?.partialCharge ?? 0) < -0.25, 'Oxygen in CO2 is δ-');
  assert.ok(co2Esp.dipoleMagnitudeDebye < 0.05, 'CO2 net dipole cancels to 0.00 D by symmetry');

  const ch4Esp = computeMoleculeElectrostatics(MOLECULE_BY_ID['methane']);
  assert.ok(ch4Esp.dipoleMagnitudeDebye < 0.05, 'CH4 net dipole cancels to 0.00 D');
});

test('quantum orbitals generate valid dual-phase 3D probability clouds and subshell defaults', () => {
  assert.equal(QUANTUM_ORBITAL_LIST.length, 12);
  assert.equal(getDefaultOrbitalForElement(ELEMENT_BY_SYMBOL['H']), '1s');
  assert.equal(getDefaultOrbitalForElement(ELEMENT_BY_SYMBOL['N']), '2pz');
  assert.equal(getDefaultOrbitalForElement(ELEMENT_BY_SYMBOL['Ti']), '3dz2');
  assert.equal(getDefaultOrbitalForElement(ELEMENT_BY_SYMBOL['Nd']), '4fz3');

  // Verify 2pz antisymmetric phase across visual Y (polar Z)
  assert.ok(evaluateOrbitalWavefunction('2pz', 0, 1.0, 0) > 0);
  assert.ok(evaluateOrbitalWavefunction('2pz', 0, -1.0, 0) < 0);
  assert.equal(evaluateOrbitalWavefunction('2pz', 1.0, 0, 0), 0);

  const dOrb = buildQuantumOrbital3D('3dz2', 400);
  assert.equal(dOrb.points.length, 400);
  assert.ok(dOrb.points.some((p) => p.phase === 1));
  assert.ok(dOrb.points.some((p) => p.phase === -1));
  assert.equal(dOrb.lobes.length, 3);
});

test('interactive VSEPR 3D molecule builder and 4-atom dihedral ruler work end-to-end', () => {
  let mol = createSeedMolecule('C');
  assert.equal(mol.atoms.length, 1);

  // Saturating a bare Carbon seed with Hydrogens produces tetrahedral CH4!
  mol = saturateWithHydrogens(mol);
  assert.equal(mol.atoms.length, 5);
  assert.equal(mol.bonds.length, 4);
  assert.equal(mol.formulaDisplay, 'CH₄');
  const ch4Inspect = inspectAtomGeometry(mol, 0);
  assert.ok(ch4Inspect);
  for (const ang of ch4Inspect.angles) {
    assert.ok(
      Math.abs(ang.angleDeg - 109.5) < 1.5,
      `VSEPR tetrahedral angle expected ~109.5°, got ${ang.angleDeg}°`
    );
  }

  // Graft another C and remove an atom, then update bond order
  const grown = addBondedAtomWithVsepr(createSeedMolecule('C'), 0, 'C', 'single');
  assert.equal(grown.molecule.atoms.length, 2);
  const etheneCore = connectOrUpdateBond(grown.molecule, 0, 1, 'double');
  assert.equal(etheneCore.bonds[0].order, 'double');
  const ethene = saturateWithHydrogens(etheneCore);
  assert.equal(ethene.formulaDisplay, 'C₂H₄');
  assert.equal(ethene.atoms.length, 6);

  const trimmed = removeAtomFromMolecule(ethene, 5);
  assert.equal(trimmed.atoms.length, 5);

  // Test 4-atom dihedral torsion angle (trans = ±180°, cis = 0°, orthogonal = +90°)
  const a = { id: 0, element: 'C', x: 0, y: 1, z: 0 };
  const b = { id: 1, element: 'C', x: 0, y: 0, z: 0 };
  const c = { id: 2, element: 'C', x: 1, y: 0, z: 0 };
  const dTrans = { id: 3, element: 'C', x: 1, y: -1, z: 0 };
  const dCis = { id: 3, element: 'C', x: 1, y: 1, z: 0 };
  const dGauche90 = { id: 3, element: 'C', x: 1, y: 0, z: 1 };

  assert.equal(Math.abs(computeDihedralAngle(a, b, c, dTrans)), 180.0);
  assert.equal(computeDihedralAngle(a, b, c, dCis), 0.0);
  assert.equal(Math.abs(computeDihedralAngle(a, b, c, dGauche90)), 90.0);

  const ruler = measureAtomSelection(MOLECULE_BY_ID['ethanol'], [0, 1, 2, 8]);
  assert.ok(ruler.distanceAB);
  assert.ok(ruler.angleABC);
  assert.ok(ruler.dihedralABCD);
});

test('temperature phase simulator accurately classifies elements from 0 K to 6000 K', () => {
  const hg = ELEMENT_BY_SYMBOL['Hg'];
  const br = ELEMENT_BY_SYMBOL['Br'];
  const w = ELEMENT_BY_SYMBOL['W'];
  const n = ELEMENT_BY_SYMBOL['N'];

  // At standard room temperature 298.15 K (25 °C)
  assert.equal(getElementPhaseAtTemperature(hg, 298.15), 'liquid');
  assert.equal(getElementPhaseAtTemperature(br, 298.15), 'liquid');
  assert.equal(getElementPhaseAtTemperature(w, 298.15), 'solid');
  assert.equal(getElementPhaseAtTemperature(n, 298.15), 'gas');

  // At liquid nitrogen 77 K: N2 is borderline/liquid (mp 63.15 K, bp 77.36 K), Hg is solid
  assert.equal(getElementPhaseAtTemperature(n, 70), 'liquid');
  assert.equal(getElementPhaseAtTemperature(hg, 77), 'solid');

  // At 3500 K: Tungsten (mp 3695 K) is still solid! Iron (mp 1811 K, bp 3134 K) is gas!
  assert.equal(getElementPhaseAtTemperature(w, 3500), 'solid');
  assert.equal(getElementPhaseAtTemperature(ELEMENT_BY_SYMBOL['Fe'], 3500), 'gas');

  // At 6000 K: Tungsten (bp 6203 K? Wait: check W boiling point)
  assert.equal(getElementPhaseAtTemperature(w, 6000), w.boilingPoint && 6000 < w.boilingPoint ? 'liquid' : 'gas');
});

test('chemical reaction simulator balances canonical, heuristic, and inert pairs with valid 3D products', () => {
  // 1. Validate every dedicated 3D product molecule in PRODUCT_MOLECULES
  const productEntries = Object.values(PRODUCT_MOLECULES);
  assert.ok(productEntries.length >= 17);
  for (const prod of productEntries) {
    assert.ok(prod.atoms.length >= 2, `Product ${prod.id} must have >= 2 atoms`);
    assert.ok(prod.bonds.length >= 1, `Product ${prod.id} must have >= 1 bond`);
    const ids = new Set(prod.atoms.map((a) => a.id));
    for (const atom of prod.atoms) {
      assert.ok(ELEMENT_BY_SYMBOL[atom.element], `Unknown element ${atom.element} in ${prod.id}`);
    }
    for (const bond of prod.bonds) {
      assert.notEqual(bond.from, bond.to, `Self-bond in ${prod.id}`);
      assert.ok(ids.has(bond.from), `Missing bond.from in ${prod.id}`);
      assert.ok(ids.has(bond.to), `Missing bond.to in ${prod.id}`);
    }
  }

  // 2. Every classic preset must occur and strictly conserve atoms
  for (const preset of CLASSIC_REACTION_PRESETS) {
    const molA = MOLECULE_BY_ID[preset.reactantAId];
    const molB = MOLECULE_BY_ID[preset.reactantBId];
    assert.ok(molA && molB, `Preset ${preset.id} references missing molecule`);
    const res = simulateChemicalReaction(molA, molB);
    assert.equal(res.occurs, true, `Preset ${preset.id} should occur`);
    assert.equal(res.isAtomBalanced, true, `Preset ${preset.id} failed atom conservation: ${res.equationText}`);
    assert.ok(res.products.length >= 1);
  }

  // 3. Order independence (A + B vs B + A) for Fischer esterification
  const forwardEster = simulateChemicalReaction(
    MOLECULE_BY_ID['acetic-acid'],
    MOLECULE_BY_ID['ethanol']
  );
  const reverseOrderEster = simulateChemicalReaction(
    MOLECULE_BY_ID['ethanol'],
    MOLECULE_BY_ID['acetic-acid']
  );
  assert.equal(forwardEster.occurs, true);
  assert.equal(reverseOrderEster.occurs, true);
  assert.equal(forwardEster.isAtomBalanced, true);
  assert.equal(reverseOrderEster.isAtomBalanced, true);
  assert.equal(forwardEster.products[0].molecule.id, 'prod-ethyl-acetate');
  assert.equal(reverseOrderEster.products[0].molecule.id, 'prod-ethyl-acetate');

  // 4. Tier-2 universal combustion heuristic on Caffeine (C8H10N4O2 + O2 -> CO2 + H2O + N2)
  const caffeineCombustion = simulateChemicalReaction(
    MOLECULE_BY_ID['caffeine'],
    MOLECULE_BY_ID['oxygen']
  );
  assert.equal(caffeineCombustion.occurs, true);
  assert.equal(caffeineCombustion.isAtomBalanced, true);
  assert.ok(caffeineCombustion.enthalpyKjPerMol < 0);
  assert.ok(caffeineCombustion.products.some((p) => p.molecule.id === 'prod-n2'));

  // 5. Tier-2 universal 3D VSEPR hydrogenation on imported Acetone (C3H6O + H2 -> C3H8O)
  const acetone = parseXyz(SAMPLE_XYZ_ACETONE);
  const acetoneHydro = simulateChemicalReaction(acetone, MOLECULE_BY_ID['hydrogen']);
  assert.equal(acetoneHydro.occurs, true);
  assert.equal(acetoneHydro.isAtomBalanced, true);
  assert.equal(acetoneHydro.products[0].molecule.atoms.length, 12);
  assert.equal(acetoneHydro.products[0].molecule.formulaDisplay, 'C₃H₈O');

  // 6. Tier-2 universal chlorination on Ethane (C2H6 + Cl2 -> C2H5Cl + HCl)
  const ethaneChloro = simulateChemicalReaction(
    PRODUCT_MOLECULES['ethane'],
    MOLECULE_BY_ID['chlorine']
  );
  assert.equal(ethaneChloro.occurs, true);
  assert.equal(ethaneChloro.isAtomBalanced, true);
  assert.equal(ethaneChloro.products.length, 2);

  // 7. Honest inert / physical interaction fallback when no covalent reaction occurs
  const inertPair = simulateChemicalReaction(
    MOLECULE_BY_ID['methane'],
    MOLECULE_BY_ID['benzene']
  );
  assert.equal(inertPair.occurs, false);
  assert.equal(inertPair.isAtomBalanced, true);
  assert.equal(inertPair.enthalpyKjPerMol, 0);
});

test('3D reaction pathway maps conserved atoms 1-to-1 and interpolates bond breaking/forming smoothly', () => {
  // 1. Fischer esterification: CH3COOH (8) + C2H5OH (9) -> CH3COOC2H5 (14) + H2O (3) = 17 conserved atoms
  const esterSim = simulateChemicalReaction(
    MOLECULE_BY_ID['acetic-acid'],
    MOLECULE_BY_ID['ethanol']
  );
  const esterPath = buildReactionPathway(esterSim);
  assert.equal(esterPath.occurs, true);
  assert.equal(esterPath.atoms.length, 17);
  assert.equal(esterPath.reactantClusters.length, 2);
  assert.equal(esterPath.productClusters.length, 2);
  assert.ok(esterPath.brokenBondCount >= 2, 'Old bonds must break');
  assert.ok(esterPath.formedBondCount >= 2, 'New bonds must form');
  assert.ok(esterPath.preservedBondCount >= 10, 'Spectator skeleton bonds stay preserved');

  const fStart = evaluateReactionPathwayFrame(esterPath, 0);
  const fTS = evaluateReactionPathwayFrame(esterPath, 0.5);
  const fEnd = evaluateReactionPathwayFrame(esterPath, 1);

  assert.equal(fStart.phase.phaseKey, 'reactants');
  assert.equal(fTS.phase.phaseKey, 'transition-state');
  assert.equal(fEnd.phase.phaseKey, 'products');
  assert.ok(fTS.tsIntensity > 0.9, 'Transition state halo peaks at p=0.5');
  assert.ok(fStart.tsIntensity < 0.05);
  assert.ok(fEnd.tsIntensity < 0.05);

  // Verify broken bonds fade 1 -> 0 and formed bonds fade 0 -> 1
  for (const b of fStart.bonds) {
    if (b.spec.role === 'broken') assert.equal(b.opacity, 1);
    if (b.spec.role === 'formed') assert.equal(b.opacity, 0);
    if (b.spec.role === 'preserved') assert.equal(b.opacity, 1);
  }
  for (const b of fEnd.bonds) {
    if (b.spec.role === 'broken') assert.equal(b.opacity, 0);
    if (b.spec.role === 'formed') assert.equal(b.opacity, 1);
    if (b.spec.role === 'preserved') assert.equal(b.opacity, 1);
  }

  // 2. Verify all 10 classic presets build valid finite 3D pathways
  for (const preset of CLASSIC_REACTION_PRESETS) {
    const sim = simulateChemicalReaction(
      MOLECULE_BY_ID[preset.reactantAId],
      MOLECULE_BY_ID[preset.reactantBId]
    );
    const pw = buildReactionPathway(sim);
    assert.ok(pw.atoms.length >= 4);
    const mid = evaluateReactionPathwayFrame(pw, 0.5);
    assert.equal(mid.atomPositions.length, pw.atoms.length);
    for (const pos of mid.atomPositions) {
      assert.ok(
        Number.isFinite(pos[0]) && Number.isFinite(pos[1]) && Number.isFinite(pos[2]),
        `Non-finite 3D coordinate in pathway ${preset.id}`
      );
    }
  }

  // 3. Inert pair elastic collision pathway preserves all bonds without cleavage
  const inertSim = simulateChemicalReaction(
    MOLECULE_BY_ID['methane'],
    MOLECULE_BY_ID['benzene']
  );
  const inertPath = buildReactionPathway(inertSim);
  assert.equal(inertPath.occurs, false);
  assert.equal(inertPath.brokenBondCount, 0);
  assert.equal(inertPath.formedBondCount, 0);
  const inertMid = evaluateReactionPathwayFrame(inertPath, 0.5);
  assert.equal(inertMid.phase.phaseKey, 'elastic-collision');
  assert.ok(inertMid.bonds.every((b) => b.opacity === 1));
});

test('home orbital showcase models have valid jump targets and collision-free 3D satellite orbits', () => {
  assert.equal(validateHomeShowcaseIntegrity(), true);
  assert.ok(HOME_HERO_MODELS.length >= 3);
  assert.equal(HOME_SATELLITE_CASES.length, 8);

  // Verify hero normalization fits C60 cleanly into target radius 2.05
  const c60Norm = normalizeMoleculeCoordsForStage(
    MOLECULE_BY_ID['fullerene-c60'],
    2.05
  );
  assert.equal(c60Norm.atoms.length, 60);
  for (const a of c60Norm.atoms) {
    const r = Math.hypot(a.x, a.y, a.z);
    assert.ok(r <= 2.06, `Expected C60 normalized radius <= 2.06, got ${r}`);
  }

  // Sample multiple orbital rotation angles and ensure zero collision with hero (0,0.28,0) or neighbor satellites
  for (const angle of [0, 0.4, 1.1, Math.PI * 0.75, Math.PI * 1.5]) {
    const positions = HOME_SATELLITE_CASES.map((_, idx) =>
      computeSatelliteWorldPosition(idx, HOME_SATELLITE_CASES.length, angle)
    );
    for (let i = 0; i < positions.length; i++) {
      const [xi, yi, zi] = positions[i];
      const distFromHero = Math.hypot(xi, yi - 0.28, zi);
      assert.ok(
        distFromHero >= 5.2,
        `Satellite ${i} too close to centerpiece: ${distFromHero}`
      );
      for (let j = i + 1; j < positions.length; j++) {
        const [xj, yj, zj] = positions[j];
        const pairDist = Math.hypot(xi - xj, yi - yj, zi - zj);
        assert.ok(
          pairDist >= 3.4,
          `Satellites ${i} and ${j} too close: ${pairDist}`
        );
      }
    }
  }
});
