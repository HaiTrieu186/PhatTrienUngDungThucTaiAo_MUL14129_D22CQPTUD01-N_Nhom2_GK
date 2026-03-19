import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const MOON_ORBIT_RADIUS = 8.0   // Khoảng cách Mặt Trăng - Trái Đất (scene units)
const MOON_ORBIT_SPEED  = 0.07  // rad/s → ~1 vòng quỹ đạo / 90 giây thực (demo)
const MOON_RADIUS       = 0.54  // ~27% bán kính Trái Đất (r=2) → chân thực về tỉ lệ

// ── Vertex Shader ──────────────────────────────────────────────────────────────
// World-space normals để đồng bộ với sun direction (không cần worldToLocal)
const moonVertex = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv       = uv;
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = wPos.xyz;
    // mat3(modelMatrix) → world-space normal (xoay cùng Mặt Trăng)
    vNormal   = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wPos;
  }
`

// ── Fragment Shader ────────────────────────────────────────────────────────────
// Pha Mặt Trăng (trăng khuyết/tròn/lưỡi liềm) tự động tính từ vị trí thực
const moonFragment = /* glsl */`
  precision highp float;
  uniform sampler2D uColorTex;
  uniform vec3      uSunDir;   // World-space: Moon → Sun

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 albedo    = texture2D(uColorTex, vUv).rgb;

    vec3  N        = normalize(vNormal);
    vec3  L        = normalize(uSunDir);
    float cosTheta = dot(N, L);

    // Sigmoid terminator: ranh giới sáng/tối mượt mà (giống Earth shader)
    float dayMix   = 1.0 / (1.0 + exp(-15.0 * cosTheta));

    // Mặt Trăng không có khí quyển → ban đêm gần như tối hoàn toàn
    vec3 nightColor = albedo * 0.006;
    vec3 dayColor   = albedo * max(0.0, cosTheta) * 1.05;

    gl_FragColor = vec4(mix(nightColor, dayColor, dayMix), 1.0);
  }
`

// ─────────────────────────────────────────────────────────────────────────────
export default function Moon({ sunWorldPosRef }) {
  const groupRef = useRef()
  const angleRef = useRef(1.2) // Offset để Mặt Trăng hiện ra ngay từ đầu

  const colorTex = useTexture('/textures/moon_color.jpg')
  colorTex.colorSpace = THREE.SRGBColorSpace

  // Pre-allocated refs (tránh garbage collection mỗi frame)
  const moonWorldPos = useRef(new THREE.Vector3())
  const sunDir       = useRef(new THREE.Vector3(1, 0, 0))

  const uniforms = useMemo(() => ({
    uColorTex: { value: colorTex },
    uSunDir:   { value: new THREE.Vector3(1, 0, 0) },
  }), [colorTex])

  useFrame((_, delta) => {
    angleRef.current += delta * MOON_ORBIT_SPEED

    if (groupRef.current) {
      const a = angleRef.current
      // Quỹ đạo Mặt Trăng hơi nghiêng ~5° so với mặt phẳng ecliptic
      groupRef.current.position.set(
        Math.cos(a) * MOON_ORBIT_RADIUS,
        Math.sin(a * 0.31) * 1.3,         // Độ nghiêng nhỏ tạo chiều sâu 3D
        Math.sin(a) * MOON_ORBIT_RADIUS
      )

      // Tidal locking: Mặt Trăng luôn quay cùng một mặt về phía Trái Đất
      // (hiện thực – Moon's far side là bí ẩn lịch sử!)
      groupRef.current.rotation.y = Math.PI + a
    }

    // Cập nhật hướng Mặt Trời trong không gian thế giới
    // → Fragment shader tự tính toán pha (trăng tròn/khuyết/lưỡi liềm)
    if (groupRef.current && sunWorldPosRef?.current) {
      groupRef.current.getWorldPosition(moonWorldPos.current)
      sunDir.current
        .subVectors(sunWorldPosRef.current, moonWorldPos.current)
        .normalize()
      uniforms.uSunDir.value.copy(sunDir.current)
    }
  })

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[MOON_RADIUS, 32, 32]} />
        <shaderMaterial
          vertexShader={moonVertex}
          fragmentShader={moonFragment}
          uniforms={uniforms}
        />
      </mesh>
    </group>
  )
}