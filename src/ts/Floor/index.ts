import * as THREE from "three/webgpu";

export class Floor {
  public mesh: any;

  private geometry: any;
  private material: any;

  constructor(scene: any) {
    this.geometry = new THREE.PlaneGeometry(30, 20, 1, 1);
    this.material = new THREE.MeshStandardMaterial({
      color: 0x666666,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.z = -0.4;
    scene.add(this.mesh);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
