import { useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

interface Props {
  base64: string;
}

const RENDER_SIZE = 220;

export function StlViewer({ base64 }: Props) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      // Décode le base64 en ArrayBuffer
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Parse le STL (binaire ou ASCII)
      const loader = new STLLoader();
      const geometry = loader.parse(bytes.buffer);
      geometry.computeBoundingBox();
      geometry.center();

      // Scène
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f5f5);

      // Éclairage
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x8899cc, 0.3);
      fill.position.set(-2, -1, -2);
      scene.add(fill);

      // Mesh — couleur accent de l'app
      const material = new THREE.MeshPhongMaterial({
        color: 0x89b4fa,
        specular: 0x333333,
        shininess: 40,
      });
      const mesh = new THREE.Mesh(geometry, material);
      // Les STL ont souvent Z vers le haut ; Three.js a Y vers le haut
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);

      // Caméra : positionée pour englober l'objet
      const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 100000);
      const box = new THREE.Box3().setFromObject(mesh);
      const bsize = new THREE.Vector3();
      box.getSize(bsize);
      const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
      const dist = (maxDim / 2 / Math.tan((45 * Math.PI) / 360)) * 1.6;
      camera.position.set(dist * 0.7, dist * 0.6, dist);
      camera.lookAt(0, 0, 0);

      // Rendu offscreen → data URL
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(RENDER_SIZE, RENDER_SIZE);
      renderer.setPixelRatio(1);
      renderer.render(scene, camera);

      setThumbnail(renderer.domElement.toDataURL("image/png"));

      // Nettoyage
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    } catch (e) {
      console.error("Erreur rendu STL :", e);
      setFailed(true);
    }
  }, [base64]);

  if (failed) return <div className="thumb-placeholder">📐</div>;
  if (!thumbnail) return <div className="thumb-placeholder loading">⏳</div>;
  return <img src={thumbnail} alt="STL preview" className="thumb-img" />;
}
