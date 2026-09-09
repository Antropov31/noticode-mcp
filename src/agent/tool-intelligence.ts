export type ToolScore = {
  name: string;
  risk: "low" | "medium" | "high";
  reason: string;
};

export const toolIntelligence: ToolScore[] = [
  { name: "fs_read", risk: "low", reason: "safe inspection" },
  { name: "fs_edit", risk: "medium", reason: "changes source code" },
  { name: "fs_delete", risk: "high", reason: "removes data" },
  { name: "shell", risk: "medium", reason: "executes commands" },
];
