import * as THREE from 'three'

// [FIX #2] Thêm "precision highp float" vào đầu mỗi shader.
// GPU Adreno (Snapdragon XR2 Gen 2) trên Quest 3 mặc định dùng mediump (16-bit).
// Hàm normalize() với tọa độ World Space lớn sẽ sinh ra giá trị Infinity → NaN → màu trắng.
// Ép lên highp (32-bit) giải quyết hoàn toàn vấn đề này.
const atmosVertex = `
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal   = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosFragment = `
  precision highp float;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    float intensity = pow(0.5 - dot(normalize(vNormal), viewDir), 7.0);
    intensity = clamp(intensity, 0.0, 1.0);

    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 0.4;
  }
`

export default function Atmosphere() {
  return (
    <mesh scale={[1.15, 1.15, 1.15]}>
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