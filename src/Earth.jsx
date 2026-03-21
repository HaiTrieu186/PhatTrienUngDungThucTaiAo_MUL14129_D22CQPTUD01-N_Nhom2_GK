import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'

// ── Vertex shader dùng chung cho cả Earth mesh lẫn Cloud mesh ────────────────
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

// ── Earth Fragment Shader ─────────────────────────────────────────────────────
// Thay đổi so với bản gốc:
//   - Bỏ uCloudsTexture (cloud đã tách ra CloudLayer riêng)
//   - Thêm uMoonWorldPos + tính bóng nguyệt thực bằng ray-sphere intersection
const earthFragment = /* glsl */`
  precision highp float;

  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec3      uSunDirection;
  uniform vec3      uMoonWorldPos;   // MỚI: vị trí world của Mặt Trăng

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3  day   = texture2D(uDayTexture,   vUv).rgb;
    vec3  night = texture2D(uNightTexture, vUv).rgb;

    vec3  N = normalize(vNormal);
    vec3  L = normalize(uSunDirection);
    vec3  V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L); // -1 đêm → +1 trưa

    // ── 1. Day/Night blend ──────────────────────────────────────────────────
    float dayMix = smoothstep(-0.10, 0.40, d);

    // ── 2. Lambert diffuse ──────────────────────────────────────────────────
    float diffuse = max(0.0, d);
    float warmth  = smoothstep(0.0, 1.0, diffuse) * 0.06;
    vec3  dayLit  = day * (diffuse + 0.04);
    dayLit = mix(dayLit, dayLit * vec3(1.04, 1.01, 0.97), warmth);

    // ── 3. Đèn thành phố đêm ───────────────────────────────────────────────
    float nightVis = clamp(-d * 2.5, 0.0, 1.0) * (1.0 - dayMix);
    vec3  cityLit  = night * 2.6 + vec3(0.012, 0.012, 0.025);

    // ── 4. Ocean specular ───────────────────────────────────────────────────
    vec3  R      = reflect(-L, N);
    float spec   = pow(max(0.0, dot(R, V)), 150.0);
    float lum    = dot(day, vec3(0.299, 0.587, 0.114));
    float ocean  = clamp((0.48 - lum) * 3.0, 0.0, 1.0);
    float specOn = smoothstep(0.25, 0.65, diffuse);
    vec3  specC  = vec3(0.75, 0.88, 1.0) * spec * ocean * specOn * 0.40;

    // ── 5. Surface composite ────────────────────────────────────────────────
    vec3 surface = mix(cityLit, dayLit, dayMix) + specC;

    // ── 6. Bóng Mặt Trăng (Nguyệt thực) ────────────────────────────────────
    // Phương pháp: ray-sphere intersection
    // - Ray xuất phát từ vWorldPos theo hướng Mặt Trời (uSunDirection)
    // - Kiểm tra ray này có đi qua hình cầu Mặt Trăng không
    // - Nếu có → pixel đang bị che bởi Mặt Trăng → tối đi
    // Không cần VSM hay shadow map → 0 draw call thêm → an toàn VR
    float moonShadow = 0.0;
    {
      vec3  sunDir_n = normalize(uSunDirection);

      // Vector từ surface point đến tâm Mặt Trăng
      vec3  toMoon = uMoonWorldPos - vWorldPos;

      // Chiếu toMoon lên trục Mặt Trời
      // proj > 0 nghĩa là Mặt Trăng nằm về phía Mặt Trời (có thể che)
      float proj = dot(toMoon, sunDir_n);

      if (proj > 0.1) {
        // Khoảng cách vuông góc từ tâm Mặt Trăng đến ray Mặt Trời
        vec3  perpVec  = toMoon - sunDir_n * proj;
        float perpDist = length(perpVec);

        float mR = 0.54; // MOON_RADIUS – khớp với Moon.jsx

        // Vùng bóng tối (umbra) mềm dần ra vùng nửa tối (penumbra)
        // smoothstep(mR*1.6, mR*0.25, perpDist):
        //   perpDist > mR*1.6 → shadow = 0  (bên ngoài bóng hoàn toàn)
        //   perpDist < mR*0.25 → shadow = 1 (trong umbra đen đặc)
        //   khoảng giữa       → gradient mềm (penumbra)
        float rawShadow = smoothstep(mR * 1.6, mR * 0.25, perpDist);

        // Chỉ áp dụng bóng trên mặt được chiếu sáng (tránh double-dark ở night side)
        moonShadow = rawShadow * smoothstep(0.0, 0.25, d);
      }
    }

    // ── 7. Final composite ──────────────────────────────────────────────────
    vec3 final = surface * (1.0 - moonShadow * 0.90);
    gl_FragColor = vec4(final, 1.0);
  }
`

// ── Cloud Layer Fragment Shader ───────────────────────────────────────────────
// Tách hoàn toàn khỏi Earth shader để cloud có:
//   - Chiều sâu riêng (parallax effect khi xoay góc nhìn)
//   - Vận tốc xoay riêng (gió toàn cầu)
//   - Hiệu ứng tán xạ Rayleigh ở terminator (màu cam bình minh/hoàng hôn)
const cloudFragment = /* glsl */`
  precision highp float;

  uniform sampler2D uCloudsTexture;
  uniform vec3      uSunDirection;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos; // khai báo cho khớp với vertex shader, không dùng

  void main() {
    float cloud = texture2D(uCloudsTexture, vUv).r;

    // Bỏ qua fragment hoàn toàn trong suốt → tiết kiệm GPU (quan trọng trên Quest 3)
    if (cloud < 0.012) discard;

    vec3  N = normalize(vNormal);
    vec3  L = normalize(uSunDirection);
    float d = dot(N, L);

    // Chiếu sáng mây độc lập với Earth
    float cloudLit = smoothstep(-0.05, 0.40, d);

    // Tán xạ Rayleigh: mây nhuốm cam đỏ ở vùng bình minh/hoàng hôn gần terminator
    // Chỉ xuất hiện trong dải hẹp quanh d ≈ 0 (đường ranh giới ngày/đêm)
    float twi = max(0.0,
      smoothstep(-0.20, 0.02, d) - smoothstep(0.02, 0.35, d)
    );

    vec3 cloudWhite = vec3(0.88, 0.90, 0.93);   // Ban ngày: trắng lạnh tự nhiên
    vec3 cloudWarm  = vec3(0.85, 0.68, 0.48);   // Terminator: cam nhạt (chỉ trên mây)
    vec3 cloudDark  = vec3(0.018, 0.018, 0.022);// Ban đêm: đen đặc

    vec3 cloudColor = mix(cloudDark, mix(cloudWhite, cloudWarm, twi * 0.55), cloudLit);

    gl_FragColor = vec4(cloudColor, cloud * 0.78);
  }
`

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  // Châu Mỹ
  { name: 'Bắc Mỹ',         lat:  52,  lon: -105 },
  { name: 'Trung Mỹ',       lat:  14,  lon:  -87 },
  { name: 'Nam Mỹ',         lat: -12,  lon:  -53 },
  // Châu Âu
  { name: 'Châu Âu',        lat:  50,  lon:   10 },
  // Trung Đông
  { name: 'Trung Đông',     lat:  26,  lon:   44 },
  // Châu Á
  { name: 'Bắc Á (Siberia)',lat:  62,  lon:  105 },
  { name: 'Trung Á',        lat:  43,  lon:   63 },
  { name: 'Nam Á',          lat:  22,  lon:   80 },
  { name: 'Đông Á',         lat:  36,  lon:  116 },
  { name: 'Đông Nam Á',     lat:   3,  lon:  113 },
  // Châu Phi
  { name: 'Bắc Phi',        lat:  22,  lon:   17 },
  { name: 'Trung Phi',      lat:   2,  lon:   24 },
  { name: 'Nam Phi',        lat: -29,  lon:   26 },
  // Châu Đại Dương
  { name: 'Châu Đại Dương', lat: -24,  lon:  134 },
  // Cực
  { name: 'Bắc Cực',        lat:  85,  lon:    0 },
  { name: 'Nam Cực',        lat: -85,  lon:    0 },
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

// ── Cloud Layer Component ─────────────────────────────────────────────────────
// Hình cầu mây riêng, bán kính 2.015 (lớn hơn Earth 0.75%)
// Lợi ích:
//   1. Parallax effect: mây có chiều sâu khi xoay góc nhìn
//   2. Vận tốc xoay khác Earth → mây "trôi" như gió thực tế
//   3. Shader riêng → chiếu sáng chính xác, màu cam ở terminator
function CloudLayer({ cloudsTex, sunWorldPosRef, speed }) {
  const meshRef       = useRef()
  const cloudWorldPos = useRef(new THREE.Vector3())
  const sunDirCloud   = useRef(new THREE.Vector3())

  const cloudUniforms = useMemo(() => ({
    uCloudsTexture: { value: cloudsTex },
    uSunDirection:  { value: new THREE.Vector3(0, 0, -1) },
  }), [cloudsTex])

  useFrame((_, delta) => {
    // Xoay cloud mesh thêm 0.006*speed ngoài rotation của earthGroupRef
    // Tổng tốc độ mây = 0.05 (Earth) + 0.006 = 0.056 → mây nhanh hơn ~12%
    // Tác dụng: mây trôi chậm qua các lục địa (hiệu ứng gió toàn cầu)
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.006 * speed

    // Cập nhật hướng Mặt Trời độc lập cho cloud shader
    if (meshRef.current && sunWorldPosRef?.current) {
      meshRef.current.getWorldPosition(cloudWorldPos.current)
      sunDirCloud.current
        .subVectors(sunWorldPosRef.current, cloudWorldPos.current)
        .normalize()
      cloudUniforms.uSunDirection.value.copy(sunDirCloud.current)
    }
  })

  return (
    // renderOrder={2}: đảm bảo cloud render SAU Earth (renderOrder=0 mặc định)
    // depthWrite={false}: tránh z-fighting và lỗi alpha sorting
    <mesh ref={meshRef} renderOrder={2}>
      <sphereGeometry args={[2.015, 64, 64]} />
      <shaderMaterial
        vertexShader={earthVertex}
        fragmentShader={cloudFragment}
        uniforms={cloudUniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}

// ── Earth Component ───────────────────────────────────────────────────────────
// moonWorldPosRef: prop MỚI, nhận từ App.jsx để tính bóng nguyệt thực
export default function Earth({ speed = 1, sunWorldPosRef, moonWorldPosRef }) {
  const earthGroupRef = useRef()

  // cloudsTex vẫn load ở đây nhưng truyền xuống CloudLayer thay vì earthUniforms
  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg',
  ])
  dayTex.colorSpace   = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace
  // cloudsTex KHÔNG set colorSpace vì nó là grayscale mask

  const earthWorldPos = useRef(new THREE.Vector3())
  const sunDirWorld   = useRef(new THREE.Vector3())

  // earthUniforms: bỏ uCloudsTexture, thêm uMoonWorldPos
  const earthUniforms = useMemo(() => ({
    uDayTexture:   { value: dayTex   },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
    uMoonWorldPos: { value: new THREE.Vector3(0, 8, 0)  }, // khởi tạo gần đúng
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    if (earthGroupRef.current) earthGroupRef.current.rotation.y += delta * 0.05 * speed

    // Cập nhật hướng Mặt Trời
    if (earthGroupRef.current && sunWorldPosRef?.current) {
      earthGroupRef.current.getWorldPosition(earthWorldPos.current)
      sunDirWorld.current
        .subVectors(sunWorldPosRef.current, earthWorldPos.current)
        .normalize()
      earthUniforms.uSunDirection.value.copy(sunDirWorld.current)
    }

    // MỚI: Cập nhật vị trí Mặt Trăng cho tính toán bóng trong shader
    // moonWorldPosRef được Moon.jsx ghi vào mỗi frame trước khi Earth đọc
    if (moonWorldPosRef?.current) {
      earthUniforms.uMoonWorldPos.value.copy(moonWorldPosRef.current)
    }
  })

  return (
    <group ref={earthGroupRef}>
      {/* Earth mesh – không có cloud, có bóng Mặt Trăng */}
      <mesh>
        <sphereGeometry args={[2, 64, 64]} />
        <shaderMaterial
          vertexShader={earthVertex}
          fragmentShader={earthFragment}
          uniforms={earthUniforms}
        />
      </mesh>

      {/* Cloud mesh – tách riêng, bán kính 2.015, có parallax và drift */}
      <CloudLayer
        cloudsTex={cloudsTex}
        sunWorldPosRef={sunWorldPosRef}
        speed={speed}
      />

      {/* Continent labels – không thay đổi */}
      {CONTINENTS.map(c => <ContinentLabel key={c.name} {...c} />)}
    </group>
  )
}