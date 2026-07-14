import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validatorPath = path.join(root, "build", "tools", "gltf-validator", "node_modules", "gltf-validator", "module.mjs");
const validator = await import(pathToFileURL(validatorPath).href);

const inputIndex = process.argv.indexOf("--input");
const outputIndex = process.argv.indexOf("--output");
if (inputIndex < 0 || outputIndex < 0 || !process.argv[inputIndex + 1] || !process.argv[outputIndex + 1]) {
  console.error("Usage: node scripts/validate_gltf.mjs --input <model.glb> --output <report.json>");
  process.exit(2);
}

const inputPath = path.resolve(process.argv[inputIndex + 1]);
const outputPath = path.resolve(process.argv[outputIndex + 1]);
const bytes = await fs.readFile(inputPath);
const report = await validator.validateBytes(new Uint8Array(bytes), { uri: path.basename(inputPath) });
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`GLTF_VALIDATOR_VERSION=${validator.version()}`);
console.log(`GLTF_VALIDATOR_ERRORS=${report.issues.numErrors}`);
console.log(`GLTF_VALIDATOR_WARNINGS=${report.issues.numWarnings}`);
console.log(`GLTF_VALIDATOR_REPORT=${outputPath}`);
process.exit(report.issues.numErrors === 0 ? 0 : 1);
