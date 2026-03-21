import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const MOON_ORBIT_RADIUS = 8.0
const EARTH_BASE_SPEED  = 0.05
const MOON_BASE_SPEED   = EARTH_BASE_SPEED / 27.3
const MOON_RADIUS       = 0.54

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
// Thêm tính toán bóng Trái Đất đổ lên Mặt Trăng (nguyệt thực):
// Khi Mặt Trăng nằm phía sau Trái Đất (Earth ở giữa Moon và Sun),
// Trái Đất che ánh Mặt Trời → vùng bị che tối dần (penumbra mềm)
//
// Phương pháp: Ray-Sphere Intersection trong GLSL
// - Ray: từ vWorldPos (điểm trên Mặt Trăng) hướng về Mặt Trời (uSunDir)
// - Sphere: Trái Đất tại (0,0,0) bán kính 2.0
// - Nếu ray cắt sphere → điểm đó trong bóng Trái Đất
// Ưu điểm: 0 draw call thêm, 0 texture, hoàn toàn an toàn VR
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

    // Chiếu sáng Mặt Trời lên Mặt Trăng (sigmoid terminator)
    float dayMix    = 1.0 / (1.0 + exp(-15.0 * cosTheta));
    vec3 nightColor = albedo * 0.006;
    vec3 dayColor   = albedo * max(0.0, cosTheta) * 1.05;
    vec3 moonColor  = mix(nightColor, dayColor, dayMix);

    // ── Bóng Trái Đất đổ lên Mặt Trăng (Nguyệt Thực) ────────────────────────
    // Trái Đất nằm tại gốc tọa độ thế giới (0,0,0), bán kính 2.0
    // Ray: P = vWorldPos, D = normalize(uSunDir) (hướng về Mặt Trời)
    //
    // Phương trình cắt: |P + tD - C|² = R²
    // Với C=(0,0,0): |P + tD|² = R²
    // → t² + 2t(P·D) + (P·P - R²) = 0
    // → a=1, b=P·D, c=P·P - R²
    // discriminant = b² - c
    float earthShadow = 0.0;
    {
      float eR  = 2.0;              // Earth radius (khớp với sphereGeometry Earth)
      vec3  P   = vWorldPos;        // Điểm trên Mặt Trăng
      vec3  D   = normalize(uSunDir); // Hướng về Mặt Trời
      float b   = dot(P, D);        // = P·D (half of linear term)
      float c   = dot(P, P) - eR * eR;
      float disc = b * b - c;

      // disc > 0: ray cắt hình cầu Trái Đất
      // b < 0: Trái Đất nằm GIỮA Moon và Sun (Moon ở phía sau Trái Đất)
      //        nếu b > 0 thì Sun và Earth cùng phía → không có bóng
      if (disc > 0.0 && b < 0.0) {
        // Khoảng cách vuông góc từ tâm Trái Đất đến ray
        // perpDist² = |P|² - b² = c + eR²  - (eR² - disc + b²) ... đơn giản hơn:
        // perpDist² = dot(P,P) - b*b = (c + eR*eR) - b*b
        float perpSq   = dot(P, P) - b * b;
        float perpDist = sqrt(max(0.0, perpSq));

        // Umbra (bóng tối đặc): perpDist < eR * 0.85
        // Penumbra (nửa tối, fade dần): eR*0.85 → eR*1.5
        // smoothstep(high, low, x): = 1 khi x < low, = 0 khi x > high
        earthShadow = smoothstep(eR * 1.5, eR * 0.85, perpDist);

        // Chỉ tối ở những fragment Mặt Trời đang chiếu vào
        // (tránh double-dark ở mặt tối của Mặt Trăng vốn đã tối)
        earthShadow *= smoothstep(0.0, 0.3, dayMix);
      }
    }

    // Áp dụng bóng: nhân màu xuống, giữ lại ~8% ánh sáng còn lại
    // (Thực tế nguyệt thực toàn phần vẫn có ánh sáng đỏ cam do khúc xạ khí quyển)
    vec3 finalColor = moonColor * (1.0 - earthShadow * 0.92);

    // Thêm hint màu đỏ cam nhẹ khi trong vùng penumbra (hiệu ứng ánh sáng
    // khúc xạ qua khí quyển Trái Đất – tại sao Mặt Trăng có màu máu khi nguyệt thực)
    finalColor = mix(finalColor, finalColor * vec3(1.4, 0.6, 0.3), earthShadow * 0.35);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

export default function Moon({ sunWorldPosRef, speed = 1, moonWorldPosRef }) {
  const groupRef = useRef()
  const angleRef = useRef(1.2)

  const colorTex = useTexture('/textures/moon_color.jpg')
  colorTex.colorSpace = THREE.SRGBColorSpace

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
        Math.sin(a * 0.31) * 1.3,
        Math.sin(a) * MOON_ORBIT_RADIUS
      )
      // Tidal locking
      groupRef.current.rotation.y = Math.PI + a
    }

    // Cập nhật hướng Mặt Trời cho Moon shader
    if (groupRef.current && sunWorldPosRef?.current) {
      groupRef.current.getWorldPosition(moonWorldPos.current)
      sunDir.current
        .subVectors(sunWorldPosRef.current, moonWorldPos.current)
        .normalize()
      uniforms.uSunDir.value.copy(sunDir.current)
    }

    // Xuất vị trí Moon ra ngoài cho Earth.jsx dùng (tính bóng nhật thực)
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