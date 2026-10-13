import { Color, CylinderGeometry, Group, Mesh, ShaderMaterial, Vector3, type Object3D } from 'three';

/** Local beam visuals only. The force engine owns every endpoint and position. */
export function createProjectLaser() {
  const geometry = new CylinderGeometry(1, 1, 1, 12, 1, true);
  const time = { value: 0 };
  const material = (glow: boolean) => new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time, glow: { value: glow ? 1 : 0 }, beamColor: { value: new Color('#f59e0b') }, hotColor: { value: new Color('#fff2be') } },
    vertexShader: `varying vec2 beamUv;
      void main() { beamUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform float glow; uniform vec3 beamColor; uniform vec3 hotColor; varying vec2 beamUv;
      void main() {
        float head = mod(time * 0.48, 1.32);
        float packet = smoothstep(head - 0.28, head - 0.035, beamUv.y) * (1.0 - smoothstep(head - 0.035, head, beamUv.y));
        float alpha = mix(0.88 + 0.12 * packet, 0.14 + 0.28 * packet, glow);
        gl_FragColor = vec4(mix(beamColor, hotColor, packet * (1.0 - glow) * 0.88), alpha);
      }`,
  });
  const core = material(false), glow = material(true);
  const visuals = new Map<string, Group>();
  let active = new Set<string>();
  const direction = new Vector3(), up = new Vector3(0, 1, 0);
  return {
    object(id: string) {
      let group = visuals.get(id);
      if (!group) {
        group = new Group(); group.name = 'project-laser';
        const halo = new Mesh(geometry, glow); halo.scale.set(2.1, 1, 2.1);
        const beam = new Mesh(geometry, core); beam.scale.set(.72, 1, .72);
        group.add(halo, beam); visuals.set(id, group);
      }
      group.visible = active.has(id); return group;
    },
    position(object: Object3D, start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }) {
      direction.set(end.x - start.x, end.y - start.y, end.z - start.z);
      const length = direction.length();
      object.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
      object.scale.y = length;
      if (length > 0) object.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
    },
    select(ids: Set<string> | undefined) {
      active = ids ?? new Set();
      visuals.forEach((group, id) => { group.visible = active.has(id); });
    },
    tick(milliseconds: number) { time.value = milliseconds / 1000; },
    retain(ids: Set<string>) { visuals.forEach((group, id) => { if (!ids.has(id)) { group.removeFromParent(); visuals.delete(id); } }); },
    dispose() { visuals.forEach(group => group.removeFromParent()); visuals.clear(); geometry.dispose(); core.dispose(); glow.dispose(); },
  };
}
