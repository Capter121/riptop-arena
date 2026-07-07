import * as THREE from 'three';
import { ARENA_RADIUS, CAMERA_TUNING } from '../app/config';
import type { TopEntity } from '../gameplay/top';
import { clamp, lerp } from '../utils/math';
import type { Phase } from '../utils/state';

export type CameraDebugState = {
  mode: string;
  chaseWeight: number;
  dangerWeight: number;
  edgeDanger: number;
  separation: number;
  relativeSpeed: number;
  distance: number;
  height: number;
  angle: number;
  tuning: typeof CAMERA_TUNING;
};

export class CameraRig {
  private angle = Math.PI * 0.18;
  private distance = 14;
  private height = 7.2;
  private readonly target = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly chaseOffset = new THREE.Vector3();
  private readonly dangerOffset = new THREE.Vector3();
  private readonly camera: THREE.PerspectiveCamera;
  private shake = 0;
  private debugState: CameraDebugState = {
    mode: 'menu',
    chaseWeight: 0,
    dangerWeight: 0,
    edgeDanger: 0,
    separation: 0,
    relativeSpeed: 0,
    distance: this.distance,
    height: this.height,
    angle: this.angle,
    tuning: { ...CAMERA_TUNING },
  };

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.camera.position.set(0, this.height, this.distance);
  }

  reset() {
    this.angle = Math.PI * 0.18;
    this.distance = 14;
    this.height = 7.2;
    this.shake = 0;
  }

  kickShake(amount: number) {
    this.shake = Math.min(1.8, this.shake + amount);
  }

  getDebugState() {
    return {
      ...this.debugState,
      tuning: { ...CAMERA_TUNING },
    };
  }

  update(player: TopEntity, enemy: TopEntity, dt: number, phase: Phase) {
    const battle = phase === 'battle';
    const launch = phase === 'launch';

    const midpointX = (player.position.x + enemy.position.x) * 0.5;
    const midpointZ = (player.position.y + enemy.position.y) * 0.5;
    const separation = player.position.distanceTo(enemy.position);
    const relativeSpeed = player.velocity.clone().sub(enemy.velocity).length();
    const playerEdge = player.position.length() / ARENA_RADIUS;
    const enemyEdge = enemy.position.length() / ARENA_RADIUS;
    const edgeDanger = Math.max(playerEdge, enemyEdge);
    const dangerTop = playerEdge > enemyEdge ? player : enemy;
    const chaseWeight = battle
      ? clamp(
          (CAMERA_TUNING.chaseDistanceStart - separation) / CAMERA_TUNING.chaseDistanceRange +
            relativeSpeed * CAMERA_TUNING.chaseSpeedScale,
          0,
          1,
        )
      : 0;
    const dangerWeight = battle
      ? clamp((edgeDanger - CAMERA_TUNING.dangerStart) / CAMERA_TUNING.dangerRange, 0, 1)
      : 0;

    const focusX = lerp(
      midpointX,
      dangerTop.position.x * CAMERA_TUNING.dangerFocusBias + midpointX * (1 - CAMERA_TUNING.dangerFocusBias),
      dangerWeight,
    );
    const focusZ = lerp(
      midpointZ,
      dangerTop.position.y * CAMERA_TUNING.dangerFocusBias + midpointZ * (1 - CAMERA_TUNING.dangerFocusBias),
      dangerWeight,
    );
    const focusY = battle ? lerp(0.85, 1.05, dangerWeight) : launch ? 0.52 : 1.2;
    this.target.set(focusX, focusY, focusZ);

    this.angle += dt * (battle ? 0.14 : launch ? 0.06 : 0.03);

    const desiredDistance = launch
      ? 8.8
      : lerp(12.6, 9.2, chaseWeight) + dangerWeight * CAMERA_TUNING.dangerDistanceBoost + Math.max(0, separation - 2.4) * 0.6;
    const desiredHeight = launch ? 3.8 : lerp(6.6, 4.9, chaseWeight) + dangerWeight * CAMERA_TUNING.dangerHeightBoost;
    const orbitCompression = launch ? 0.66 : lerp(1, 0.84, chaseWeight) * lerp(1, CAMERA_TUNING.dangerCompressionBoost, dangerWeight);

    this.distance = lerp(this.distance, desiredDistance, dt * 2.5);
    this.height = lerp(this.height, desiredHeight, dt * 2.5);

    const orbitOffset = new THREE.Vector3(
      Math.cos(this.angle) * this.distance,
      this.height,
      Math.sin(this.angle) * this.distance * orbitCompression,
    );

    if (battle && chaseWeight > 0.15) {
      const chaseDirection = player.velocity.clone().sub(enemy.velocity);
      if (chaseDirection.lengthSq() > 0.001) {
        chaseDirection.normalize();
        this.chaseOffset.set(
          -chaseDirection.x * CAMERA_TUNING.chaseOffsetScale,
          -0.45,
          -chaseDirection.y * CAMERA_TUNING.chaseOffsetScale,
        );
      } else {
        this.chaseOffset.set(0, 0, 0);
      }
    } else {
      this.chaseOffset.set(0, 0, 0);
    }

    if (battle && dangerWeight > 0.2) {
      const radial = dangerTop.position.clone();
      if (radial.lengthSq() > 0.001) {
        radial.normalize();
        const lateral = new THREE.Vector2(-radial.y, radial.x);
        this.dangerOffset.set(
          lateral.x * dangerWeight * 2.25,
          dangerWeight * 0.42,
          lateral.y * dangerWeight * 2.25,
        );
      } else {
        this.dangerOffset.set(0, 0, 0);
      }
    } else {
      this.dangerOffset.set(0, 0, 0);
    }

    this.shake = Math.max(0, this.shake - dt * 2.8);
    const shakeOffset =
      this.shake > 0
        ? new THREE.Vector3(
            (Math.random() - 0.5) * this.shake * 0.42,
            (Math.random() - 0.5) * this.shake * 0.28,
            (Math.random() - 0.5) * this.shake * 0.42,
          )
        : new THREE.Vector3();

    this.camera.position.lerp(
      this.target.clone().add(orbitOffset).add(this.chaseOffset).add(this.dangerOffset).add(shakeOffset),
      dt * 2.7,
    );

    this.lookTarget.copy(this.target);
    if (battle && dangerWeight > 0.2) {
      this.lookTarget.x = lerp(this.lookTarget.x, midpointX, 0.3);
      this.lookTarget.z = lerp(this.lookTarget.z, midpointZ, 0.3);
      this.lookTarget.y += 0.3 + dangerWeight * 0.1;
    }
    this.camera.lookAt(this.lookTarget);

    this.debugState = {
      mode: launch
        ? 'launch'
        : dangerWeight > 0.35
          ? 'danger-frame'
          : chaseWeight > 0.35
            ? 'close-chase'
            : battle
              ? 'battle-wide'
              : 'menu',
      chaseWeight,
      dangerWeight,
      edgeDanger,
      separation,
      relativeSpeed,
      distance: this.distance,
      height: this.height,
      angle: this.angle,
      tuning: { ...CAMERA_TUNING },
    };
  }
}
