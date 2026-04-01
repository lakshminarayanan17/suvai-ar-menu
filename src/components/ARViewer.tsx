"use client";

import { useRef, useState, useEffect, Suspense } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import * as THREE from "three";
import { MenuItem } from "@/types/menu";

interface DishModelProps {
  imageUrl: string;
}

function DishModel({ imageUrl }: DishModelProps) {
  const meshRef = useRef<THREE.Group>(null);
  const texture = useLoader(TextureLoader, imageUrl);

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating animation
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.02 - 0.1;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
  });

  return (
    <group ref={meshRef} position={[0, -0.1, 0]}>
      {/* Plate base - outer ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 0.03, 64]} />
        <meshStandardMaterial color="#c4854b" metalness={0.1} roughness={0.6} />
      </mesh>

      {/* Plate - inner white */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.02, 64]} />
        <meshStandardMaterial color="#f5f0eb" metalness={0.05} roughness={0.8} />
      </mesh>

      {/* Food on plate - textured disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.08, 64]} />
        <meshStandardMaterial
          map={texture}
          metalness={0.0}
          roughness={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Slight bump on top for 3D food effect */}
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3]} />
        <meshStandardMaterial
          map={texture}
          metalness={0.0}
          roughness={0.8}
          transparent
          opacity={0.85}
        />
      </mesh>

      {/* Shadow disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[0.6, 64]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

interface ARViewerProps {
  menuItems: MenuItem[];
  restaurantName: string;
}

export default function ARViewer({ menuItems, restaurantName }: ARViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const validItems = menuItems.filter((m) => m.image);
  const currentItem = validItems[currentIndex];

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 1280, height: 720 },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setCameraReady(true);
        }
      } catch {
        // Camera not available, show fallback
        setCameraReady(true);
      }
    }
    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
    };
  }, []);

  const goNext = () => {
    if (currentIndex < validItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (!validItems.length) {
    return (
      <div className="h-full flex items-center justify-center bg-black text-white text-center p-8">
        <p>No menu items available yet.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />

      {/* Fallback background if no camera */}
      {!videoRef.current?.srcObject && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "linear-gradient(135deg, #3a2a1a 0%, #5a4a3a 50%, #3a2a1a 100%)",
          }}
        />
      )}

      {/* 3D Canvas overlay */}
      {currentItem?.image && (
        <div className="absolute inset-0" style={{ top: "25%", height: "45%" }}>
          <Canvas
            camera={{ position: [0, 0.8, 1.2], fov: 50 }}
            style={{ background: "transparent" }}
            gl={{ alpha: true }}
          >
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 5, 5]} intensity={0.8} />
            <directionalLight position={[-3, 3, -3]} intensity={0.3} />
            <Suspense fallback={null}>
              <DishModel imageUrl={currentItem.image} />
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* Top info card */}
      <div
        className="absolute top-[87px] left-[12px] right-[12px] rounded-[17px] overflow-hidden p-[16px]"
        style={{
          background: "rgba(70, 70, 70, 0.36)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <h2 className="font-signifier text-[24px] text-[#f5f5f5] leading-none">
          {currentItem?.name}
        </h2>
        <p className="text-[16px] text-[rgba(255,255,255,0.91)] leading-[1.27] tracking-[-0.32px] mt-[12px]">
          {currentItem?.description}
        </p>
      </div>

      {/* Bottom navigation card */}
      <div
        className="absolute bottom-[51px] left-[12px] right-[12px] rounded-[17px] overflow-hidden p-[18px]"
        style={{
          background: "rgba(70, 70, 70, 0.36)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <p
          className="font-signifier text-[24px] text-[#f5f5f5] text-center tracking-[-0.48px] leading-none"
          style={{ textDecoration: "underline", textDecorationStyle: "wavy", textUnderlineOffset: "4px" }}
        >
          {restaurantName} Special Menu
        </p>

        {/* Carousel indicators and arrows */}
        <div className="flex items-center justify-between mt-[20px]">
          {/* Left arrow */}
          <button onClick={goPrev} className={currentIndex === 0 ? "opacity-30" : ""}>
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path d="M10 1L2 8.5L10 16M2 8.5H22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Indicators */}
          <div className="flex items-center gap-[15px]">
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

          {/* Right arrow */}
          <button onClick={goNext} className={currentIndex === validItems.length - 1 ? "opacity-30" : ""}>
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path d="M14 1L22 8.5L14 16M22 8.5H2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 w-[134px] h-[5px] bg-white rounded-[100px]" />
    </div>
  );
}
