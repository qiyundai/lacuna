import * as T from 'three';

export function buildingArrival(root: T.Group, threshold: number, ground: number) {
  const bounds = new T.Box3().setFromObject(root);
  const start = Math.max(bounds.min.y, Math.min(threshold-.65, ground-.24));
  const finish = bounds.max.y+.03;
  const plane = new T.Plane(new T.Vector3(0,-1,0),start);
  const originals = new Map<T.Material,T.Material>();
  const restore: {mesh:T.Mesh; material:T.Material}[] = [];
  root.traverse(mesh => {
    if (!(mesh instanceof T.Mesh) || Array.isArray(mesh.material)) return;
    const original: T.Material = mesh.material;
    let clipped = originals.get(original);
    if (!clipped) {
      clipped = original.clone();
      clipped.onBeforeCompile = original.onBeforeCompile;
      clipped.customProgramCacheKey = original.customProgramCacheKey.bind(original);
      clipped.clippingPlanes = [plane];
      clipped.clipShadows = true;
      originals.set(original,clipped);
    }
    restore.push({mesh, material:original});
    mesh.material = clipped;
  });
  const finalY = root.position.y;
  function sample(progress: number) {
    const eased = T.MathUtils.smootherstep(progress,0,1);
    root.position.y = finalY-.26*(1-eased);
    plane.constant = T.MathUtils.lerp(start,finish,eased);
  }
  sample(0);
  return {sample,finish() {
    root.position.y = finalY;
    for (const {mesh,material} of restore) mesh.material = material;
    for (const material of originals.values()) material.dispose();
  }};
}
