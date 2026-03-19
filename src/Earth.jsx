import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'

const earthVertex = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vUv       = uv;
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = wPos.xyz;
    vNormal   = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const earthFragment = /* glsl */`
  precision highp float;

  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform sampler2D uCloudsTexture;
  uniform vec3      uSunDirection;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3  day    = texture2D(uDayTexture,    vUv).rgb;
    vec3  night  = texture2D(uNightTexture,  vUv).rgb;
    float cloud  = texture2D(uCloudsTexture, vUv).r;

    vec3  N = normalize(vNormal);
    vec3  L = normalize(uSunDirection);
    vec3  V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L); // -1 đêm → +1 trưa

    // ── 1. Day/Night blend – mềm tự nhiên ─────────────────────────────────
    // Ánh sáng bắt đầu xuất hiện nhẹ từ d=-0.1 đến d=0.4
    float dayMix = smoothstep(-0.10, 0.40, d);

    // ── 2. Lambert diffuse – ánh sáng mặt trời thuần túy ──────────────────
    // KHÔNG có màu cam trên bề mặt đất, chỉ là sáng/tối thuần
    float diffuse = max(0.0, d);

    // Slight atmosphere scatter: màu ngày hơi ấm khi d cao (trưa), xanh hơn khi thấp
    // Rất nhẹ, không bùng cam
    float warmth     = smoothstep(0.0, 1.0, diffuse) * 0.06;
    vec3  dayLit     = day * (diffuse + 0.04); // 0.04 = ambient nhẹ
    // Chỉ thêm một chút ấm rất nhẹ ở vùng trưa (không phải cam, chỉ làm màu "sống")
    dayLit = mix(dayLit, dayLit * vec3(1.04, 1.01, 0.97), warmth);

    // ── 3. Đèn thành phố đêm ──────────────────────────────────────────────
    // Chỉ hiện khi thực sự tối
    float nightVis = clamp(-d * 2.5, 0.0, 1.0) * (1.0 - dayMix);
    vec3  cityLit  = night * 2.6 + vec3(0.012, 0.012, 0.025);

    // ── 4. Ocean specular – tinh tế ────────────────────────────────────────
    vec3  R      = reflect(-L, N);
    float spec   = pow(max(0.0, dot(R, V)), 150.0);
    float lum    = dot(day, vec3(0.299, 0.587, 0.114));
    float ocean  = clamp((0.48 - lum) * 3.0, 0.0, 1.0);
    float specOn = smoothstep(0.25, 0.65, diffuse);
    vec3  specC  = vec3(0.75, 0.88, 1.0) * spec * ocean * specOn * 0.40;

    // ── 5. Surface composite – KHÔNG có viền cam ──────────────────────────
    vec3 surface = mix(cityLit, dayLit, dayMix) + specC;

    // ── 6. Cloud layer ─────────────────────────────────────────────────────
    // Mây được chiếu sáng độc lập (không dùng Three.js lighting)
    float cloudLit = smoothstep(-0.05, 0.40, d);

    // Màu mây:
    // - Ban ngày: trắng lạnh (hơi xám nhẹ như thực tế)
    // - Hoàng hôn / bình minh: ĐÂY mới là chỗ duy nhất có warm tint
    //   nhưng rất nhẹ, chỉ trên mây, không phải bề mặt đất
    // - Ban đêm: tối gần đen
    float twi = max(0.0,
      smoothstep(-0.20, 0.02, d) - smoothstep(0.02, 0.35, d)
    );

    vec3 cloudWhite = vec3(0.88, 0.90, 0.93);   // Trắng xám tự nhiên
    vec3 cloudWarm  = vec3(0.85, 0.68, 0.48);   // Ấm cam nhạt CHỈ trên mây
    vec3 cloudDark  = vec3(0.018, 0.018, 0.022);// Đêm

    // Blend: đêm → ngày (trắng với một chút ấm ở terminator)
    vec3 cloudColor = mix(cloudDark, mix(cloudWhite, cloudWarm, twi * 0.50), cloudLit);

    // ── 7. Final composite ─────────────────────────────────────────────────
    vec3 final = mix(surface, cloudColor, cloud * 0.70);
    gl_FragColor = vec4(final, 1.0);
  }
`

// ── Helpers ────────────────────────────────────────────────────────────────────
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
  { name: 'Bắc Mỹ',     lat: 48, lon: -100 },
  { name: 'Châu Âu',    lat: 50, lon:   15 },
  { name: 'Đông Nam Á', lat:  8, lon:  115 },
]

function ContinentLabel({ name, lat, lon }) {
  const [hovered, setHovered] = useState(false)
  const hitPos  = useMemo(() => latLonToXYZ(lat, lon, 2.35), [lat, lon])
  const textPos = useMemo(() => latLonToXYZ(lat, lon, 2.75), [lat, lon])

  return (
    <group>
      <mesh
        position={hitPos}
        onPointerOver={e => { e.stopPropagation(); setHovered(true)  }}
        onPointerOut={e  => { e.stopPropagation(); setHovered(false) }}
      >
        <sphereGeometry args={[0.35, 8, 8]} />
        <meshBasicMaterial color="white" visible={false} />
      </mesh>
      {hovered && (
        <Billboard position={textPos} follow={true}>
          <Text fontSize={0.15} color="#ffffff" outlineWidth={0.01} outlineColor="#000000"
            anchorX="center" anchorY="middle">
            {name}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

export default function Earth({ speed = 1, sunWorldPosRef }) {
  const earthGroupRef = useRef()

  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg',
  ])
  dayTex.colorSpace   = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace

  const earthWorldPos = useRef(new THREE.Vector3())
  const sunDirWorld   = useRef(new THREE.Vector3())

  const earthUniforms = useMemo(() => ({
    uDayTexture:    { value: dayTex    },
    uNightTexture:  { value: nightTex  },
    uCloudsTexture: { value: cloudsTex },
    uSunDirection:  { value: new THREE.Vector3(0, 0, -1) },
  }), [dayTex, nightTex, cloudsTex])

  useFrame((_, delta) => {
    if (earthGroupRef.current) earthGroupRef.current.rotation.y += delta * 0.05 * speed

    if (earthGroupRef.current && sunWorldPosRef?.current) {
      earthGroupRef.current.getWorldPosition(earthWorldPos.current)
      sunDirWorld.current
        .subVectors(sunWorldPosRef.current, earthWorldPos.current)
        .normalize()
      earthUniforms.uSunDirection.value.copy(sunDirWorld.current)
    }
  })

  return (
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
  )
}