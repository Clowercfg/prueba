import type { BuildingType } from "./worldConfig";
import { ENCLOSURES } from "./enclosuresConfig";

export interface BuildingInfo {
  type: BuildingType;
  icon: string;
  status: "operativo" | "descanso" | "lleno" | "mantenimiento";
  capacity: string;
  storage: string;
  detail: string;
}

export const BUILDING_INFO: Record<BuildingType, BuildingInfo> = {
  barn: {
    type: "barn",
    icon: "🏠",
    status: "operativo",
    capacity: "200 u. de grano",
    storage: "2.4 t",
    detail: "Almacena grano y forraje. Aloja el taller de ensamblado de cosechas.",
  },
  house: {
    type: "house",
    icon: "🏡",
    status: "operativo",
    capacity: "Residencia",
    storage: "—",
    detail: "Residencia principal de la granja.",
  },
  cowPen: {
    type: "cowPen",
    icon: "🐄",
    status: "operativo",
    capacity: "12 vacas",
    storage: "Forraje diario",
    detail: "Corral cercado para el ganado vacuno, con puerta de acceso.",
  },
  chickenPen: {
    type: "chickenPen",
    icon: "🐔",
    status: "operativo",
    capacity: "24 pollos",
    storage: "Pienso diario",
    detail: "Corral cercado para las aves de corral, con puerta de acceso.",
  },
  warehouse: {
    type: "warehouse",
    icon: "🏭",
    status: "operativo",
    capacity: "400 u. de producto",
    storage: "3.8 t",
    detail: "Guarda la producción antes de la venta.",
  },
  greenhouse: {
    type: "greenhouse",
    icon: "🌱",
    status: "mantenimiento",
    capacity: "60 plantas",
    storage: "Riego automático",
    detail: "Cultivo protegido para hortalizas fuera de temporada.",
  },
  workshop: {
    type: "workshop",
    icon: "🔧",
    status: "operativo",
    capacity: "Banco de trabajo",
    storage: "Herramientas",
    detail: "Repara herramientas y produce fertilizante.",
  },
};

export const ENCLOSURE_INFO = ENCLOSURES.map((e) => ({
  id: e.id,
  name: e.name,
  icon: e.icon,
  kind: e.kind,
  capacity: e.capacity,
}));
