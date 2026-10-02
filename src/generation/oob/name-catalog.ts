// Naming references imported from bcsEngine; synthetic OCS packages, not historical OOBs.
import type { OobFormationArchetype, OobSide } from './model.js';

export interface FormationNameProfile {
  readonly name: string;
  readonly side: OobSide;
  readonly archetype: OobFormationArchetype;
  readonly combat: readonly string[];
  readonly recon: readonly string[];
  readonly engineers: readonly string[];
  readonly source: string;
}

export const FORMATION_NAME_PROFILES: readonly FormationNameProfile[] = [
  {
    "name": "12. SS Panzer-Division \"Hitlerjugend\"",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "1+3/1/12 Pz Bn (-)",
      "5+6/I/12 Pz Bn (-)"
    ],
    "recon": [
      "KG Bremer"
    ],
    "engineers": [
      "12 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "Panzer Lehr Division",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "II/130 Pz Bn"
    ],
    "recon": [
      "vFallois KG"
    ],
    "engineers": [
      "130 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "352. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/914 Inf Bn",
      "II/914 Inf Bn",
      "I/915 Inf Bn",
      "352 Erz Bn",
      "II/915 Inf Bn",
      "I/916 Inf Bn",
      "II/916 Inf Bn"
    ],
    "recon": [
      "352 Fus Coy"
    ],
    "engineers": [
      "352 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "11. Panzer-Division",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "I/15 Pz Bn",
      "II/15 Pz Bn"
    ],
    "recon": [
      "11 Aufk Bn"
    ],
    "engineers": [
      "209 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "116. Panzer-Division \"Windhund\"",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "I/16 Pz Bn",
      "II/16 Pz Bn"
    ],
    "recon": [
      "Stephan KG"
    ],
    "engineers": [
      "675 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "2. Panzer-Division",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "I/3 Pz Bn",
      "II/3 Pz Bn"
    ],
    "recon": [
      "vBohm Recon KG"
    ],
    "engineers": [
      "38 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "15. Panzergrenadier-Division",
    "side": "AXIS",
    "archetype": "MOBILE_INFANTRY",
    "combat": [
      "I/104 Mot Inf Bn",
      "115 Pz Bn",
      "II/104 Mot Inf Bn",
      "III/104 Mot Inf Bn",
      "I/115 Mot Inf Bn",
      "II/115 Mot Inf Bn",
      "III/115 Mot Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "33 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 1st Infantry Division \"Big Red One\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "1/16 Inf Bn",
      "745 Tk Bn",
      "2/16 Inf Bn",
      "3/16 Inf Bn",
      "1/18 Inf Bn",
      "2/18 Inf Bn",
      "3/18 Inf Bn",
      "1/26 Inf Bn",
      "2/26 Inf Bn",
      "3/26 Inf Bn"
    ],
    "recon": [
      "Davission TF"
    ],
    "engineers": [
      "1 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 2nd Armored Division \"Hell on Wheels\"",
    "side": "ALLIED",
    "archetype": "ARMORED",
    "combat": [
      "1/66 Arm Bn",
      "2/66 Arm Bn",
      "3/66 Arm Bn",
      "1/67 Arm Bn",
      "2/67 Arm Bn",
      "3/67 Arm Bn"
    ],
    "recon": [
      "82 Recon Bn"
    ],
    "engineers": [
      "17 Arm Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 82nd Airborne Division \"All American\"",
    "side": "ALLIED",
    "archetype": "AIRBORNE",
    "combat": [
      "1/504 Abn Bn",
      "2/504 Abn Bn",
      "3/504 Abn Bn",
      "1/505 Abn Bn",
      "2/505 Abn Bn",
      "3/505 Abn Bn",
      "1/508 Abn Bn",
      "2/508 Abn Bn",
      "3/508 Abn Bn",
      "1/325 Gld Bn",
      "2/325 Gld Bn",
      "2/401 Gld Bn"
    ],
    "recon": [],
    "engineers": [
      "307 Abn Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 4th Infantry Division \"Ivy\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "1/12 Inf Bn",
      "70 Tk Bn",
      "2/12 Inf Bn",
      "3/12 Inf Bn",
      "2/22 Inf Bn",
      "3/22 Inf Bn"
    ],
    "recon": [
      "Luckett TF"
    ],
    "engineers": [
      "4 Eng Bn",
      "159 Eng"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 3rd Armored Division \"Spearhead\"",
    "side": "ALLIED",
    "archetype": "ARMORED",
    "combat": [
      "Doan TF",
      "Rich TF",
      "Orr TF",
      "Kane TF",
      "Hogan TF"
    ],
    "recon": [
      "83 Recon Bn"
    ],
    "engineers": [
      "23 Arm Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 101st Airborne Division \"Screaming Eagles\"",
    "side": "ALLIED",
    "archetype": "AIRBORNE",
    "combat": [
      "1/501 Abn Bn",
      "2/501 Abn Bn",
      "3/501 Abn Bn",
      "1/502 Abn Bn",
      "2/502 Abn Bn",
      "3/502 Abn Bn",
      "1/506 Abn Bn",
      "2/506 Abn Bn",
      "3/506 Abn Bn",
      "1/327 Gld Bn",
      "2/327 Gld Bn",
      "1/401 Gld Bn"
    ],
    "recon": [],
    "engineers": [
      "326 Abn Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 30th Infantry Division \"Old Hickory\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "1/117 Inf Bn",
      "743 Tk Bn",
      "2/117 Inf Bn",
      "3/117 Inf Bn",
      "1/119 Inf Bn",
      "2/119 Inf Bn",
      "3/119 Inf Bn",
      "1/120 Inf Bn",
      "2/120 Inf Bn",
      "3/120 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "105 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "US 99th Infantry Division \"Checkerboard\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "1/393 Inf Bn",
      "2/393 Inf Bn",
      "3/393 Inf Bn",
      "1/394 Inf Bn",
      "2/394 Inf Bn",
      "3/394 Inf Bn",
      "1/395 Inf Bn",
      "2/395 Inf Bn",
      "3/395 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "324 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/oobFormations.ts"
  },
  {
    "name": "9. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/36 Bcy Bn",
      "II/36 Inf Bn",
      "I/57 Inf Bn",
      "II/57 Inf Bn",
      "I/116 Inf Bn",
      "II/116 Inf Bn"
    ],
    "recon": [
      "9 Fus Coy"
    ],
    "engineers": [
      "9 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "12. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "Holz Asult KG",
      "I/27 Inf Bn",
      "II/27 Inf Bn",
      "I/48 Inf Bn",
      "II/48 Inf Bn",
      "I/89 Inf Bn",
      "II/89 Inf Bn"
    ],
    "recon": [
      "12Fus Byc Bn"
    ],
    "engineers": [
      "12 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "18. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "669 Ost Bn",
      "Renn Asult KG",
      "I/293 Inf Bn",
      "II/293 Inf Bn",
      "I/294 Inf Bn",
      "II/294 Inf Bn",
      "I/295 Inf Bn",
      "II/295 Inf Bn",
      "18 Erz Bn"
    ],
    "recon": [],
    "engineers": [
      "1818 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "26. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "Kunkel Asult KG",
      "I/39 Inf Bn",
      "II/39 Inf Bn",
      "I/77 Inf Bn",
      "II/77 Inf Bn",
      "I/78 Inf Bn",
      "II/78 Inf Bn",
      "26 Erz Bn"
    ],
    "recon": [],
    "engineers": [
      "26 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "62. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/164 Inf Bn",
      "II/164 Inf Bn",
      "I/183 Inf Bn",
      "II/183 Inf Bn",
      "I/190 Inf Bn",
      "II/190 Inf Bn",
      "162 Erz Bn"
    ],
    "recon": [
      "162 Fus Coy"
    ],
    "engineers": [
      "162 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "79. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/208 Inf Bn",
      "II/208 Inf Bn",
      "I/212 Inf Bn",
      "II/212 Inf Bn",
      "I/226 Inf Bn",
      "II/226 Inf Bn"
    ],
    "recon": [
      "179 Fus Coy"
    ],
    "engineers": [
      "179 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "89. Infanterie-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "189 Bn",
      "I/1055 Inf Bn",
      "II/1055 Inf Bn",
      "III/1055 Inf Bn",
      "I/1056 Inf Bn",
      "II/1056 Inf Bn",
      "III/1056 Inf Bn"
    ],
    "recon": [
      "189 Fus Bn"
    ],
    "engineers": [
      "189 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "167. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/331 Inf Bn",
      "II/331 Inf Bn",
      "I/339 Inf Bn",
      "II/339 Inf Bn",
      "I/387 Inf Bn",
      "II/387 Inf Bn"
    ],
    "recon": [
      "167 Fus Coy"
    ],
    "engineers": [
      "167 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "212. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "44 Fest MG Bn",
      "XXIII Penal Bn",
      "I/316 Inf Bn",
      "II/316 Inf Bn",
      "I/320 Inf Bn",
      "II/320 Inf Bn",
      "I/423 Inf Bn",
      "II/423 Inf Bn"
    ],
    "recon": [
      "212 Fus Bn"
    ],
    "engineers": [
      "212 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "246. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/352 Inf Bn",
      "II/352 Inf Bn",
      "I/404 Inf Bn",
      "II/404 Inf Bn",
      "I/689 Inf Bn",
      "II/689 Inf Bn"
    ],
    "recon": [
      "246 Fus Bcy Bn"
    ],
    "engineers": [
      "246 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "276. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/986 Inf Bn",
      "II/986 Inf Bn",
      "I/987 Inf Bn",
      "II/987 Inf Bn",
      "I/988 Inf Bn",
      "II/988 Inf Bn"
    ],
    "recon": [
      "276 Fus Coy"
    ],
    "engineers": [
      "276 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "277. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/989 Inf Bn",
      "II/989 Inf Bn",
      "I/990 Inf Bn",
      "II/990 Inf Bn",
      "I/991 Inf Bn",
      "II/991 Inf Bn"
    ],
    "recon": [
      "277 Fus Coy"
    ],
    "engineers": [
      "277 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "326. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/751 Inf Bn",
      "II/751 Inf Bn",
      "I/753 Inf Bn",
      "II/753 Inf Bn",
      "326 Erz Bn"
    ],
    "recon": [],
    "engineers": [],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "340. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "340 Bn",
      "I/694 Inf Bn",
      "II/694 Inf Bn",
      "I/695 Inf Bn",
      "II/695 Inf Bn",
      "I/696 Inf Bn",
      "II/696 Inf Bn"
    ],
    "recon": [
      "340 Fus Bn"
    ],
    "engineers": [
      "340 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "560. Volksgrenadier-Division",
    "side": "AXIS",
    "archetype": "INFANTRY",
    "combat": [
      "I/1128 Inf Bn",
      "II/1128 Inf Bn",
      "I/1129 Inf Bn",
      "II/1129 Inf Bn",
      "I/1130 Inf Bn",
      "II/1130 Inf Bn"
    ],
    "recon": [
      "1560 Fus Coy"
    ],
    "engineers": [
      "1560 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "9. Panzer-Division",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "I/33 Pz Bn",
      "II/33 Pz Bn"
    ],
    "recon": [
      "9 Aufk Bn"
    ],
    "engineers": [
      "86 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "3. Panzergrenadier-Division",
    "side": "AXIS",
    "archetype": "MOBILE_INFANTRY",
    "combat": [
      "I/8 Mot Inf Bn",
      "II/8 Mot Inf Bn",
      "III/8 Mot Inf Bn",
      "I/29 Mot Inf Bn",
      "II/29 Mot Inf Bn",
      "III/29 Mot Inf Bn"
    ],
    "recon": [
      "103 Aufk Bn"
    ],
    "engineers": [
      "3 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "2. SS Panzer-Division \"Das Reich\"",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "I/2Pz Bn",
      "II/2 Pz Bn"
    ],
    "recon": [
      "KG Krag"
    ],
    "engineers": [
      "2 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "9. SS Panzer-Division \"Hohenstaufen\"",
    "side": "AXIS",
    "archetype": "ARMORED",
    "combat": [
      "I/9Pz Bn",
      "II/9 Pz Bn"
    ],
    "recon": [
      "KG Recke"
    ],
    "engineers": [
      "9 Pio Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "Führer-Begleit-Brigade",
    "side": "AXIS",
    "archetype": "MOBILE_INFANTRY",
    "combat": [
      "FB Pz Bn",
      "I/FB Mot Inf Bn",
      "II/FB PG Bn",
      "828 Bcy Bn"
    ],
    "recon": [],
    "engineers": [],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "Führer-Grenadier-Brigade",
    "side": "AXIS",
    "archetype": "MOBILE_INFANTRY",
    "combat": [
      "FG Pz Bn",
      "Fus PG Bn",
      "Gren Mot Inf Bn",
      "929 Bcy Bn"
    ],
    "recon": [],
    "engineers": [],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 2nd Infantry Division \"Indianhead\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "741 Tk Bn",
      "1/9 Inf Bn",
      "2/9 Inf Bn",
      "3/9 Inf Bn",
      "1/23 Inf Bn",
      "2/23 Inf Bn",
      "3/23 Inf Bn",
      "1/38 Inf Bn",
      "2/38 Inf Bn",
      "3/38 Inf Bn"
    ],
    "recon": [
      "2/99 TF"
    ],
    "engineers": [
      "2 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 5th Infantry Division \"Red Diamond\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "737 Tk Bn",
      "1/2 Inf Bn",
      "2/2 Inf Bn",
      "3/2 Inf Bn",
      "1/10 Inf Bn",
      "2/10 Inf Bn",
      "3/10 Inf Bn",
      "1/11 Inf Bn",
      "2/11 Inf Bn",
      "3/11 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "7 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 9th Infantry Division \"Old Reliables\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "746 Tk Bn",
      "1/39 Inf Bn",
      "2/39 Inf Bn",
      "3/39 Inf Bn",
      "1/47 Inf Bn",
      "2/47 Inf Bn",
      "3/47 Inf Bn",
      "1/60 Inf Bn",
      "2/60 Inf Bn",
      "3/60 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "15 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 26th Infantry Division \"Yankee\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "735 Tk Bn",
      "1/101 Inf Bn",
      "2/101 Inf Bn",
      "3/101 Inf Bn",
      "1/104 Inf Bn",
      "2/104 Inf Bn",
      "3/104 Inf Bn",
      "1/328 Inf Bn",
      "Hamilton",
      "3/328 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "101 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 35th Infantry Division \"Santa Fe\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "1/134 Inf Bn",
      "2/134 Inf Bn",
      "3/134 Inf Bn",
      "1/137 Inf Bn",
      "2/137 Inf Bn",
      "3/137 Inf Bn",
      "1/320 Inf Bn",
      "2/320 Inf Bn",
      "3/320 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "60 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 75th Infantry Division",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "750 Tk Bn",
      "1/289 Inf Bn",
      "2/289 Inf Bn",
      "3/289 Inf Bn",
      "1/290 Inf Bn",
      "2/290 Inf Bn",
      "3/290 Inf Bn",
      "1/291 Inf Bn",
      "2/291 Inf Bn",
      "3/291 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "275 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 80th Infantry Division \"Blue Ridge\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "702 Tk Bn",
      "1/317 Inf Bn",
      "2/317 Inf Bn",
      "3/317 Inf Bn",
      "1/318 Inf Bn",
      "2/318 Inf Bn",
      "3/318 Inf Bn",
      "1/319 Inf Bn",
      "2/319 Inf Bn",
      "3/319 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "305 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 83rd Infantry Division \"Thunderbolt\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "774 Tk Bn",
      "1/329 Inf Bn",
      "2/329 Inf Bn",
      "3/329Inf Bn",
      "1/330 Inf Bn",
      "2/330 Inf Bn",
      "3/330 Inf Bn",
      "1/331 Inf Bn",
      "2/331 Inf Bn",
      "3/331 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "308 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 84th Infantry Division \"Railsplitters\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "771 Tk Bn",
      "1/333 Inf Bn",
      "2/333 Inf Bn",
      "3/333 Inf Bn",
      "1/334 Inf Bn",
      "2/334 Inf Bn",
      "3/334 Inf Bn",
      "1/335 Inf Bn",
      "2/335 Inf Bn",
      "3/335 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "309 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 87th Infantry Division \"Golden Acorn\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "761 Tk Bn",
      "1/345 Inf Bn",
      "2/345 Inf Bn",
      "3/345 Inf Bn",
      "1/346 Inf Bn",
      "2/346 Inf Bn",
      "3/346 Inf Bn",
      "1/347 Inf Bn",
      "2/347 Inf Bn",
      "3/347 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "312 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 90th Infantry Division \"Tough Ombres\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "712 Arm Bn",
      "1/357 Inf Bn",
      "2/357 Inf Bn",
      "3/357 Inf Bn",
      "1/358 Inf Bn",
      "2/358 Inf Bn",
      "3/358 Inf Bn",
      "1/359 Inf Bn",
      "2/359 Inf Bn",
      "3/359 Inf Bn"
    ],
    "recon": [],
    "engineers": [
      "315 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 106th Infantry Division \"Golden Lions\"",
    "side": "ALLIED",
    "archetype": "INFANTRY",
    "combat": [
      "1/422 Inf Bn",
      "2/422 Inf Bn",
      "3/422 Inf Bn",
      "1/423 Inf Bn",
      "2/423 Inf Bn",
      "3/423 Inf Bn",
      "Prov/423",
      "1/424 Inf Bn",
      "2/424 Inf Bn",
      "3/424 Inf Bn",
      "Mixed Bn"
    ],
    "recon": [],
    "engineers": [
      "81 Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 4th Armored Division",
    "side": "ALLIED",
    "archetype": "ARMORED",
    "combat": [
      "Oden TF",
      "Alanis TF",
      "Irzyk TF",
      "Cohen TF",
      "Abrams TF",
      "Jaques TF"
    ],
    "recon": [
      "25 Recon Bn"
    ],
    "engineers": [
      "24 Arm Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 6th Armored Division \"Super Sixth\"",
    "side": "ALLIED",
    "archetype": "ARMORED",
    "combat": [
      "Kenndy TF",
      "Brown TF",
      "Davall TF",
      "Wall TF",
      "LaGrew TF",
      "Britton TF"
    ],
    "recon": [
      "86 Recon Bn"
    ],
    "engineers": [
      "25 Arm Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 7th Armored Division \"Lucky Seventh\"",
    "side": "ALLIED",
    "archetype": "ARMORED",
    "combat": [
      "Brown TF",
      "Chap TF",
      "Rhea TF",
      "Wemple TF",
      "Fuller TF"
    ],
    "recon": [
      "87 Recon Bn"
    ],
    "engineers": [
      "33 Arm Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 10th Armored Division \"Tiger\"",
    "side": "ALLIED",
    "archetype": "ARMORED",
    "combat": [
      "Chmbln TF",
      "Standish TF",
      "Riley TF"
    ],
    "recon": [
      "90 Recon Bn"
    ],
    "engineers": [
      "55 Arm Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 11th Armored Division \"Thunderbolt\"",
    "side": "ALLIED",
    "archetype": "ARMORED",
    "combat": [
      "22 Arm Bn",
      "White TF",
      "Blue TF",
      "Poker TF",
      "Pat TF"
    ],
    "recon": [
      "41 Recon Bn"
    ],
    "engineers": [
      "56 Arm Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 17th Airborne Division \"Golden Talons\"",
    "side": "ALLIED",
    "archetype": "AIRBORNE",
    "combat": [
      "1/507 Abn Bn",
      "2/507 Abn Bn",
      "3/507 Abn Bn",
      "1/513 Abn Bn",
      "2/513 Abn Bn",
      "3/513 Abn Bn",
      "1/193 Gld Bn",
      "2/193 Gld Bn",
      "1/194 Gld Bn",
      "2/194 Gld Bn",
      "550 Gld Bn"
    ],
    "recon": [],
    "engineers": [
      "139 Abn Eng Bn"
    ],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "US 517th Parachute Regimental Combat Team",
    "side": "ALLIED",
    "archetype": "AIRBORNE",
    "combat": [
      "1 Abn Bn",
      "2 Abn Bn",
      "3 Abn Bn"
    ],
    "recon": [],
    "engineers": [],
    "source": "bcsEngine/scenarioTemplates/supplementalOobFormations.ts"
  },
  {
    "name": "3. Fallschirmjäger-Division",
    "side": "AXIS",
    "archetype": "AIRBORNE",
    "combat": [
      "I/5 FJ Bn",
      "II/5 FJ Bn",
      "III/5 FJ Bn",
      "I/8 FJ Bn",
      "II/8 FJ Bn",
      "III/8 FJ Bn",
      "I/9 FJ Bn",
      "II/9 FJ Bn",
      "III/9 FJ Bn"
    ],
    "recon": [],
    "engineers": [
      "3 FJ Pio Bn"
    ],
    "source": "hand-authored (historical Fallschirmjäger divisions; not in the bcsEngine import)"
  },
  {
    "name": "5. Fallschirmjäger-Division",
    "side": "AXIS",
    "archetype": "AIRBORNE",
    "combat": [
      "I/13 FJ Bn",
      "II/13 FJ Bn",
      "III/13 FJ Bn",
      "I/14 FJ Bn",
      "II/14 FJ Bn",
      "III/14 FJ Bn",
      "I/15 FJ Bn",
      "II/15 FJ Bn",
      "III/15 FJ Bn"
    ],
    "recon": [],
    "engineers": [
      "5 FJ Pio Bn"
    ],
    "source": "hand-authored (historical Fallschirmjäger divisions; not in the bcsEngine import)"
  },
  {
    "name": "2. Fallschirmjäger-Division",
    "side": "AXIS",
    "archetype": "AIRBORNE",
    "combat": [
      "I/2 FJ Bn",
      "II/2 FJ Bn",
      "III/2 FJ Bn",
      "I/6 FJ Bn",
      "II/6 FJ Bn",
      "III/6 FJ Bn",
      "I/7 FJ Bn",
      "II/7 FJ Bn",
      "III/7 FJ Bn"
    ],
    "recon": [],
    "engineers": [
      "2 FJ Pio Bn"
    ],
    "source": "hand-authored (historical Fallschirmjäger divisions; not in the bcsEngine import)"
  },
  {
    "name": "6. Fallschirmjäger-Division",
    "side": "AXIS",
    "archetype": "AIRBORNE",
    "combat": [
      "I/16 FJ Bn",
      "II/16 FJ Bn",
      "III/16 FJ Bn",
      "I/17 FJ Bn",
      "II/17 FJ Bn",
      "III/17 FJ Bn",
      "I/18 FJ Bn",
      "II/18 FJ Bn",
      "III/18 FJ Bn"
    ],
    "recon": [],
    "engineers": [
      "6 FJ Pio Bn"
    ],
    "source": "hand-authored (historical Fallschirmjäger divisions; not in the bcsEngine import)"
  }
];
