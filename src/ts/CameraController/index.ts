import * as THREE from "three/webgpu";

interface CameraControllerParams {
  fov: number;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
}

export class CameraController {
  public camera: any;
  public params: CameraControllerParams = {
    fov: 30,
    cameraX: 0,
    cameraY: 0,
    cameraZ: 40,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.update();
  }

  public update = (): void => {
    this.camera.fov = this.params.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(
      this.params.cameraX,
      this.params.cameraY,
      this.params.cameraZ
    );
    this.camera.lookAt(this.params.targetX, this.params.targetY, this.params.targetZ);
  };

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public registerGUI(folder: any): void {
    folder
      .add(this.params, "cameraX", -50, 50, 0.1)
      .name("Pos X")
      .onChange(this.update);
    folder
      .add(this.params, "cameraY", -50, 50, 0.1)
      .name("Pos Y")
      .onChange(this.update);
    folder
      .add(this.params, "cameraZ", -50, 50, 0.1)
      .name("Pos Z")
      .onChange(this.update);
    folder
      .add(this.params, "targetX", -20, 20, 0.1)
      .name("LookAt X")
      .onChange(this.update);
    folder
      .add(this.params, "targetY", -20, 20, 0.1)
      .name("LookAt Y")
      .onChange(this.update);
    folder
      .add(this.params, "targetZ", -20, 20, 0.1)
      .name("LookAt Z")
      .onChange(this.update);
    folder.add(this.params, "fov", 20, 100, 1).name("FOV").onChange(this.update);
  }
}
