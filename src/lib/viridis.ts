// Paleta Viridis (perceptualmente uniforme) para os gráficos.
export const VIRIDIS = [
  "#440154",
  "#472d7b",
  "#3b528b",
  "#2c728e",
  "#21918c",
  "#28ae80",
  "#5ec962",
  "#addc30",
  "#fde725",
] as const;

export const VIRIDIS_PRIMARY = "#21918c";
export const VIRIDIS_SECONDARY = "#440154";
export const VIRIDIS_ACCENT = "#5ec962";

export function viridisAt(i: number): string {
  return VIRIDIS[i % VIRIDIS.length];
}
