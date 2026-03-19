import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const MOON_ORBIT_RADIUS = 8.0

// ── Liên kết tốc độ Trái Đất – Mặt Trăng ─────────────────────────────────────
// Thực tế: Trái Đất tự quay 1 vòng / 1 ngày
//          Mặt Trăng quay quanh Trái Đất 1 vòng / 27.3 ngày
// → Moon_orbit_speed = Earth_rotation_speed / 27.3
//
// Trong app: Earth rotation = 0.05 * speed (rad/s)
//            Moon orbit     = 0.05 / 27.3 * speed (rad/s)
//
// Khi kéo slider speed:
//   - Earth tự quay nhanh hơn ✓
//   - Moon quay quanh Trái Đất nhanh hơn cùng tỉ lệ ✓
//   - Tidal locking: Moon tự quay = cùng tốc độ orbital ✓ (rotation.y = Math.PI + angle)
const EARTH_BASE_SPEED = 0.05
const MOON_BASE_SPEED  = EARTH_BASE_SPEED / 27.3 // = 0.001832 rad/s khi speed=1

const MOON_RADIUS = 0.54

const moonVertex = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv       = uv;
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = wPos.xyz;
    vNormal   = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wPos;
  }
`

const moonFragment = /* glsl */`
  precision highp float;
  uniform sampler2D uColorTex;
  uniform vec3      uSunDir;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3  albedo   = texture2D(uColorTex, vUv).rgb;
    vec3  N        = normalize(vNormal);
    vec3  L        = normalize(uSunDir);
    float cosTheta = dot(N, L);

    // Sigmoid terminator – giống Earth shader
    float dayMix = 1.0 / (1.0 + exp(-15.0 * cosTheta));

    // Mặt Trăng không có khí quyển → đêm rất tối
    vec3 nightColor = albedo * 0.006;
    vec3 dayColor   = albedo * max(0.0, cosTheta) * 1.05;

    gl_FragColor = vec4(mix(nightColor, dayColor, dayMix), 1.0);
  }
`

export default function Moon({ sunWorldPosRef, speed = 1 }) {
  const groupRef = useRef()
  const angleRef = useRef(1.2) // Initial offset để Moon hiện ngay từ đầu

  const colorTex = useTexture('/textures/moon_color.jpg')
  colorTex.colorSpace = THREE.SRGBColorSpace

  const moonWorldPos = useRef(new THREE.Vector3())
  const sunDir       = useRef(new THREE.Vector3(1, 0, 0))

  const uniforms = useMemo(() => ({
    uColorTex: { value: colorTex },
    uSunDir:   { value: new THREE.Vector3(1, 0, 0) },
  }), [colorTex])

  useFrame((_, delta) => {
    // Quỹ đạo Moon tỉ lệ với speed – cùng hệ số với Earth
    // speed=1 → Moon orbit = 0.001832 rad/s (thực tế ~27.3 ngày)
    // speed=5 → Moon orbit = 0.00916 rad/s (nhanh hơn 5×)
    angleRef.current += delta * MOON_BASE_SPEED * speed

    if (groupRef.current) {
      const a = angleRef.current
      // Quỹ đạo hơi nghiêng ~5° so với ecliptic (thực tế ~5.1°)
      groupRef.current.position.set(
        Math.cos(a) * MOON_ORBIT_RADIUS,
        Math.sin(a * 0.31) * 1.3,
        Math.sin(a) * MOON_ORBIT_RADIUS
      )

      // Tidal locking: Moon luôn hướng 1 mặt về Trái Đất
      // Vì Moon tự quay đúng 1 vòng = 1 vòng quỹ đạo
      // → rotation.y = offset + orbital_angle
      groupRef.current.rotation.y = Math.PI + a
    }

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