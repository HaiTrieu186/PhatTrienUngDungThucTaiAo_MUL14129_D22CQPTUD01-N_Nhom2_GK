import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const atmosVertex = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 wPos  = modelMatrix * vec4(position, 1.0);
    vWorldPos  = wPos.xyz;
    vNormal    = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosFragment = /* glsl */`
  uniform vec3 uSunDirection;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3  V       = normalize(cameraPosition - vWorldPos);
    vec3  N       = normalize(vNormal);
    
    // ── Fresnel Rim (Ánh sáng viền) ───────────────────────────────────────
    float fresnel = pow(1.0 + dot(N, V), 3.0); 

    // ── Hướng nắng (Sun interaction) ──────────────────────────────────────
    float sunDot    = dot(N, normalize(uSunDirection));
    // Tăng mức tối thiểu (0.45) để quầng sáng không bao giờ biến mất hoàn toàn
    float sunWeight = smoothstep(-0.3, 0.6, sunDot) * 0.55 + 0.45;

    // ── Màu sắc khí quyển ──────────────────────────────────────────────────
    vec3 dayColor   = vec3(0.3, 0.6, 1.0);     // Xanh Cyan sáng
    vec3 nightColor = vec3(0.08, 0.12, 0.42);  // Xanh đêm rõ hơn (tăng độ sáng đêm)
    vec3 glowColor  = mix(nightColor, dayColor, smoothstep(-0.2, 0.5, sunDot));

    // Tính toán màu cuối cùng
    // Nhân thêm sunWeight cho màu nhưng giữ fresnel chủ đạo
    vec3 finalGlow = glowColor * fresnel * sunWeight * 1.8;

    // Alpha: Giữ lại quầng sáng viền ngay cả ở mặt tối (không nhân sunWeight vào alpha)
    float alpha = fresnel * 0.7;

    gl_FragColor = vec4(finalGlow, alpha);
  }
`

export default function Atmosphere({ sunWorldPosRef }) {
  const meshRef     = useRef()
  const atmosPos    = useRef(new THREE.Vector3())
  const sunDirWorld = useRef(new THREE.Vector3())

  const uniforms = useMemo(() => ({
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [])

  useFrame(() => {
    if (meshRef.current && sunWorldPosRef?.current) {
      meshRef.current.getWorldPosition(atmosPos.current)
      sunDirWorld.current
        .subVectors(sunWorldPosRef.current, atmosPos.current)
        .normalize()
      uniforms.uSunDirection.value.copy(sunDirWorld.current)
    }
  })

  return (
    <mesh
      ref={meshRef}
      // Đã tăng scale lên 1.18 để khí quyển trông bao phủ rộng hơn một chút
      scale={[1.01, 1.01, 1.01]}
      raycast={() => {}}
    >
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosVertex}
        fragmentShader={atmosFragment}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}