export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYER_NAME_LENGTH = 24;
export const MIN_PLAYERS_TO_START = 2;
export const TOTAL_ROUNDS_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9] as const;
export const ROUND_TIMER_OPTIONS = [45, 60, 75, 90] as const;
export const DEFAULT_TOTAL_ROUNDS = 3;
export const DEFAULT_ROUND_TIMER_SECONDS = 60;
export const DEV_ROOM_CODE = "DEV1";
export const RECONNECT_GRACE_PERIOD_MS = 45_000;
export const CHOOSE_WORD_DURATION_MS = 15_000;
export const DRAWING_DURATION_MS = DEFAULT_ROUND_TIMER_SECONDS * 1_000;
export const DRAWING_HINT_REVEAL_RATIO = 2 / 3;
export const DRAWING_HINT_REVEAL_DELAY_MS = Math.floor(DRAWING_DURATION_MS * DRAWING_HINT_REVEAL_RATIO);
export const INTERMISSION_DURATION_MS = 2_000;

export const getRoundTimerDurationMs = (roundTimerSeconds: number) => roundTimerSeconds * 1_000;

export const getHintRevealDelayMs = (roundTimerSeconds: number) =>
  Math.floor(getRoundTimerDurationMs(roundTimerSeconds) * DRAWING_HINT_REVEAL_RATIO);
