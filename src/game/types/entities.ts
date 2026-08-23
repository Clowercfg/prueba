export type EntityKind = "animal" | "building" | "tree";

export type AnimalKind = "cow" | "chicken" | "rooster" | "pig";

export type AnimalState = "rest" | "wander" | "eating" | "sleep";

export interface AnimalBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface AnimalAgent {
  id: number;
  kind: AnimalKind;
  name: string;
  position: [number, number, number];
  rotation: number;
  velocity: [number, number, number];
  state: AnimalState;
  target: [number, number, number];
  /** Zona permitida de movimiento (corral asignado). */
  bounds: AnimalBounds;
  actionTimer: number;
  mood: number;
  health: number;
  scale: number;
  walkPhase: number;
  idlePhase: number;
  speed: number;
  pendingProduction: number;
  nextHarvestAt: number;
}

export interface SelectedEntity {
  kind: EntityKind;
  uid: string;
  title: string;
  subtitle: string;
}
