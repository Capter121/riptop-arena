import type { Group, Object3D } from 'three';

export function replacePresentationAttachment(container: Group, current: Object3D | null, next: Object3D) {
  if (current === next) return next;
  if (current) container.remove(current);
  container.add(next);
  return next;
}
