// One-time, reproducible import of naming data only; no BCS ratings or rules.
// Usage: node scripts/import-oob-names.mjs E:/work/bcsEngine
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Provide the bcsEngine repository path.');
const profiles = [];
for (const file of ['oobFormations.ts', 'supplementalOobFormations.ts']) {
  const source = ts.createSourceFile(file, readFileSync(resolve(root, 'scenarioTemplates', file), 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ['formation', 'f'].includes(node.expression.getText(source))
      && ts.isStringLiteral(node.arguments[0])) {
      const [nameNode, , doctrineNode, echelonNode, , tokenNode, unitsNode] = node.arguments;
      const name = nameNode.text;
      const side = name.startsWith('US ') ? 'ALLIED'
        : tokenNode.text.startsWith('Ger ') ? 'AXIS' : null;
      const eligible = echelonNode.text === 'DIVISION'
        || ['US 517th Parachute Regimental Combat Team', 'Führer-Begleit-Brigade', 'Führer-Grenadier-Brigade'].includes(name);
      if (side && eligible && !/Lorraine|Fallschirmjäger/.test(name)) {
        const units = ts.isStringLiteral(unitsNode)
          ? unitsNode.text.split(';').map((unit) => { const [name, , kind] = unit.split(':'); return { name, kind }; })
          : unitsNode.elements.map((unit) => ({ name: unit.elements[0].text, kind: unit.elements[2]?.text }));
        const archetype = doctrineNode.text === 'LINE' ? 'INFANTRY'
          : /Panzergrenadier|Führer-|Airborne|Parachute/.test(name) ? (side === 'ALLIED' ? 'AIRBORNE' : 'MOBILE_INFANTRY') : 'ARMORED';
        const recon = units.filter((unit) => unit.kind === 'RECON' || /Recon|Rcn|Aufk|Fus Coy/.test(unit.name)).map((unit) => unit.name);
        const engineers = units.filter((unit) => /Eng|Pio/.test(unit.name)).map((unit) => unit.name);
        const combat = units.filter((unit) => !recon.includes(unit.name) && !engineers.includes(unit.name)
          && !/\b(?:AT|TD|PJ|JgPz|StG|Flak)\b/.test(unit.name)
          && (archetype !== 'ARMORED' || unit.kind === 'ARMOR' || /Pz\b|\b(?:Arm|Tk)\b|TF$/.test(unit.name)))
          .map((unit) => unit.name);
        // Reduced source packages without armor cannot name an OCS armor package.
        if (combat.length > 0) profiles.push({ name, side, archetype, combat, recon, engineers, source: `bcsEngine/scenarioTemplates/${file}` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
// TODO: the German Fallschirmjäger and US 13th Airborne profiles in name-catalog.ts are hand-authored; re-add them after re-importing.
writeFileSync('src/generation/oob/name-catalog.ts', `// Naming references imported from bcsEngine; synthetic OCS packages, not historical OOBs.\n`
  + `import type { OobFormationArchetype, OobSide } from './model.js';\n\n`
  + `export interface FormationNameProfile {\n  readonly name: string;\n  readonly side: OobSide;\n  readonly archetype: OobFormationArchetype;\n  readonly combat: readonly string[];\n  readonly recon: readonly string[];\n  readonly engineers: readonly string[];\n  readonly source: string;\n}\n\n`
  + `export const FORMATION_NAME_PROFILES: readonly FormationNameProfile[] = ${JSON.stringify(profiles, null, 2)};\n`);
console.log(JSON.stringify(profiles.reduce((counts, profile) => { const key = `${profile.side}/${profile.archetype}`; counts[key] = (counts[key] ?? 0) + 1; return counts; }, {})));
