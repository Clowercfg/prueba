import { useEconomyStore } from "../stores/economyStore";
import { useCropStore, type CropInventory, type PlantedCrop } from "../stores/cropStore";
import { useFarmStore, animalRegistry } from "../stores/farmStore";
import { useUpgradesStore } from "../stores/upgradesStore";
import { useGoodsStore } from "../stores/goodsStore";
import { useProcessingStore, type ProcessingJob } from "../stores/processingStore";
import { createAnimalAgent, ensureAnimalIdFloor } from "../utils/animalSpawn";
import type { AnimalAgent, AnimalKind } from "../types/entities";

/**
 * ÚNICA capa de persistencia local del juego (#fase persistencia).
 *
 *   game stores ⇄ persistence.ts ⇄ localStorage
 *
 * - Clave única `harvest-valley-save`, payload versionado { version, savedAt, state }.
 * - Hidratación síncrona y ligera al montar el canvas, ANTES del primer frame
 *   (no espera assets ni red).
 * - Escritura controlada: suscripción con debounce a los stores persistentes
 *   (acciones importantes), barrido periódico corto de respaldo y guardado
 *   inmediato en visibilitychange/pagehide (background de Telegram).
 * - El GameLoop y los sistemas NO conocen localStorage: esta capa solo
 *   conserva su estado; las reglas siguen intactas.
 * - Save corrupto ⇒ se descarta y arranca estado inicial limpio (warning).
 * - LOCAL/DEMO: sin garantías antifraude. Cuando exista backend, el servidor
 *   será la fuente de verdad y esta capa se sustituye por el transport.
 */

const SAVE_KEY = "harvest-valley-save";

/** Claves legacy del proyecto anterior que se pliegan al save unificado. */
const LEGACY_KEYS = [
  "granja-inmersiva-goods-v1",
  "granja-inmersiva-upgrades-v1",
  "granja-inmersiva-processing-v1",
] as const;

const VERSION = 2;

const ANIMAL_KINDS: readonly AnimalKind[] = ["cow", "chicken", "rooster", "pig"];

/** Subconjunto PERSISTENTE de AnimalAgent (lo demás es temporal de IA/render). */
interface SavedAnimal {
  id: number;
  kind: AnimalKind;
  name: string;
  position: [number, number, number];
  scale: number;
  pendingProduction: number;
  nextHarvestAt: number;
}

export interface SaveState {
  economy: {
    gold: number;
    diamonds: number;
    totalIncome: number;
    totalExpenses: number;
    lastIncomeAt: number;
  };
  crops: {
    inventory: Record<string, CropInventory>;
    planted: PlantedCrop[];
    nextId: number;
  };
  animals: SavedAnimal[];
  upgrades: {
    levels: Record<string, number>;
    specials: Record<string, boolean>;
  };
  goods: { inventory: Record<string, number> };
  processing: { jobs: ProcessingJob[] };
}

interface SavePayload {
  version: number;
  savedAt: number;
  state: SaveState;
}

/* ------------------------------------------------------------------ */
/* Validación                                                          */
/* ------------------------------------------------------------------ */

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Valida estructura y tipos del payload. Devuelve null si el save no sirve
 * (versión desconocida, campos ausentes o basura) ⇒ estado inicial limpio.
 *
 * Migración v1→v2: los saves antiguos conservan todo su progreso PERO su
 * saldo se pone a 0 una sola vez (decisión de balance: nadie nace con dinero;
 * al guardar de nuevo el payload queda en v2 y no se vuelve a tocar).
 */
function validatePayload(raw: string): SaveState | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || !isRecord(data.state)) return null;
  const v = data.version;
  if (v !== 1 && v !== VERSION) return null;
  const s = data.state as Record<string, unknown>;
  try {
    const state = buildValidatedState(s);
    if (v === 1) {
      state.economy.gold = 0;
      state.economy.diamonds = 0;
    }
    return state;
  } catch {
    return null;
  }
}

/** Lanza Error ante cualquier campo inválido; validatePayload lo convierte en null. */
function buildValidatedState(s: Record<string, unknown>): SaveState {
  // --- economía
  if (!isRecord(s.economy)) throw new Error("economy");
  const e = s.economy as Record<string, unknown>;
  for (const k of ["gold", "diamonds", "totalIncome", "totalExpenses", "lastIncomeAt"]) {
    if (!isFiniteNum(e[k]) || (e[k] as number) < 0) throw new Error(`economy.${k}`);
  }

  // --- cultivos
  if (!isRecord(s.crops)) throw new Error("crops");
  const c = s.crops as Record<string, unknown>;
  if (!isRecord(c.inventory)) throw new Error("crops.inventory");
  const inventory: Record<string, CropInventory> = {};
  for (const [k, v] of Object.entries(c.inventory)) {
    if (!isRecord(v) || !isInt(v.seeds) || v.seeds < 0 || !isInt(v.harvest) || v.harvest < 0) {
      throw new Error("crops.inventory.item");
    }
    inventory[k] = { seeds: v.seeds, harvest: v.harvest };
  }
  if (!Array.isArray(c.planted)) throw new Error("crops.planted");
  const planted: PlantedCrop[] = [];
  for (const p of c.planted) {
    if (
      !isRecord(p) ||
      !isInt(p.id) ||
      p.id <= 0 ||
      !isStr(p.cropId) ||
      !isInt(p.plotIndex) ||
      p.plotIndex < 0 ||
      p.plotIndex > 3 ||
      !isFiniteNum(p.plantedAt) ||
      p.plantedAt <= 0 ||
      (p.state !== "growing" && p.state !== "ready") ||
      !isInt(p.quantity) ||
      p.quantity <= 0
    ) {
      throw new Error("crops.planted.item");
    }
    planted.push(p as unknown as PlantedCrop);
  }
  if (!isInt(c.nextId) || c.nextId <= 0) throw new Error("crops.nextId");

  // --- animales (ids únicos; bounds se derivan de kind, nunca se guardan)
  if (!Array.isArray(s.animals)) throw new Error("animals");
  const seenIds = new Set<number>();
  const animals: SavedAnimal[] = [];
  for (const a of s.animals) {
    if (!isRecord(a)) throw new Error("animals.item");
    if (!isInt(a.id) || a.id <= 0 || seenIds.has(a.id)) throw new Error("animals.id");
    if (!ANIMAL_KINDS.includes(a.kind as AnimalKind)) throw new Error("animals.kind");
    if (!isStr(a.name)) throw new Error("animals.name");
    if (
      !Array.isArray(a.position) ||
      a.position.length !== 3 ||
      !a.position.every(isFiniteNum)
    ) {
      throw new Error("animals.position");
    }
    if (!isFiniteNum(a.scale) || a.scale <= 0) throw new Error("animals.scale");
    if (!isFiniteNum(a.pendingProduction) || a.pendingProduction < 0) {
      throw new Error("animals.pendingProduction");
    }
    if (!isFiniteNum(a.nextHarvestAt)) throw new Error("animals.nextHarvestAt");
    seenIds.add(a.id);
    animals.push({
      id: a.id,
      kind: a.kind as AnimalKind,
      name: a.name,
      position: [a.position[0], a.position[1], a.position[2]],
      scale: a.scale,
      pendingProduction: a.pendingProduction,
      nextHarvestAt: a.nextHarvestAt,
    });
  }

  // --- mejoras
  if (!isRecord(s.upgrades)) throw new Error("upgrades");
  const u = s.upgrades as Record<string, unknown>;
  if (!isRecord(u.levels) || !isRecord(u.specials)) throw new Error("upgrades.fields");
  for (const v of Object.values(u.levels)) if (!isInt(v) || v < 0) throw new Error("upgrades.levels");
  for (const v of Object.values(u.specials)) if (v !== true) throw new Error("upgrades.specials");

  // --- almacén
  if (!isRecord(s.goods)) throw new Error("goods");
  const g = s.goods as Record<string, unknown>;
  if (!isRecord(g.inventory)) throw new Error("goods.inventory");
  for (const v of Object.values(g.inventory)) {
    if (!isInt(v) || v < 0) throw new Error("goods.inventory.qty");
  }

  // --- procesamiento (timestamps, nunca timers)
  if (!isRecord(s.processing) || !Array.isArray((s.processing as Record<string, unknown>).jobs)) {
    throw new Error("processing");
  }
  const jobs: ProcessingJob[] = [];
  for (const j of (s.processing as Record<string, unknown>).jobs as unknown[]) {
    if (
      !isRecord(j) ||
      !isStr(j.id) ||
      !isStr(j.recipeId) ||
      !isStr(j.inputGoodId) ||
      !isStr(j.outputGoodId) ||
      !isInt(j.qty) ||
      j.qty <= 0 ||
      !isFiniteNum(j.costPerUnit) ||
      !isFiniteNum(j.totalCost) ||
      !isFiniteNum(j.startTime) ||
      !isFiniteNum(j.endTime) ||
      !isInt(j.level)
    ) {
      throw new Error("processing.job");
    }
    jobs.push(j as unknown as ProcessingJob);
  }

  return {
    economy: s.economy as unknown as SaveState["economy"],
    crops: { inventory, planted, nextId: c.nextId },
    animals,
    upgrades: u as unknown as SaveState["upgrades"],
    goods: { inventory: g.inventory as unknown as Record<string, number> },
    processing: { jobs },
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot / apply                                                    */
/* ------------------------------------------------------------------ */

function snapshot(): SaveState {
  const eco = useEconomyStore.getState();
  const crop = useCropStore.getState();
  const up = useUpgradesStore.getState();
  return {
    economy: {
      gold: eco.gold,
      diamonds: eco.diamonds,
      totalIncome: eco.totalIncome,
      totalExpenses: eco.totalExpenses,
      lastIncomeAt: eco.lastIncomeAt,
    },
    crops: { inventory: crop.inventory, planted: crop.planted, nextId: crop.nextId },
    animals: [...animalRegistry.values()].map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      position: [a.position[0], a.position[1], a.position[2]],
      scale: a.scale,
      pendingProduction: a.pendingProduction,
      nextHarvestAt: a.nextHarvestAt,
    })),
    upgrades: { levels: up.levels, specials: up.specials },
    goods: { inventory: useGoodsStore.getState().inventory },
    processing: { jobs: useProcessingStore.getState().jobs },
  };
}

function applyState(st: SaveState): void {
  useEconomyStore.setState({
    gold: st.economy.gold,
    diamonds: st.economy.diamonds,
    totalIncome: st.economy.totalIncome,
    totalExpenses: st.economy.totalExpenses,
    lastIncomeAt: st.economy.lastIncomeAt,
  });
  useCropStore.setState({
    inventory: st.crops.inventory,
    planted: st.crops.planted,
    nextId: Math.max(st.crops.nextId, ...st.crops.planted.map((p) => p.id + 1), 1),
  });

  const farm = useFarmStore.getState();
  farm.clearAnimals();
  if (st.animals.length > 0) {
    ensureAnimalIdFloor(Math.max(...st.animals.map((a) => a.id)));
    for (const saved of st.animals) {
      // Reconstrucción vía factory real: rellena velocity/phases/bounds (temporal),
      // preserva EXACTAMENTE los campos persistentes guardados. Sin campos nuevos.
      const agent: AnimalAgent = createAnimalAgent(saved.kind, saved.name, Math.random, {
        id: saved.id,
        position: [...saved.position],
        scale: saved.scale,
        pendingProduction: saved.pendingProduction,
        nextHarvestAt: saved.nextHarvestAt,
      });
      farm.registerAnimal(agent);
    }
  }

  useUpgradesStore.setState({ levels: st.upgrades.levels, specials: st.upgrades.specials });
  useGoodsStore.setState({ inventory: st.goods.inventory });
  useProcessingStore.setState({ jobs: st.processing.jobs });
}

/* ------------------------------------------------------------------ */
/* Escritura                                                           */
/* ------------------------------------------------------------------ */

let writeQueued = false;

function writeNow(): void {
  writeQueued = false;
  try {
    const payload: SavePayload = { version: VERSION, savedAt: Date.now(), state: snapshot() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[save] escritura falló (cuota/deshabilitado)", err);
  }
}

/** Debounce: ráfagas de acciones colapsan en UNA escritura (~800 ms después). */
function queueSave(): void {
  if (writeQueued) return;
  writeQueued = true;
  setTimeout(writeNow, 800);
}

/** Guardado inmediato (visibilitychange, pagehide, tests). */
export function saveNow(): void {
  writeNow();
}

/* ------------------------------------------------------------------ */
/* Migración de claves legacy                                          */
/* ------------------------------------------------------------------ */

/**
 * Si no existe el save unificado pero sí claves legacy del proyecto anterior,
 * importa lo legible, escribe el save nuevo y limpia las viejas.
 */
function migrateLegacyKeys(): void {
  if (localStorage.getItem(SAVE_KEY)) return;
  let imported = false;
  try {
    const goodsRaw = localStorage.getItem("granja-inmersiva-goods-v1");
    if (goodsRaw) {
      const inv = JSON.parse(goodsRaw);
      if (isRecord(inv)) {
        const clean: Record<string, number> = {};
        for (const [k, v] of Object.entries(inv)) if (isInt(v) && v >= 0) clean[k] = v;
        useGoodsStore.setState({ inventory: clean });
        imported = true;
      }
    }
    const upRaw = localStorage.getItem("granja-inmersiva-upgrades-v1");
    if (upRaw) {
      const parsed = JSON.parse(upRaw) as { levels?: unknown; specials?: unknown };
      if (isRecord(parsed?.levels) && isRecord(parsed?.specials)) {
        useUpgradesStore.setState({
          levels: parsed.levels as unknown as Record<string, number>,
          specials: parsed.specials as unknown as Record<string, boolean>,
        });
        imported = true;
      }
    }
    const procRaw = localStorage.getItem("granja-inmersiva-processing-v1");
    if (procRaw) {
      const jobs = JSON.parse(procRaw);
      if (Array.isArray(jobs)) {
        useProcessingStore.setState({ jobs: jobs as ProcessingJob[] });
        imported = true;
      }
    }
  } catch {
    /* legacy ilegible: se ignora sin romper nada */
  }
  if (imported) {
    writeNow();
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    console.info("[save] migradas claves legacy al save unificado");
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Lectura + validación + hidratación de stores. Síncrono y pequeño:
 * se llama una vez antes de arrancar loop/sistemas. Sin save válido ⇒
 * los stores quedan en su estado inicial normal (#primera ejecución).
 */
export function hydratePersistence(): void {
  migrateLegacyKeys();
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw === null) return;
  const state = validatePayload(raw);
  if (!state) {
    console.warn("[save] save corrupto/inválido descartado; estado inicial limpio");
    localStorage.removeItem(SAVE_KEY);
    return;
  }
  applyState(state);
}

/**
 * Conecta las escrituras: debounce por cambios de stores persistentes +
 * respaldo periódico + visibilitychange/pagehide. Devuelve cleanup.
 */
export function startPersistence(): () => void {
  const unsubs = [
    useEconomyStore.subscribe(queueSave),
    useCropStore.subscribe(queueSave),
    useUpgradesStore.subscribe(queueSave),
    useGoodsStore.subscribe(queueSave),
    useProcessingStore.subscribe(queueSave),
    // farmStore cambia solo al comprar/vender animales (las IA mutan agentes
    // directamente, sin eventos) ⇒ sin ruido por frame.
    useFarmStore.subscribe(queueSave),
  ];

  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") saveNow();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", saveNow);

  // Respaldo periódico corto: cubre mutaciones directas de agentes
  // (pendingProduction) mientras la app sigue visible.
  const iv = setInterval(queueSave, 15_000);

  return () => {
    clearInterval(iv);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", saveNow);
    for (const u of unsubs) u();
    saveNow(); // flush final en unmount
  };
}
