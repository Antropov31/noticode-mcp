export type InputAction =
  | { type: "mouse_move"; x: number; y: number }
  | { type: "mouse_click"; button: "left" | "right"; x?: number; y?: number }
  | { type: "keyboard_press"; key: string }
  | { type: "type_text"; text: string };

export interface ComputerController {
  id: string;
  canExecute(action: InputAction): boolean;
  execute(action: InputAction): Promise<void>;
}
