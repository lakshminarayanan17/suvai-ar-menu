import "react";

// <model-viewer> web component (@google/model-viewer 4.x) as a React intrinsic element.
export interface ModelViewerElement extends HTMLElement {
  src: string | null;
  canActivateAR: boolean;
  activateAR(): Promise<void>;
  cameraOrbit: string;
  autoRotate: boolean;
}

type ModelViewerAttributes = React.DetailedHTMLProps<React.HTMLAttributes<ModelViewerElement>, ModelViewerElement> & {
  src?: string;
  alt?: string;
  poster?: string;
  ar?: boolean;
  "ar-modes"?: string;
  "ar-scale"?: "auto" | "fixed";
  "ar-placement"?: "floor" | "wall";
  "ios-src"?: string;
  "xr-environment"?: boolean;
  "camera-controls"?: boolean;
  "touch-action"?: string;
  "auto-rotate"?: boolean;
  "rotation-per-second"?: string;
  "shadow-intensity"?: string;
  "shadow-softness"?: string;
  "environment-image"?: string;
  exposure?: string;
  "tone-mapping"?: string;
  loading?: "auto" | "lazy" | "eager";
  reveal?: "auto" | "manual";
  "camera-orbit"?: string;
  "min-camera-orbit"?: string;
  "max-camera-orbit"?: string;
  "camera-target"?: string;
  "field-of-view"?: string;
  "interaction-prompt"?: "auto" | "none";
  "disable-zoom"?: boolean;
  "disable-pan"?: boolean;
  ref?: React.Ref<ModelViewerElement>;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}
