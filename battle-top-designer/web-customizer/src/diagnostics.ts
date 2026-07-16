export interface SceneDiagnostics {
  cameraPosition: number[];
  cameraDistance: number;
  permanentMatrices: Record<string, number[]>;
  webglResources: { geometries: number; textures: number; programs: number };
}

const diagnostics: SceneDiagnostics = {
  cameraPosition: [],
  cameraDistance: 0,
  permanentMatrices: {},
  webglResources: { geometries: 0, textures: 0, programs: 0 },
};

export interface SceneCapture {
  width: number;
  height: number;
  pixels: Uint8Array;
}

let captureSceneHandler: ((width: number, height: number) => Promise<SceneCapture>) | null = null;

export function updateCamera(position: number[], distance: number) {
  diagnostics.cameraPosition = position;
  diagnostics.cameraDistance = distance;
}

export function updatePermanentMatrices(matrices: Record<string, number[]>) {
  diagnostics.permanentMatrices = matrices;
}

export function updateWebglResources(geometries: number, textures: number, programs: number) {
  diagnostics.webglResources = { geometries, textures, programs };
}

export function sceneDiagnostics(): SceneDiagnostics {
  return JSON.parse(JSON.stringify(diagnostics));
}

export function registerSceneCapture(handler: typeof captureSceneHandler) {
  captureSceneHandler = handler;
}

export async function captureScene(width: number, height: number): Promise<SceneCapture> {
  if (!captureSceneHandler) throw new Error('3D scene is not ready for export.');
  return captureSceneHandler(width, height);
}
