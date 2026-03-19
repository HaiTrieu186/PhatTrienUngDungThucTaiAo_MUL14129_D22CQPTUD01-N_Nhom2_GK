import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Vertex Shader ──────────────────────────────────────────────────────────────
const atmosVertex = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 wPos  = modelMatrix * vec4(position, 1.0);
    vWorldPos  = wPos.xyz;
    vNormal    = normalize(mat3(modelMatrix) * normal); // World-space
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ── Fragment Shader ────────────────────────────────────────────────────────────
// Cải tiến: khí quyển sáng xanh ban ngày, tối xanh đậm ban đêm
const atmosFragment = /* glsl */`
  uniform vec3 uSunDirection; // World-space: Earth → Sun
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 N = normalize(vNormal);

    // ── Fresnel Rim Glow ─────────────────────────────────────────────────
    // Công thức gốc được giữ nguyên (đã test OK trên Quest 3)
    // Giảm exponent 7→5 = quầng sáng rộng hơn, mềm hơn
    float base    = 0.5 - dot(N, viewDir);
    float fresnel = pow(clamp(base, 0.0, 1.0), 5.0);

    // ── Sun Illumination ─────────────────────────────────────────────────
    // Khí quyển phía ban ngày sáng hơn, phía tối tối xuống
    float sunDot    = dot(N, normalize(uSunDirection));
    float sunFactor = smoothstep(-0.5, 0.8, sunDot) * 0.60 + 0.40;

    // ── Atmospheric Color ────────────────────────────────────────────────
    // Ban ngày: cyan-blue sáng (như nhìn từ ISS)
    // Ban đêm: deep blue tối (không gian thực sự)
    vec3 dayColor   = vec3(0.22, 0.55, 1.00);
    vec3 nightColor = vec3(0.04, 0.09, 0.35);
    vec3 atmosColor = mix(nightColor, dayColor, smoothstep(-0.3, 0.7, sunDot));

    gl_FragColor = vec4(atmosColor, 1.0) * fresnel * sunFactor * 0.58;
  }
`

// ─────────────────────────────────────────────────────────────────────────────
export default function Atmosphere({ sunWorldPosRef }) {
  const meshRef     = useRef()
  const atmosPos    = useRef(new THREE.Vector3())
  const sunDirWorld = useRef(new THREE.Vector3())

  const uniforms = useMemo(() => ({
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [])

  useFrame(() => {
    if (meshRef.current && sunWorldPosRef?.current) {
      // Lấy vị trí trung tâm khí quyển trong world-space
      meshRef.current.getWorldPosition(atmosPos.current)
      // Hướng Mặt Trời trong world-space (không cần worldToLocal)
      sunDirWorld.current
        .subVectors(sunWorldPosRef.current, atmosPos.current)
        .normalize()
      uniforms.uSunDirection.value.copy(sunDirWorld.current)
    }
  })

  return (
    // Scale lớn hơn Trái Đất một chút (đại diện cho tầng đối lưu)
    <mesh ref={meshRef} scale={[1.15, 1.15, 1.15]}>
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosVertex}
        fragmentShader={atmosFragment}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}          // Kết xuất mặt trong để tránh z-fighting
        blending={THREE.AdditiveBlending} // Cộng màu sáng vào không gian
        depthWrite={false}
      />
    </mesh>
  )
}