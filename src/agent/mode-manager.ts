export type AgentMode =
  | "developer"
  | "gamer"
  | "artist"
  | "builder"
  | "researcher";

export const MODES = {
  developer: "Focus on code, architecture and debugging",
  gamer: "Focus on playing, observing and completing game goals",
  artist: "Focus on assets, models, textures and animation",
  builder: "Focus on construction and planning",
  researcher: "Focus on finding and analyzing information",
};

export function detectMode(task: string): AgentMode {
  const t = task.toLowerCase();
  if (t.includes("minecraft") || t.includes("играть")) return "gamer";
  if (t.includes("blockbench") || t.includes("mine-imator") || t.includes("mineimator") || t.includes("blockdisplay") || t.includes("модель") || t.includes("текстур") || t.includes("анимац") || t.includes("сцен")) return "artist";
  if (t.includes("найди") || t.includes("исследуй")) return "researcher";
  if (t.includes("построй") || t.includes("строитель")) return "builder";
  return "developer";
}
