import * as THREE from "three/webgpu";
import { pass, renderOutput } from "three/tsl";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { getPixelRatio } from "../Device/Device";

export class RenderPipeline {
  public renderer: any;
  private postProcessing: any;

  constructor(container: HTMLDivElement, scene: any, camera: any) {
    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(getPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.setClearAlpha(0);
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.postProcessing = new (THREE as any).RenderPipeline(this.renderer);
    this.postProcessing.outputColorTransform = false;

    const scenePass = pass(scene, camera);
    const outputPass = renderOutput(scenePass);
    this.postProcessing.outputNode = fxaa(outputPass);
  }

  public get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public compute(computeNode: any, dispatchSize: readonly [number, number, number]): void {
    this.renderer.compute(computeNode, dispatchSize);
  }

  public resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public render(): void {
    this.postProcessing.render();
  }

  public dispose(): void {
    this.renderer.setAnimationLoop(null);

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
