import * as THREE from "three/webgpu";
// three/tsl は @types/three にサブパスの型定義が無いため、any経由で受け取る(既存コードに準拠)。
// @ts-ignore
import * as TSL from "three/tsl";

const { Fn, texture, uv, uniform } = TSL as any;

/** WATER_BOUNDSぴったりだと画面端に隙間が出ることがあるための余白。Water/index.tsのOVERSCANと揃える。 */
export const OVERSCAN = 1.08;

/**
 * WaterBackgroundの背景として、画面全体に岩盤画像(rock_background.jpg)を敷くレイヤー。
 * Waterはこのテクスチャを自身のcolorNodeでも波の法線に沿って歪めてサンプリングし、
 * 「水面越しに岩盤が見える」表現に使う(Water/index.ts参照)。
 * Waterより必ず後ろに描画されるよう、Water(renderOrder=-1)よりさらに小さいrenderOrderを持つ。
 */
export class RockBackdrop {
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly material: any;
  private readonly mesh: any;
  private readonly texture: any;

  /** repeat.xy, offset.zw を1本のvec4にまとめたcover-fit用uniform。Waterのcolor Nodeとも共有する。 */
  public readonly coverUv = uniform(new THREE.Vector4(1, 1, 0, 0));

  private imageAspect = 16 / 9;

  constructor(scene: any) {
    this.texture = new THREE.TextureLoader().load(
      "/assets/rock_background.jpg",
      (loaded: any) => {
        loaded.colorSpace = THREE.SRGBColorSpace;

        const image = loaded.image as HTMLImageElement;

        if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
          this.imageAspect = image.naturalWidth / image.naturalHeight;
        }
      },
    );

    this.material = new (THREE as any).MeshBasicNodeMaterial({
      depthWrite: false,
    });

    this.material.colorNode = Fn(() => {
      const repeat = this.coverUv.xy;
      const offset = this.coverUv.zw;

      return texture(this.texture, uv().mul(repeat).add(offset));
    })();

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    /*
     * 常にWater(renderOrder=-1)より後ろに描画する。
     */
    this.mesh.renderOrder = -2;
    scene.add(this.mesh);
  }

  public getTexture(): any {
    return this.texture;
  }

  /**
   * 画面全体を覆うサイズへ更新し、CSSのbackground-size:coverと同じ考え方で
   * 画像のアスペクト比を保ったままcoverUv(repeat/offset)を再計算する。
   */
  public update(pixelsToWorld: number): void {
    const visibleWidth = pixelsToWorld * window.innerWidth;
    const visibleHeight = pixelsToWorld * window.innerHeight;

    this.mesh.scale.set(visibleWidth * OVERSCAN, visibleHeight * OVERSCAN, 1);

    const screenAspect = window.innerWidth / window.innerHeight;

    let repeatX = 1;
    let repeatY = 1;
    let offsetX = 0;
    let offsetY = 0;

    if (this.imageAspect > screenAspect) {
      repeatX = screenAspect / this.imageAspect;
      offsetX = (1 - repeatX) / 2;
    } else {
      repeatY = this.imageAspect / screenAspect;
      offsetY = (1 - repeatY) / 2;
    }

    this.coverUv.value.set(repeatX, repeatY, offsetX, offsetY);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
