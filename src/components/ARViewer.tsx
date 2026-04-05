"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MenuItem } from "@/types/menu";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { generatePlateGLBFromUrl } from "@/lib/glb-generator-client";

interface ARViewerProps {
  menuItems: MenuItem[];
  restaurantName: string;
}

// Simple reticle ring for visual feedback while scanning
function createReticle(): THREE.Group {
  const group = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.08, 0.1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(ringGeo, ringMat));

  const dotGeo = new THREE.CircleGeometry(0.012, 24);
  dotGeo.rotateX(-Math.PI / 2);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.y = 0.001;
  group.add(dot);

  group.visible = false;
  return group;
}

export default function ARViewer({ menuItems, restaurantName }: ARViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [arActive, setArActive] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [surfaceFound, setSurfaceFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const foodModelRef = useRef<THREE.Group | null>(null);
  const placedModelRef = useRef<THREE.Group | null>(null);
  const modelBlobUrlRef = useRef<string | null>(null);
  const reticleRef = useRef<THREE.Group | null>(null);
  const savedPoseRef = useRef<{ x: number; y: number; z: number } | null>(null);

  const validItems = menuItems.filter((m) => m.image);
  const currentItem = validItems[currentIndex];

  const loadedModelIndexRef = useRef<number>(-1);
  const placedModelIndexRef = useRef<number>(-1);
  const isPlacedRef = useRef(false); // immediate flag for animation loop

  // Generate GLB model for current item
  const generateModel = useCallback(async (item: MenuItem, index: number) => {
    if (!item.image) return;
    setModelReady(false);
    try {
      if (modelBlobUrlRef.current) {
        URL.revokeObjectURL(modelBlobUrlRef.current);
      }
      const url = await generatePlateGLBFromUrl(item.image);
      modelBlobUrlRef.current = url;

      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          foodModelRef.current = model;
          loadedModelIndexRef.current = index;
          setModelReady(true);
        },
        undefined,
        (err) => {
          console.error("GLTFLoader error:", err);
          setError("Failed to load 3D model");
        }
      );
    } catch (err) {
      console.error("Model generation failed:", err);
      setError(`Model failed: ${err}`);
    }
  }, []);

  // Generate model on mount and when item changes
  useEffect(() => {
    if (currentItem) {
      generateModel(currentItem, currentIndex);
    }
  }, [currentIndex, currentItem?.id, generateModel]);

  // Place model at saved position
  const placeModel = useCallback(() => {
    if (!foodModelRef.current || !sceneRef.current || !savedPoseRef.current) return;

    const model = foodModelRef.current.clone();
    const p = savedPoseRef.current;
    model.position.set(p.x, p.y, p.z);
    model.rotation.set(0, 0, 0);

    if (placedModelRef.current) {
      sceneRef.current.remove(placedModelRef.current);
    }

    // IMMEDIATELY stop hit testing and hide reticle
    isPlacedRef.current = true;
    hitTestSourceRef.current = null;
    if (reticleRef.current) {
      reticleRef.current.visible = false;
      sceneRef.current.remove(reticleRef.current);
      reticleRef.current = null;
    }

    sceneRef.current.add(model);
    placedModelRef.current = model;
    placedModelIndexRef.current = loadedModelIndexRef.current;
    setPlaced(true);
  }, []);

  // Deferred placement: model just loaded + we have a saved surface pose → place now
  useEffect(() => {
    if (!modelReady || !arActive) return;
    if (!foodModelRef.current || !sceneRef.current) return;

    if (!placed && savedPoseRef.current) {
      placeModel();
    } else if (placed && placedModelRef.current) {
      // Dish switch
      if (loadedModelIndexRef.current === placedModelIndexRef.current) return;
      const oldPos = placedModelRef.current.position.clone();
      sceneRef.current.remove(placedModelRef.current);

      const newModel = foodModelRef.current.clone();
      newModel.position.copy(oldPos);
      newModel.rotation.set(0, 0, 0);
      sceneRef.current.add(newModel);
      placedModelRef.current = newModel;
      placedModelIndexRef.current = loadedModelIndexRef.current;
    }
  }, [modelReady, arActive, placed, placeModel]);

  // Start AR session
  const startAR = useCallback(async () => {
    setError(null);

    if (!navigator.xr) {
      setError("AR is not supported on this browser. Use Chrome on Android.");
      return;
    }

    try {
      const supported = await navigator.xr.isSessionSupported("immersive-ar");
      if (!supported) {
        setError("AR not supported on this device. Needs ARCore + Chrome.");
        return;
      }
    } catch {
      setError("Could not check AR support. Try Chrome on Android.");
      return;
    }

    if (!containerRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:0;";
    containerRef.current.insertBefore(canvas, containerRef.current.firstChild);
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.xr.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(70, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.01, 20);
    cameraRef.current = camera;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 3, 2);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-2, 2, -1);
    scene.add(fillLight);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));

    // Reticle for visual feedback
    const reticle = createReticle();
    scene.add(reticle);
    reticleRef.current = reticle;

    try {
      const session = await navigator.xr!.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: containerRef.current },
      });

      sessionRef.current = session;
      renderer.xr.setReferenceSpaceType("local");
      await renderer.xr.setSession(session);
      setArActive(true);

      const refSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await session.requestHitTestSource!({ space: refSpace });
      hitTestSourceRef.current = hitTestSource ?? null;

      session.addEventListener("end", () => {
        setArActive(false);
        setPlaced(false);
        setSurfaceFound(false);
        isPlacedRef.current = false;
        hitTestSourceRef.current = null;
        sessionRef.current = null;
        reticleRef.current = null;
        savedPoseRef.current = null;
        if (canvasRef.current?.parentNode) canvasRef.current.parentNode.removeChild(canvasRef.current);
        rendererRef.current?.dispose();
        rendererRef.current = null;
      });

      renderer.setAnimationLoop((_, frame) => {
        if (!frame) return;
        const refSpaceLocal = renderer.xr.getReferenceSpace();
        if (!refSpaceLocal) return;

        // Track reticle on surface (stops immediately when placed)
        if (!isPlacedRef.current && hitTestSourceRef.current && reticleRef.current) {
          const hitResults = frame.getHitTestResults(hitTestSourceRef.current);
          if (hitResults.length > 0) {
            const hit = hitResults[0];
            const pose = hit.getPose(refSpaceLocal);
            if (pose) {
              const p = pose.transform.position;
              reticleRef.current.visible = true;
              reticleRef.current.position.set(p.x, p.y, p.z);
              reticleRef.current.updateMatrixWorld(true);
              savedPoseRef.current = { x: p.x, y: p.y, z: p.z };
              setSurfaceFound(true);
            }
          }
        }

        // Slow rotation for placed model
        if (placedModelRef.current) {
          placedModelRef.current.rotation.y += 0.003;
        }

        renderer.render(scene, camera);
      });
    } catch (err) {
      console.error("WebXR session failed:", err);
      setError(`AR failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      sessionRef.current?.end().catch(() => {});
      modelBlobUrlRef.current && URL.revokeObjectURL(modelBlobUrlRef.current);
      rendererRef.current?.dispose();
    };
  }, []);

  const goNext = () => {
    if (currentIndex < validItems.length - 1) setCurrentIndex(currentIndex + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  if (!validItems.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-white text-center p-8">
        <p className="text-xl mb-4">No menu items available yet.</p>
        <p className="text-white/50 text-sm">Add menu items with images on the owner dashboard first.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">

      {/* Launch screen */}
      {!arActive && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black">
          {currentItem?.image && (
            <img
              src={currentItem.image}
              alt={currentItem.name}
              className="w-[220px] h-[220px] rounded-[24px] object-cover mb-5 shadow-lg shadow-white/10"
            />
          )}
          <h2 className="font-signifier text-white text-[22px] mb-1">{currentItem?.name}</h2>
          <p className="text-white/50 text-[13px] mb-8 px-12 text-center">{currentItem?.description}</p>

          <button
            onClick={startAR}
            className="rounded-full px-10 py-4 flex items-center gap-3 bg-white active:bg-white/80"
          >
            <span className="font-semibold text-[17px] text-black">View in AR</span>
          </button>

          {error && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-xl px-4 py-3 mt-5 mx-8">
              <p className="text-red-300 text-[13px] text-center">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* AR UI overlay */}
      {arActive && (
        <>
          {/* Loading state */}
          {!placed && !(surfaceFound && modelReady) && (
            <div
              className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-[40] flex flex-col items-center gap-3 px-8 py-5 rounded-[20px]"
              style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-[3px] border-white/20" />
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-white animate-spin" />
              </div>
              <p className="text-white text-[14px] font-medium">
                {!surfaceFound ? "Scanning your table..." : "Marinating the flavours..."}
              </p>
              <p className="text-white/50 text-[12px]">
                {!surfaceFound ? "Move your phone slowly" : "Almost ready to serve"}
              </p>
            </div>
          )}

          {/* Tap anywhere to place — invisible full-screen tap zone */}
          {!placed && surfaceFound && modelReady && (
            <div
              className="absolute inset-0 z-[35]"
              onClick={() => placeModel()}
            >
              <div
                className="absolute bottom-[120px] left-[50%] -translate-x-1/2 px-6 py-3 rounded-full"
                style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              >
                <p className="text-white text-[14px] font-medium whitespace-nowrap">Tap anywhere to place</p>
              </div>
            </div>
          )}

          {/* Top info */}
          <div
            className="absolute top-[60px] left-[12px] right-[12px] rounded-[17px] p-[16px] z-[30]"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          >
            <h2 className="font-signifier text-[22px] text-white leading-none">
              {currentItem?.name}
            </h2>
            <p className="text-[14px] text-white/80 leading-[1.3] mt-[8px]">
              {currentItem?.description}
            </p>
          </div>

          {/* Bottom nav */}
          <div
            className="absolute bottom-[40px] left-[12px] right-[12px] rounded-[17px] p-[16px] z-[30]"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          >
            <p
              className="font-signifier text-[20px] text-white text-center leading-none"
              style={{ textDecoration: "underline", textDecorationStyle: "wavy", textUnderlineOffset: "4px" }}
            >
              {restaurantName} Special Menu
            </p>
            <div className="flex items-center justify-between mt-[16px]">
              <button onClick={goPrev} className={currentIndex === 0 ? "opacity-30" : ""}>
                <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
                  <path d="M10 1L2 8.5L10 16M2 8.5H22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div className="flex items-center gap-[12px]">
                {validItems.map((_, i) => (
                  <div key={i} className={`w-[2px] rounded-full transition-all ${i === currentIndex ? "h-[19px] bg-white" : "h-[11px] bg-white/40"}`} />
                ))}
              </div>
              <button onClick={goNext} className={currentIndex === validItems.length - 1 ? "opacity-30" : ""}>
                <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
                  <path d="M14 1L22 8.5L14 16M22 8.5H2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
