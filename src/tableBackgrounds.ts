export const TABLE_BACKGROUNDS = [
  { id: "plastic", file: "/backgrounds/plastic-cafe-table.jpg", label: "tableBackground.plastic" },
  { id: "wood", file: "/backgrounds/wood-cafe-table-v1.png", label: "tableBackground.wood" },
] as const;

export type TableBackgroundId = (typeof TABLE_BACKGROUNDS)[number]["id"];
export const DEFAULT_TABLE_BACKGROUND: TableBackgroundId = "plastic";

export function isTableBackgroundId(value: unknown): value is TableBackgroundId {
  return TABLE_BACKGROUNDS.some((background) => background.id === value);
}

export function tableBackgroundFile(id: TableBackgroundId): string {
  return TABLE_BACKGROUNDS.find((background) => background.id === id)?.file ?? TABLE_BACKGROUNDS[0].file;
}
