import * as THREE from 'three'

const atmosVertex = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosFragment = `
  varying vec3 vNormal;
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
  }
`

export default function Atmosphere() {
  return (
    <mesh scale={[1.18, 1.18, 1.18]}>
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosVertex}
        fragmentShader={atmosFragment}
        transparent
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}