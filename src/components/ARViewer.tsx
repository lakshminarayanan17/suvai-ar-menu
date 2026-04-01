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
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [arActive, setArActive] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [placed, setPlaced] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const foodModelRef = useRef<THREE.Group | null>(null);
  const placedModelRef = useRef<THREE.Group | null>(null);
  const modelBlobUrlRef = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const validItems = menuItems.filter((m) => m.image);
  const currentItem = validItems[currentIndex];

  // Check WebXR AR support
  useEffect(() => {
    if (navigator.xr) {
      navigator.xr
        .isSessionSupported("immersive-ar")
        .then((supported) => setArSupported(supported))
        .catch(() => setArSupported(false));
    } else {
      setArSupported(false);
    }
  }, []);

  // Generate GLB model for current item
  const generateModel = useCallback(async (item: MenuItem) => {
    if (!item.image) return;
    setModelReady(false);
    try {
      // Revoke old URL
      if (modelBlobUrlRef.current) {
        URL.revokeObjectURL(modelBlobUrlRef.current);
      }
      const url = await generatePlateGLBFromUrl(item.image);
      modelBlobUrlRef.current = url;

      // Load into Three.js
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        const model = gltf.scene;
        model.scale.set(1, 1, 1);

        // Enable shadows on all meshes
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        foodModelRef.current = model;
        setModelReady(true);
      });
    } catch (err) {
      console.error("Model generation failed:", err);
    }
  }, []);

  useEffect(() => {
    if (currentItem) {
      setPlaced(false);
      // Remove old placed model
      if (placedModelRef.current && sceneRef.current) {
        sceneRef.current.remove(placedModelRef.current);
        placedModelRef.current = null;
      }
      generateModel(currentItem);
    }
  }, [currentIndex, currentItem?.id, generateModel]);

  // Initialize Three.js scene + WebXR
  const startAR = useCallback(async () => {
    if (!containerRef.current || !navigator.xr) return;

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;z-index:0;";
    containerRef.current.insertBefore(canvas, containerRef.current.firstChild);
    canvasRef.current = canvas;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera — WebXR will override this
    const camera = new THREE.PerspectiveCamera(
      70,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.01,
      20
    );
    cameraRef.current = camera;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 4, 2);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0xffeeb1, 0x080820, 0.6);
    scene.add(hemiLight);

    // Reticle — ring shown on detected surfaces before placement
    const reticleGeo = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(
      -Math.PI / 2
    );
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const reticle = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.visible = false;
    reticle.matrixAutoUpdate = false;
    scene.add(reticle);
    reticleRef.current = reticle;

    // Request WebXR immersive-ar session
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

      // Set up hit-test source
      const refSpace = await session.requestReferenceSpace("viewer");
      const hitTestSource = await session.requestHitTestSource!({
        space: refSpace,
      });
      hitTestSourceRef.current = hitTestSource ?? null;

      // Handle session end
      session.addEventListener("end", () => {
        setArActive(false);
        hitTestSourceRef.current = null;
        sessionRef.current = null;

        // Clean up
        if (canvasRef.current?.parentNode) {
          canvasRef.current.parentNode.removeChild(canvasRef.current);
        }
        rendererRef.current?.dispose();
        rendererRef.current = null;
      });

      // Handle tap to place model
      session.addEventListener("select", () => {
        if (
          reticleRef.current?.visible &&
          foodModelRef.current &&
          !placedModelRef.current
        ) {
          const model = foodModelRef.current.clone();
          model.position.setFromMatrixPosition(reticleRef.current.matrix);
          // Get rotation from reticle
          model.quaternion.setFromRotationMatrix(reticleRef.current.matrix);
          sceneRef.current?.add(model);
          placedModelRef.current = model;
          setPlaced(true);
          // Hide reticle after placing
          reticleRef.current.visible = false;
        }
      });

      // Render loop
      renderer.setAnimationLoop((_, frame) => {
        if (!frame) return;

        const refSpaceLocal = renderer.xr.getReferenceSpace();
        if (!refSpaceLocal) return;

        // Hit test — show reticle on surfaces
        if (hitTestSourceRef.current && !placedModelRef.current) {
          const hitResults = frame.getHitTestResults(
            hitTestSourceRef.current
          );
          if (hitResults.length > 0) {
            const hit = hitResults[0];
            const pose = hit.getPose(refSpaceLocal);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
            }
          } else {
            reticle.visible = false;
          }
        }

        renderer.render(scene, camera);
      });
    } catch (err) {
      console.error("WebXR session failed:", err);
      setArSupported(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.end().catch(() => {});
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (modelBlobUrlRef.current) {
        URL.revokeObjectURL(modelBlobUrlRef.current);
      }
      rendererRef.current?.dispose();
    };
  }, []);

  // Replace placed model when switching items during AR
  useEffect(() => {
    if (arActive && placed && foodModelRef.current && placedModelRef.current && sceneRef.current) {
      const oldPos = placedModelRef.current.position.clone();
      const oldQuat = placedModelRef.current.quaternion.clone();
      sceneRef.current.remove(placedModelRef.current);

      const newModel = foodModelRef.current.clone();
      newModel.position.copy(oldPos);
      newModel.quaternion.copy(oldQuat);
      sceneRef.current.add(newModel);
      placedModelRef.current = newModel;
    }
  }, [modelReady, arActive, placed]);

  const goNext = () => {
    if (currentIndex < validItems.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  if (!validItems.length) {
    return (
      <div className="h-full flex items-center justify-center bg-black text-white text-center p-8">
        <p>No menu items available yet.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden"
    >
      {/* Pre-AR: show prompt to start */}
      {!arActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-[5] bg-black">
          {/* Food image preview */}
          {currentItem?.image && (
            <div className="w-[200px] h-[200px] rounded-full overflow-hidden mb-6 border-4 border-white/20">
              <img
                src={currentItem.image}
                alt={currentItem.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <h2 className="font-signifier text-[28px] text-white mb-2">
            {currentItem?.name}
          </h2>
          <p className="text-white/70 text-center px-8 mb-8 text-[15px]">
            {currentItem?.description}
          </p>

          {arSupported === null && (
            <p className="text-white/50 text-sm">Checking AR support...</p>
          )}

          {arSupported === true && (
            <button
              onClick={startAR}
              disabled={!modelReady}
              className="bg-white text-black font-semibold rounded-full px-8 py-4 text-[16px] flex items-center gap-3 disabled:opacity-50"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {modelReady ? "View on Your Table" : "Loading 3D Model..."}
            </button>
          )}

          {arSupported === false && (
            <div className="text-center px-8">
              <p className="text-red-400 text-sm mb-2">
                AR not supported on this device
              </p>
              <p className="text-white/50 text-xs">
                Use Chrome on an ARCore-compatible Android device
              </p>
            </div>
          )}
        </div>
      )}

      {/* AR overlay UI — shown during AR session via DOM overlay */}
      {arActive && (
        <>
          {/* Top info card */}
          <div
            className="absolute top-[60px] left-[12px] right-[12px] rounded-[17px] overflow-hidden p-[16px] z-[30]"
            style={{
              background: "rgba(70, 70, 70, 0.5)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <h2 className="font-signifier text-[22px] text-[#f5f5f5] leading-none">
              {currentItem?.name}
            </h2>
            <p className="text-[14px] text-[rgba(255,255,255,0.85)] leading-[1.3] mt-[8px]">
              {currentItem?.description}
            </p>
          </div>

          {/* Placement instruction */}
          {!placed && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[30]">
              <p
                className="text-white text-[16px] font-medium px-6 py-3 rounded-full"
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(8px)",
                }}
              >
                Point at a surface, then tap to place
              </p>
            </div>
          )}

          {/* Bottom navigation */}
          <div
            className="absolute bottom-[40px] left-[12px] right-[12px] rounded-[17px] overflow-hidden p-[16px] z-[30]"
            style={{
              background: "rgba(70, 70, 70, 0.5)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <p
              className="font-signifier text-[20px] text-[#f5f5f5] text-center tracking-[-0.4px] leading-none"
              style={{
                textDecoration: "underline",
                textDecorationStyle: "wavy",
                textUnderlineOffset: "4px",
              }}
            >
              {restaurantName} Special Menu
            </p>

            <div className="flex items-center justify-between mt-[16px]">
              <button
                onClick={goPrev}
                className={currentIndex === 0 ? "opacity-30" : ""}
              >
                <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
                  <path
                    d="M10 1L2 8.5L10 16M2 8.5H22"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div className="flex items-center gap-[12px]">
                {validItems.map((_, i) => (
                  <div
                    key={i}
                    className={`w-[2px] rounded-full transition-all ${
                      i === currentIndex
                        ? "h-[19px] bg-white shadow-[0px_4px_4px_rgba(0,0,0,0.25)]"
                        : "h-[11px] bg-[rgba(255,255,255,0.37)]"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={goNext}
                className={
                  currentIndex === validItems.length - 1 ? "opacity-30" : ""
                }
              >
                <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
                  <path
                    d="M14 1L22 8.5L14 16M22 8.5H2"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
