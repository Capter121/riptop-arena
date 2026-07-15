export interface SceneDiagnostics {
  cameraPosition: number[];
  cameraDistance: number;
  permanentMatrices: Record<string, number[]>;
}

const diagnostics: SceneDiagnostics = {
  cameraPosition: [],
  cameraDistance: 0,
  permanentMatrices: {},
};

export function updateCamera(position: number[], distance: number) {
  diagnostics.cameraPosition = position;
  diagnostics.cameraDistance = distance;
}

export function updatePermanentMatrices(matrices: Record<string, number[]>) {
  diagnostics.permanentMatrices = matrices;
}

export function sceneDiagnostics(): SceneDiagnostics {
  return JSON.parse(JSON.stringify(diagnostics));
}
