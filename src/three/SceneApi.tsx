import { useEffect, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group } from 'three';

/**
 * Things the buttons around the 3D view can ask of it. Filled in while a 3D
 * view is on screen, empty otherwise.
 */
export const sceneApi: {
  /** A picture of the current view, as a PNG data URL. Ray-traced pictures arrive once they have cleared up. */
  photo?: () => string | Promise<string>;
  /** The house and garden (not the landscape) as a .glb 3D model file. */
  model?: () => Promise<ArrayBuffer>;
} = {};

export function SceneApi({ house }: { house: RefObject<Group | null> }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    sceneApi.photo = () => {
      const before = gl.getPixelRatio();
      gl.setPixelRatio(Math.max(2, before));
      // Draw and read back in one go: the picture is only kept until the browser next paints.
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL('image/png');
      gl.setPixelRatio(before);
      invalidate();
      return url;
    };
    sceneApi.model = async () => {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const root = house.current;
      if (!root) throw new Error('There is no house to export yet.');
      return new Promise<ArrayBuffer>((resolve, reject) =>
        new GLTFExporter().parse(root, (result) => resolve(result as ArrayBuffer), reject, { binary: true, onlyVisible: true }),
      );
    };
    return () => {
      delete sceneApi.photo;
      delete sceneApi.model;
    };
  }, [gl, scene, camera, invalidate, house]);
  return null;
}
