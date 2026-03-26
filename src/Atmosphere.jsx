import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Component tạo hiệu ứng hào quang khí quyển (Atmosphere Glow) sử dụng Fresnel Shader.
 */
export default function Atmosphere() {
  const uniforms = useMemo(() => ({
    color1: { value: new THREE.Color(0x3b82f6) }, // Xanh dương rực rỡ
    fresnelPower: { value: 6.0 }, // Giảm số mũ để hào quang loang rộng và mềm hơn
  }), [])

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vEyeDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      // Hướng từ camera đến điểm trong không gian view
      vEyeDir = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const fragmentShader = `
    uniform vec3 color1;
    uniform float fresnelPower;
    varying vec3 vNormal;
    varying vec3 vEyeDir;
    void main() {
      // Tính toán độ đậm nhạt dựa trên góc nhìn (Fresnel)
      // Khi góc giữa normal và hướng nhìn gần 90 độ (rìa), độ sáng sẽ cao nhất
      float intensity = pow(1.0 + dot(vNormal, vEyeDir), fresnelPower);
      
      // Sử dụng cường độ để điều khiển độ sáng và độ trong suốt
      gl_FragColor = vec4(color1, intensity);
    }
  `

  return (
    <mesh
      scale={[1.01, 1.01, 1.01]} // Tăng kích thước bao phủ để quầng sáng trông dày hơn (1%)
      raycast={() => { }}
    >
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.FrontSide} // Dùng FrontSide để hiệu ứng tập trung vào bề mặt bao quanh
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}
