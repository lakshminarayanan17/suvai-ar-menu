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

export default function ARViewer({ menuItems, restaurantName }: ARViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [arActive, setArActive] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arStatus, setArStatus] = useState<string>("");

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

  const validItems = menuItems.filter((m) => m.image);
  const currentItem = validItems[currentIndex];

  // Track which item index the loaded model belongs to
  const loadedModelIndexRef = useRef<number>(-1);

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
      loader.load(url, (gltf) => {
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
      });
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

  // When new model finishes loading during AR, swap it in
  const placedModelIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (!modelReady || !arActive || !placed) return;
    if (!foodModelRef.current || !placedModelRef.current || !sceneRef.current) return;
    // Only swap if the loaded model is for a DIFFERENT dish than what's currently placed
    if (loadedModelIndexRef.current === placedModelIndexRef.current) return;

    const oldPos = placedModelRef.current.position.clone();
    sceneRef.current.remove(placedModelRef.current);

    const newModel = foodModelRef.current.clone();
    newModel.position.copy(oldPos);
    newModel.rotation.set(0, 0, 0);
    sceneRef.current.add(newModel);
    placedModelRef.current = newModel;
    placedModelIndexRef.current = loadedModelIndexRef.current;
  }, [modelReady, arActive, placed]);

  // Start AR session
  const startAR = useCallback(async () => {
    setError(null);
    setArStatus("Starting AR...");

    if (!navigator.xr) {
      setError("AR is not supported on this browser. Use Chrome on Android.");
      setArStatus("");
      return;
    }

    try {
      const supported = await navigator.xr.isSessionSupported("immersive-ar");
      if (!supported) {
        setError("AR not supported on this device. Needs ARCore + Chrome.");
        setArStatus("");
        return;
      }
    } catch {
      setError("Could not check AR support. Try Chrome on Android.");
      setArStatus("");
      return;
    }

    if (!containerRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:0;";
    containerRef.current.insertBefore(canvas, containerRef.current.firstChild);
    canvasRef.current = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.xr.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(70, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.01, 20);
    cameraRef.current = camera;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(1, 3, 2);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-2, 2, -1);
    scene.add(fillLight);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));

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
      setArStatus("Slowly move your phone around...");

      const refSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await session.requestHitTestSource!({ space: refSpace });
      hitTestSourceRef.current = hitTestSource ?? null;

      session.addEventListener("end", () => {
        setArActive(false);
        hitTestSourceRef.current = null;
        sessionRef.current = null;
        if (canvasRef.current?.parentNode) canvasRef.current.parentNode.removeChild(canvasRef.current);
        rendererRef.current?.dispose();
        rendererRef.current = null;
      });

      // Place on first stable hit
      let autoPlaced = false;
      let hitCount = 0;
      const MIN_HITS = 2;

      renderer.setAnimationLoop((_, frame) => {
        if (!frame) return;
        const refSpaceLocal = renderer.xr.getReferenceSpace();
        if (!refSpaceLocal) return;

        // Hit test — wait for stable detection then auto-place
        if (hitTestSourceRef.current && !autoPlaced) {
          const hitResults = frame.getHitTestResults(hitTestSourceRef.current);
          if (hitResults.length > 0 && foodModelRef.current) {
            hitCount++;
            if (hitCount >= MIN_HITS) {
              const hit = hitResults[0];
              const pose = hit.getPose(refSpaceLocal);
              if (pose) {
                const model = foodModelRef.current.clone();
                const p = pose.transform.position;
                model.position.set(p.x, p.y, p.z);
                model.rotation.set(0, 0, 0);

                scene.add(model);
                placedModelRef.current = model;
                placedModelIndexRef.current = loadedModelIndexRef.current;
                autoPlaced = true;
                setPlaced(true);
                setArStatus("");
                hitTestSourceRef.current = null;
              }
            }
          } else {
            hitCount = 0; // reset if we lose tracking
          }
        }

        renderer.render(scene, camera);
      });
    } catch (err) {
      console.error("WebXR session failed:", err);
      setError(`AR failed: ${err instanceof Error ? err.message : String(err)}`);
      setArStatus("");
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

      {/* Launch screen — dish preview + AR button */}
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
            disabled={!modelReady}
            className={`rounded-full px-10 py-4 flex items-center gap-3 ${modelReady ? "bg-white active:bg-white/80" : "bg-white/20"}`}
          >
            {!modelReady && (
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            <span className={`font-semibold text-[17px] ${modelReady ? "text-black" : "text-white/50"}`}>
              {modelReady ? "View in AR" : "Loading..."}
            </span>
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
          {/* Status message — shown while looking for surface */}
          {arStatus && (
            <div
              className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-[40] rounded-full px-6 py-3"
              style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              <p className="text-white text-[15px] font-medium whitespace-nowrap">{arStatus}</p>
            </div>
          )}

          {/* Top info — always visible during AR */}
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

          {/* Bottom nav — always visible during AR */}
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
