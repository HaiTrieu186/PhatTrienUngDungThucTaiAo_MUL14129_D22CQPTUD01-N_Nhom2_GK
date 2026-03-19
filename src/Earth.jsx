import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'

// ── Vertex Shader ──────────────────────────────────────────────────────────────
// Thêm vWorldPos để tính specular ocean highlight trong fragment shader
const earthVertex = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;   // World-space (xoay cùng Trái Đất)
  varying vec3 vWorldPos; // World-space (cho specular)

  void main() {
    vUv = uv;
    vec4 wPos  = modelMatrix * vec4(position, 1.0);
    vWorldPos  = wPos.xyz;
    // mat3(modelMatrix) → đưa normal sang world-space (tự quay theo Trái Đất)
    vNormal    = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ── Fragment Shader ────────────────────────────────────────────────────────────
const earthFragment = /* glsl */`
  precision highp float;

  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec3      uSunDirection; // World-space: Earth → Sun

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 dayColor   = texture2D(uDayTexture,   vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;

    vec3  N        = normalize(vNormal);
    vec3  L        = normalize(uSunDirection);
    vec3  V        = normalize(cameraPosition - vWorldPos); // Camera direction
    float cosAngle = dot(N, L);

    // ── Day/Night Blend ───────────────────────────────────────────────────
    // Sigmoid tạo đường Terminator sắc nét, mượt mà hơn smoothstep nhiều
    float dayMix = 1.0 / (1.0 + exp(-15.0 * cosAngle));

    // ── Twilight: Rayleigh Scattering xấp xỉ ─────────────────────────────
    // Dải cam-đỏ ôm sát đường ranh giới sáng/tối
    // Ánh sáng xanh bị tán xạ mạnh nhất (mất trước), đỏ tồn tại lâu nhất
    float twiZone = smoothstep(-0.28, 0.28, cosAngle)
                  - smoothstep( 0.05, 0.55, cosAngle);
    vec3 twilightColor = vec3(
      clamp(twiZone * 1.00, 0.0, 1.0),   // Đỏ  – sống sót lâu nhất
      clamp(twiZone * 0.50, 0.0, 1.0),   // Xanh lục – suy giảm vừa
      clamp(twiZone * 0.18, 0.0, 1.0)    // Xanh lam – mất nhanh nhất
    ) * 0.90;

    // ── Ocean Specular Highlight (Phong model) ────────────────────────────
    // Ánh sáng Mặt Trời phản xạ trên mặt biển
    vec3  R    = reflect(-L, N);
    float spec = pow(max(0.0, dot(R, V)), 90.0); // Shininess cao = đốm sáng nhỏ, sắc

    // Ocean proxy: vùng tối trong day texture → biển (không có cây/sa mạc sáng)
    float lum      = dot(dayColor, vec3(0.299, 0.587, 0.114));
    float oceanMsk = clamp((0.55 - lum) * 2.2, 0.0, 1.0);
    vec3  specColor = vec3(0.60, 0.82, 1.0) * spec * oceanMsk * max(0.0, cosAngle);

    // ── Night City Lights ─────────────────────────────────────────────────
    // Tăng độ sáng và thêm màu ấm hơn (đèn vàng/trắng của đô thị)
    vec3 boostedNight = nightColor * 3.0 + vec3(0.022, 0.022, 0.048);

    // ── Composite Final ───────────────────────────────────────────────────
    gl_FragColor = vec4(
      mix(boostedNight, dayColor, dayMix) + twilightColor + specColor * 0.65,
      1.0
    );
  }
`

// ── Utilities ──────────────────────────────────────────────────────────────────
function latLonToXYZ(lat, lon, r) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

const CONTINENTS = [
  { name: 'Bắc Mỹ',     lat: 60, lon: -100 },
  { name: 'Châu Âu',    lat: 52, lon:   15 },
  { name: 'Đông Nam Á', lat:  5, lon:  115 },
]

function ContinentLabel({ name, lat, lon }) {
  const [hovered, setHovered] = useState(false)
  const hitPos  = useMemo(() => latLonToXYZ(lat, lon, 2.08), [lat, lon])
  const textPos = useMemo(() => latLonToXYZ(lat, lon, 2.55), [lat, lon])
  return (
    <group>
      <mesh
        position={hitPos}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>
      {hovered && (
        <Billboard position={textPos} follow={true}>
          <Text fontSize={0.13} color="#ffffff" outlineWidth={0.008} outlineColor="#000000">
            {name}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Earth({ speed = 1, sunWorldPosRef }) {
  const earthGroupRef = useRef()
  const cloudsRef     = useRef()

  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg',
  ])
  dayTex.colorSpace   = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace

  // Pre-allocated refs (không tạo object mới mỗi frame)
  const earthWorldPos = useRef(new THREE.Vector3())
  const sunDirWorld   = useRef(new THREE.Vector3())

  const earthUniforms = useMemo(() => ({
    uDayTexture:   { value: dayTex },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    if (earthGroupRef.current) earthGroupRef.current.rotation.y += delta * 0.05 * speed
    if (cloudsRef.current)     cloudsRef.current.rotation.y     += delta * 0.08 * speed

    // ── Cập nhật Sun Direction (world-space) ────────────────────────────────
    // Shader dùng world-space normals nên truyền world-space direction trực tiếp
    // (KHÔNG cần worldToLocal như trước – đơn giản và chính xác hơn)
    if (earthGroupRef.current && sunWorldPosRef?.current) {
      earthGroupRef.current.getWorldPosition(earthWorldPos.current)
      sunDirWorld.current
        .subVectors(sunWorldPosRef.current, earthWorldPos.current)
        .normalize()
      earthUniforms.uSunDirection.value.copy(sunDirWorld.current)
    }
  })

  return (
    <group>
      {/* Lớp bề mặt Trái Đất */}
      <group ref={earthGroupRef}>
        <mesh>
          <sphereGeometry args={[2, 64, 64]} />
          <shaderMaterial
            vertexShader={earthVertex}
            fragmentShader={earthFragment}
            uniforms={earthUniforms}
          />
        </mesh>
        {CONTINENTS.map(c => <ContinentLabel key={c.name} {...c} />)}
      </group>

      {/* Lớp mây */}
      <mesh ref={cloudsRef} scale={[1.012, 1.012, 1.012]}>
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial
          map={cloudsTex}
          alphaMap={cloudsTex}
          color="white"
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}