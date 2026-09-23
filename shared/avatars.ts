/** Positions in the 3-by-2 café portrait sheet. */
export const AVATAR_IDS = [0, 1, 2, 3, 4, 5] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export const DEFAULT_AVATAR: AvatarId = 0;

/** The existing male portraits, reused if a table has more than three bots. */
export const BOT_AVATAR_IDS = [1, 3, 5] as const satisfies readonly AvatarId[];

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "number" && AVATAR_IDS.some((id) => id === value);
}

export function botAvatarForSeat(seat: number): AvatarId {
  return BOT_AVATAR_IDS[seat % BOT_AVATAR_IDS.length];
}
