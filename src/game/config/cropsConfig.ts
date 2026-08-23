export interface CropTypeDef {
  id: string;
  name: string;
  /** Clave del asset en src/core/assets/assetConfig.ts (crops/*.glb). */
  assetKey: string;
  color: string;
  headColor: string;
  heightMin: number;
  heightMax: number;
  rows: number;
  spacing: number;
}

/** Catálogo de cultivos. Solo visual: la economía/ciclo no depende de esto. */
export const CROP_TYPES: CropTypeDef[] = [
  { id: "wheat", name: "Trigo", assetKey: "crop:wheat", color: "#7aa84f", headColor: "#d9c15a", heightMin: 0.7, heightMax: 1.0, rows: 4, spacing: 1.0 },
  { id: "corn", name: "Maíz", assetKey: "crop:corn", color: "#5f8f3c", headColor: "#e0a93d", heightMin: 1.1, heightMax: 1.5, rows: 4, spacing: 1.0 },
  { id: "carrot", name: "Zanahoria", assetKey: "crop:carrot", color: "#4f8f4a", headColor: "#e0782c", heightMin: 0.4, heightMax: 0.6, rows: 5, spacing: 0.8 },
  { id: "potato", name: "Papa", assetKey: "crop:potato", color: "#5f8f3c", headColor: "#a0784a", heightMin: 0.4, heightMax: 0.6, rows: 4, spacing: 0.9 },
];

/** Asignación de un cultivo a cada parcela (índice de PLOTS en utils/terrain.ts). */
export const PLOT_CROPS: Array<{ plotIndex: number; cropId: string }> = [
  { plotIndex: 0, cropId: "wheat" },
  { plotIndex: 1, cropId: "corn" },
  { plotIndex: 2, cropId: "carrot" },
  { plotIndex: 3, cropId: "potato" },
];

/** Parcelas con economía activa (sembrar/cosechar): índice de PLOTS -> cropId. */
export const PLOT_ECONOMY: Array<{ plotIndex: number; cropId: string }> = [
  { plotIndex: 0, cropId: "wheat" },
  { plotIndex: 1, cropId: "corn" },
  { plotIndex: 2, cropId: "carrot" },
  { plotIndex: 3, cropId: "potato" },
];
