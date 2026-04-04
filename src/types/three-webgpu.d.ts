declare module "three/webgpu" {
  const threeWebgpu: any;
  export = threeWebgpu;
}

declare module "three/tsl" {
  export const attribute: any;
  export const Fn: any;
  export const clamp: any;
  export const cos: any;
  export const float: any;
  export const instancedArray: any;
  export const instanceIndex: any;
  export const int: any;
  export const length: any;
  export const max: any;
  export const min: any;
  export const pass: any;
  export const positionLocal: any;
  export const renderOutput: any;
  export const select: any;
  export const transformNormalToView: any;
  export const uint: any;
  export const uniform: any;
  export const vec2: any;
  export const vec3: any;
  export const vertexIndex: any;
}

declare module "three/addons/controls/OrbitControls.js" {
  export const OrbitControls: any;
}

declare module "three/addons/tsl/display/FXAANode.js" {
  export const fxaa: any;
}

declare module "three/addons/loaders/UltraHDRLoader.js" {
  export const UltraHDRLoader: any;
}

declare module "three/addons/loaders/GLTFLoader.js" {
  export const GLTFLoader: any;
}
