import GUI from "lil-gui";
import guiStyles from "./lilGuiStyles.css?inline";

interface DebugParams {
  showAxes: boolean;
  enableOrbit: boolean;
}

const STYLE_ELEMENT_ID = "lil-gui-styles";

/**
 * lil-gui自身の一度きりの注入フラグは、Astroの astro:transitions による
 * head差し替えでstyleタグが消えても再注入されない(モジュールは再実行されないため)。
 * DOM上の実在チェックで毎回冪等に補い直す。
 */
function ensureStylesInjected(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = guiStyles;
  document.head.appendChild(style);
}

export class DebugGUI {
  public gui: any;
  public params: DebugParams = {
    showAxes: true,
    enableOrbit: false,
  };

  constructor() {
    ensureStylesInjected();
    this.gui = new GUI({ injectStyles: false });
  }

  public addFolder(name: string): any {
    return this.gui.addFolder(name);
  }

  public registerDebugFolder(onOrbitChange: (value: boolean) => void, onAxesChange: (value: boolean) => void): void {
    const folder = this.addFolder("Debug");
    folder
      .add(this.params, "enableOrbit")
      .name("OrbitControls")
      .onChange(onOrbitChange);
    folder
      .add(this.params, "showAxes")
      .name("AxesHelper")
      .onChange(onAxesChange);
    folder.open();
  }

  public dispose(): void {
    this.gui.destroy();
  }
}
