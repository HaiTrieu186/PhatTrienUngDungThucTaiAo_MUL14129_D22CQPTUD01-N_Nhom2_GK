import * as THREE from 'three'

const atmosVertex = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    // Chuyển đổi pháp tuyến sang không gian thế giới
    vNormal   = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Shader tạo hiệu ứng viền khí quyển (Fresnel Effect)
const atmosFragment = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    
    // Tính cường độ sáng dựa trên góc nhìn. 
    // Góc giữa camera và pháp tuyến bề mặt càng lớn (ở rìa) thì cường độ càng cao.
    float intensity = pow(0.5 - dot(normalize(vNormal), viewDir), 7.0);
    intensity = clamp(intensity, 0.0, 1.0);
    
    // Màu xanh quang học của khí quyển
    gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 0.4;
  }
`

export default function Atmosphere() {
  return (
    // Đặt scale lớn hơn Trái Đất một chút
    <mesh scale={[1.15, 1.15, 1.15]}>
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosVertex}
        fragmentShader={atmosFragment}
        transparent
        side={THREE.BackSide} // Render mặt trong để hiển thị đúng khi nhìn từ ngoài vào
        blending={THREE.AdditiveBlending} // Trộn màu sáng thêm vào nền không gian
      />
    </mesh>
  )
}