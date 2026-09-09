import { assertNotEmergencyStopped } from "../../../emergency-stop.js";
import { importOptional } from "../../../tools/optional.js";
import type { ComputerController, InputAction } from "./controller-types.js";

const HINT = "Run `npm install` to enable desktop control via @nut-tree-fork/nut-js.";

async function nut(): Promise<any> {
  return importOptional("@nut-tree-fork/nut-js", HINT);
}

function button(Button: any, value: "left" | "right") {
  return value === "right" ? Button.RIGHT : Button.LEFT;
}

function keyValue(Key: any, raw: string): any {
  const name = raw.trim().toLowerCase();
  const aliases: Record<string, string> = {
    enter: "Enter", return: "Enter", esc: "Escape", escape: "Escape", tab: "Tab",
    space: "Space", backspace: "Backspace", delete: "Delete", del: "Delete",
    up: "Up", down: "Down", left: "Left", right: "Right", home: "Home", end: "End",
    pageup: "PageUp", pagedown: "PageDown", ctrl: "LeftControl", control: "LeftControl",
    alt: "LeftAlt", shift: "LeftShift", cmd: "LeftSuper", command: "LeftSuper",
    meta: "LeftSuper", super: "LeftSuper",
  };
  const resolved = Key[aliases[name] ?? (name.length === 1 ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1))];
  if (resolved == null) throw new Error(`Unknown key: ${raw}`);
  return resolved;
}

export const desktopController: ComputerController = {
  id: "desktop-nut-js",
  canExecute(action: InputAction) {
    return ["mouse_move", "mouse_click", "keyboard_press", "type_text"].includes(action.type);
  },
  async execute(action: InputAction): Promise<void> {
    assertNotEmergencyStopped();
    const { mouse, keyboard, Point, Button, Key } = await nut();
    if (action.type === "mouse_move") {
      await mouse.setPosition(new Point(action.x, action.y));
      return;
    }
    if (action.type === "mouse_click") {
      if (action.x != null && action.y != null) await mouse.setPosition(new Point(action.x, action.y));
      await mouse.click(button(Button, action.button));
      return;
    }
    if (action.type === "type_text") {
      await keyboard.type(action.text);
      return;
    }
    const keys = action.key.split("+").map((part) => keyValue(Key, part));
    await keyboard.pressKey(...keys);
    await keyboard.releaseKey(...keys);
  },
};
