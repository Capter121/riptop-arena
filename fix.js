
const fs = require('fs');

// 1. Fix top.ts
let topTs = fs.readFileSync('src/gameplay/top.ts', 'utf8');
topTs = topTs.replace(/const ringInst = globalInventory.getItems\(\).find\(i => i.instanceId === build.LAYER\);/, 'const ringInst = globalInventory.getItems().find(i => i.instanceId === build.attackRing);');
topTs = topTs.replace(/const coreInst = globalInventory.getItems\(\).find\(i => i.instanceId === build.CHIP\);/, 'const coreInst = globalInventory.getItems().find(i => i.instanceId === build.core);');
topTs = topTs.replace(/const driverInst = globalInventory.getItems\(\).find\(i => i.instanceId === build.DRIVER\);/, 'const driverInst = globalInventory.getItems().find(i => i.instanceId === build.driver);');
topTs = topTs.replace(/const discInst = globalInventory.getItems\(\).find\(i => i.instanceId === build.DISC\);\n/, '');
topTs = topTs.replace(/const launcherInst = globalInventory.getItems\(\).find\(i => i.instanceId === build.LAUNCHER\);\n/, '');
topTs = topTs.replace(/const ringPart = ringBase\?.visualId \? getPartById\(ringBase.visualId\) : getPartById\('round'\);/, 'const ringPart = ringBase?.visualId ? getPartById(ringBase.visualId) : getPartById(build.attackRing || \'round\');');
topTs = topTs.replace(/const corePart = coreBase\?.visualId \? getPartById\(coreBase.visualId\) : getPartById\('balanced'\);/, 'const corePart = coreBase?.visualId ? getPartById(coreBase.visualId) : getPartById(build.core || \'balanced\');');
topTs = topTs.replace(/const driverPart = driverBase\?.visualId \? getPartById\(driverBase.visualId\) : getPartById\('grip'\);/, 'const driverPart = driverBase?.visualId ? getPartById(driverBase.visualId) : getPartById(build.driver || \'grip\');');
topTs = topTs.replace(/this.hasRubberTip = TopEntity.isRubberTipDriver\(driverPart.id\);/, 'this.hasRubberTip = TopEntity.isRubberTipDriver(driverPart!.id);');
fs.writeFileSync('src/gameplay/top.ts', topTs);

// 2. Fix garage.ts
let garageTs = fs.readFileSync('src/ui/garage.ts', 'utf8');
garageTs = garageTs.replace(/const currentVal = select.value \|\| currentBuild\[slot\];/, 
\let currentVal = select.value;
      if (!currentVal) {
        if (slot === 'CHIP') currentVal = currentBuild.core;
        if (slot === 'LAYER') currentVal = currentBuild.attackRing;
        if (slot === 'DRIVER') currentVal = currentBuild.driver;
      }\);
garageTs = garageTs.replace(/if \\(item.equippedOnTopId && currentBuild\\[slot\\] !== item.instanceId\\) continue;/, 
\let equipId = '';
        if (slot === 'CHIP') equipId = currentBuild.core;
        if (slot === 'LAYER') equipId = currentBuild.attackRing;
        if (slot === 'DRIVER') equipId = currentBuild.driver;
        if (item.equippedOnTopId && equipId !== item.instanceId) continue;\);
garageTs = garageTs.replace(/readBuild\\(\\): BuildSelection \\{\\r?\\n    return \\{\\r?\\n      CHIP: this.selects.get\\('CHIP'\\)!\\.value \\|\\| null,\\r?\\n      LAYER: this.selects.get\\('LAYER'\\)!\\.value \\|\\| null,\\r?\\n      DISC: this.selects.get\\('DISC'\\)!\\.value \\|\\| null,\\r?\\n      DRIVER: this.selects.get\\('DRIVER'\\)!\\.value \\|\\| null,\\r?\\n      LAUNCHER: this.selects.get\\('LAUNCHER'\\)!\\.value \\|\\| null,\\r?\\n    \\};\\r?\\n  \\}/, 
\eadBuild(): BuildSelection {
    return {
      core: this.selects.get('CHIP')!.value || 'balanced',
      attackRing: this.selects.get('LAYER')!.value || 'round',
      driver: this.selects.get('DRIVER')!.value || 'grip',
    };
  }\);
fs.writeFileSync('src/ui/garage.ts', garageTs);

// 3. Fix forgePanel.ts unused imports
let forgeTs = fs.readFileSync('src/ui/forgePanel.ts', 'utf8');
forgeTs = forgeTs.replace(/import \\{ type InstanceComponent, ELEMENT_COLORS \\} from '\\.\\.\\/types\\/shopItems';\\r?\\n/, '');
fs.writeFileSync('src/ui/forgePanel.ts', forgeTs);

// 4. Fix launch.ts BuildSelection TS errors (e.g. build.LAUNCHER doesn't exist)
let launchTs = fs.readFileSync('src/gameplay/launch.ts', 'utf8');
launchTs = launchTs.replace(/const launcherInst = globalInventory.getItems\\(\\).find\\(i => i.instanceId === playerBuild.LAUNCHER\\);/, 'const launcherInst = globalInventory.getItems().find(i => i.category === \\'LAUNCHER\\');');
fs.writeFileSync('src/gameplay/launch.ts', launchTs);

// 5. Parts TS unused
let partsTs = fs.readFileSync('src/data/parts.ts', 'utf8');
partsTs = partsTs.replace(/const TIERS = \\['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'DIVINE'\\];\\r?\\n/, '');
fs.writeFileSync('src/data/parts.ts', partsTs);

