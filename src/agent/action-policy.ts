export type ActionLevel = "safe" | "interactive" | "power";

export interface ActionPolicy {
  allowScreenControl: boolean;
  allowFileChanges: boolean;
  allowAppControl: boolean;
  level: ActionLevel;
}

export const defaultActionPolicy: ActionPolicy = {
  allowScreenControl: false,
  allowFileChanges: true,
  allowAppControl: false,
  level: "interactive",
};
