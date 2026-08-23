/**
 * Configuración de PROCESAMIENTO de productos. Centralizada: los precios se
 * resuelven siempre desde PRODUCT_ECONOMY (src/config/economy.ts), nunca desde
 * la interfaz. Muestra qué productos pueden procesarse y su valor de salida.
 *
 * - input/output: ids de PRODUCT_ECONOMY (unidad: 1 producto).
 * - inputGoodId:  clave en goodsStore para consumir el insumo (plural).
 * - outputGoodId: clave en goodsStore para depositar el resultado (plural).
 * - processHours: tiempo del proceso en horas (base nivel 1, real por nivel).
 * - cost:         coste por unidad (base nivel 1, real por nivel).
 * - machine:      edificio/instalación donde se realiza.
 */
export interface ProcessDef {
  id: string;
  input: { productId: string; qty: number };
  output: { productId: string; qty: number };
  inputGoodId: string;
  outputGoodId: string;
  processHours: number;
  cost: number;
  machine: string;
}

export const PROCESS_ECONOMY: Record<string, ProcessDef> = {
  "egg-boiled": {
    id: "egg-boiled",
    input: { productId: "egg", qty: 1 },
    output: { productId: "boiled-egg", qty: 1 },
    inputGoodId: "eggs",
    outputGoodId: "boiled-eggs",
    processHours: 2,
    cost: 0.01,
    machine: "Procesadora",
  },
};

export const PROCESS_LIST: ProcessDef[] = Object.values(PROCESS_ECONOMY);
