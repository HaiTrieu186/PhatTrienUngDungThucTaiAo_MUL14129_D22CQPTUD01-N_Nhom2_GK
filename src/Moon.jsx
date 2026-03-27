import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const MOON_ORBIT_RADIUS = 8.0
const EARTH_BASE_SPEED  = 0.05
const MOON_BASE_SPEED   = EARTH_BASE_SPEED / 5.0
const MOON_RADIUS       = 0.54

// THAY ĐỔI: Giảm biên độ nghiêng quỹ đạo từ 1.3 → 0.12
//
// LÝ DO:
//  - Với biên độ 1.3 unit và bán kính quỹ đạo 8 unit,
//    góc nghiêng cực đại = arctan(1.3/8) ≈ 9.2°
//  - Bán kính góc cone penumbra của bóng nhật thực ≈ 4.1°
//  - → Mặt Trăng gần như không bao giờ đủ gần mặt phẳng hoàng đạo
//    để gây nhật thực trong khoảng demo ngắn
//
//  - Với biên độ 0.12 unit: góc nghiêng max ≈ 0.86° << 4.1°
//  - → Mặt Trăng luôn nằm trong vùng penumbra cone khi đối diện Mặt Trời
//  - → Nhật thực xảy ra mỗi ~2 vòng quỹ đạo, dễ demo cho giám khảo
//
//  - Vẫn giữ hệ số dao động 0.31 để quỹ đạo có chút lắc lư tự nhiên
//    (không phải đường tròn phẳng hoàn hảo — thiên văn vẫn hợp lý)
const ORBIT_INCLINATION = 0.12   // 0.12 thay cho 1.3

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

// ── Moon Fragment Shader ──────────────────────────────────────────────────────
// Giữ nguyên: bóng Trái Đất đổ lên Mặt Trăng (nguyệt thực) với Blood Moon
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
    vec3  V        = normalize(cameraPosition - vWorldPos);
    float cosTheta = dot(N, L);

    // Chiếu sáng Mặt Trời (sigmoid terminator)
    float dayMix    = 1.0 / (1.0 + exp(-15.0 * cosTheta));
    vec3 nightColor = albedo * 0.006;
    vec3 dayColor   = albedo * max(0.0, cosTheta) * 1.05;
    vec3 moonColor  = mix(nightColor, dayColor, dayMix);

    // Rim Light
    float rim = pow(1.0 - max(0.0, dot(N, V)), 3.5);
    vec3 rimColor = vec3(0.5, 0.7, 1.0) * rim * 0.25;

    // ── Bóng Trái Đất (Nguyệt Thực) — Ray-Sphere Intersection ───────────────
    float earthShadow = 0.0;
    {
      float eR  = 2.0;
      vec3  P   = vWorldPos;
      vec3  D   = normalize(uSunDir);
      float b   = dot(P, D);
      float c   = dot(P, P) - eR * eR;
      float disc = b * b - c;

      if (disc > 0.0 && b < 0.0) {
        float perpSq   = dot(P, P) - b * b;
        float perpDist = sqrt(max(0.0, perpSq));
        earthShadow = smoothstep(eR * 1.8, eR * 0.70, perpDist);
        earthShadow *= smoothstep(0.0, 0.3, dayMix);
      }
    }

    vec3 finalColor = moonColor * (1.0 - earthShadow * 0.92);
    // Hiệu ứng "Mặt Trăng Máu" — Blood Moon
    finalColor = mix(finalColor, finalColor * vec3(1.3, 0.5, 0.2), earthShadow * 0.40);
    finalColor += rimColor;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

export default function Moon({ sunWorldPosRef, speed = 1, moonWorldPosRef }) {
  const groupRef = useRef()
  const angleRef = useRef(1.2)

  const colorTex = useTexture('/textures/moon_color.jpg', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
  })

  const moonWorldPos = useRef(new THREE.Vector3())
  const sunDir       = useRef(new THREE.Vector3(1, 0, 0))

  const uniforms = useMemo(() => ({
    uColorTex: { value: colorTex },
    uSunDir:   { value: new THREE.Vector3(1, 0, 0) },
  }), [colorTex])

  useFrame((_, delta) => {
    angleRef.current += delta * MOON_BASE_SPEED * speed

    if (groupRef.current) {
      const a = angleRef.current
      groupRef.current.position.set(
        Math.cos(a) * MOON_ORBIT_RADIUS,
        // THAY ĐỔI: dùng ORBIT_INCLINATION thay vì giá trị cứng 1.3
        Math.sin(a * 0.31) * ORBIT_INCLINATION,
        Math.sin(a) * MOON_ORBIT_RADIUS
      )
      // Tidal locking: một mặt luôn hướng về Trái Đất
      groupRef.current.rotation.y = Math.PI + a
    }

    if (groupRef.current && sunWorldPosRef?.current) {
      groupRef.current.getWorldPosition(moonWorldPos.current)
      sunDir.current
        .subVectors(sunWorldPosRef.current, moonWorldPos.current)
        .normalize()
      uniforms.uSunDir.value.copy(sunDir.current)
    }

    if (groupRef.current && moonWorldPosRef?.current) {
      if (sunWorldPosRef?.current) {
        moonWorldPosRef.current.copy(moonWorldPos.current)
      } else {
        groupRef.current.getWorldPosition(moonWorldPosRef.current)
      }
    }
  })

  return (
    <group ref={groupRef}>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[MOON_RADIUS, 12]} />
        <shaderMaterial
          vertexShader={moonVertex}
          fragmentShader={moonFragment}
          uniforms={uniforms}
        />
      </mesh>
    </group>
  )
}