export type CreativeTarget =
  | "mine-imator"
  | "blockbench"
  | "block-display-editor"
  | "godot";

export const CREATIVE_PIPELINE = {
  targets: [
    "mine-imator",
    "blockbench",
    "block-display-editor",
    "godot",
  ],
  flow: [
    "idea",
    "reference",
    "create",
    "preview",
    "export",
  ],
};
