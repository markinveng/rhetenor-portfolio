import GUI from "lil-gui";

interface DebugParams {
  showAxes: boolean;
  enableOrbit: boolean;
}

export class DebugGUI {
  public gui: any;
  public params: DebugParams = {
    showAxes: true,
    enableOrbit: false,
  };

  constructor() {
    this.gui = new GUI();
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
