export type SkillCategory =
  | "coding"
  | "minecraft"
  | "creative"
  | "game"
  | "browser"
  | "ide"
  | "computer";

export type AgentSkill = {
  id: string;
  category: SkillCategory;
  description: string;
  goals: string[];
  tools: string[];
  checks: string[];
};
