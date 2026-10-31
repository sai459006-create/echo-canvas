export type Phase = "lobby" | "sound" | "drawing" | "rhythm" | "deduction" | "reveal";
export type Point = { x: number; y: number; t: number };
export type BeatEvent = { pad: number; at: number };

export type Player = {
  id: string;
  name: string;
  slot: number;
  joinedAt: number;
  connected: boolean;
};

export type Room = {
  code: string;
  hostId: string;
  phase: Phase;
  players: Record<string, Player>;
  originalSoundId: string;
  drawing: Point[];
  rhythm: BeatEvent[];
  answer: string;
  selectedAnswer: string;
  score: number;
  deadline: number;
  createdAt: number;
  round: number;
};

export const SOUNDS = [
  { id: "rain", name: "Rain on a window", emoji: "🌧️", hint: "A soft, irregular patter" },
  { id: "footsteps", name: "Footsteps", emoji: "👟", hint: "A steady pair of impacts" },
  { id: "knock", name: "A mysterious knock", emoji: "🚪", hint: "Three hollow knocks" },
  { id: "birds", name: "Morning birds", emoji: "🐦", hint: "Short, bright chirps" },
  { id: "heartbeat", name: "Heartbeat", emoji: "💓", hint: "A low double pulse" },
  { id: "bubbles", name: "Bubbling potion", emoji: "🫧", hint: "Tiny rising pops" },
  { id: "bell", name: "Distant bell", emoji: "🔔", hint: "A resonant metallic ring" },
  { id: "train", name: "Passing train", emoji: "🚂", hint: "A rolling mechanical rhythm" }
] as const;

export const PADS = [
  { name: "BOOM", color: "coral", emoji: "🥁", freq: 90 },
  { name: "CLAP", color: "pink", emoji: "👏", freq: 220 },
  { name: "TICK", color: "yellow", emoji: "✨", freq: 680 },
  { name: "DING", color: "blue", emoji: "🔔", freq: 880 },
  { name: "POP", color: "green", emoji: "🫧", freq: 440 },
  { name: "WHOOSH", color: "purple", emoji: "🌬️", freq: 160 }
] as const;

export function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function soundOptions(originalId: string, round = 1) {
  const rest = SOUNDS.filter(s => s.id !== originalId);
  // Deterministic shuffle per round so cards do not jump while the player is choosing.
  let seed = [...`${originalId}-${round}`].reduce((n,c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const shuffled = [...rest];
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const cards = [SOUNDS.find(s => s.id === originalId)!, ...shuffled.slice(0, 3)];
  for (let i = cards.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}