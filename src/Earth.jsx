import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import geoData from './continents.json'

// ── Vertex Shader ─────────────────────────────────────────────────────────────
const earthVertex = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = wPos.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ── Earth Fragment Shader ─────────────────────────────────────────────────────
//
//  1. NORMAL MAP  — Giả lập địa hình núi/biển nhấp nhô bằng Analytical TBN.
//     Không tốn vertex nào thêm, chi phí GPU cực nhỏ (2 cross + 1 normalize).
//
//  2. SPECULAR MAP — Dùng đúng texture trắng/đen của solarsystemscope để
//     xác định vùng biển (trắng = phản sáng) vs đất liền (đen = mờ).
//     Chính xác hơn hẳn cách đoán bằng luminance.
//
//  3. Eclipse logic GIỮ NGUYÊN 100% (Angular Disc Intersection pixel-perfect).
const earthFragment = /* glsl */`
  precision highp float;

  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform sampler2D uNormalMap;        // Normal Map địa hình
  uniform sampler2D uSpecularMap;      // Specular Map (trắng=biển, đen=đất)
  uniform float     uNormalStrength;   // Độ sâu địa hình, chỉnh 0.3–0.8
  uniform vec3      uSunDirection;
  uniform vec3      uSunWorldPos;
  uniform vec3      uMoonWorldPos;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 day   = texture2D(uDayTexture,   vUv).rgb;
    vec3 night = texture2D(uNightTexture, vUv).rgb;

    // ── 1. NORMAL MAP — Analytical TBN cho hình cầu ────────────────────────
    // Hình cầu equirectangular: tangent frame tính 100% từ geometric normal,
    // không cần attribute tangent nào thêm vào geometry.
    vec3 mapN  = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
    vec3 N_geo = normalize(vNormal);
    vec3 up    = abs(N_geo.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 T     = normalize(cross(up, N_geo));
    vec3 B     = cross(N_geo, T);

    // CÔNG THỨC ĐÚNG: normalize(vec3(xy * strength, z)) thay vì mix
    // → khi strength cao, normal nghiêng đúng hướng, không bị méo/artifact
    vec3 blendN = normalize(vec3(mapN.xy * uNormalStrength, mapN.z));
    mat3 TBN   = mat3(T, B, N_geo);
    vec3 N     = normalize(TBN * blendN);
    // ───────────────────────────────────────────────────────────────────────

    vec3  L = normalize(uSunDirection);
    vec3  V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);

    // Day/night blending
    float dayMix  = smoothstep(-0.10, 0.40, d);
    float diffuse = max(0.0, d);
    float diffuseContrast = pow(diffuse, 0.8);

    // ── 2. HEIGHT-BASED TERRAIN SHADING — hiện địa hình mọi góc nhìn ─────────
    //
    // Ý tưởng: length(mapN.xy) = độ dốc địa hình tại điểm đó
    //   → 0.0 = mặt phẳng (biển, đồng bằng)
    //   → 1.0 = vách núi dựng đứng (Himalaya, Andes)
    //
    // Dùng độ dốc để:
    //   1. "slope"  → tô màu vùng núi khác đồng bằng (bất kể góc nhìn)
    //   2. "peakAO" → giả lập AO: thung lũng tối hơn, đỉnh núi sáng hơn
    //   3. Kết hợp với oceanMask để không ảnh hưởng lên biển
    //
    // Hoàn toàn MIỄN PHÍ: tận dụng mapN đã sample, không cần texture thêm.
    // Chi phí GPU: 3–4 phép tính float → cực nhẹ, Quest 3 thoải mái.

    float oceanMask  = texture2D(uSpecularMap, vUv).r;
    float landMask   = 1.0 - oceanMask;  // 1.0 = đất liền, 0.0 = biển

    // Độ dốc: càng cao → càng là núi/cao nguyên
    float slope      = clamp(length(mapN.xy) * 1.4, 0.0, 1.0);

    // Tầng 1 — Micro-contrast: đỉnh núi sáng hơn, thung lũng tối hơn
    // Tạo cảm giác chiều sâu ngay cả khi ánh sáng chiếu thẳng
    float peakBright = slope * 0.18 * landMask;      // đỉnh núi sáng thêm
    float valleyDark = (1.0 - slope) * 0.06 * landMask; // thung lũng tối thêm
    float terrainAO  = 1.0 + peakBright - valleyDark;

    // Tầng 2 — Tint màu địa hình: núi cao → hơi xám/trắng (đá/tuyết)
    // Đất thấp → giữ màu texture gốc
    // Chỉ áp dụng cho đất liền, không chạm vào biển
    vec3 rockTint    = mix(vec3(1.0), vec3(0.92, 0.90, 0.88), slope * 0.35 * landMask);

    vec3 dayLit  = day * rockTint * terrainAO * (diffuseContrast * 1.1 + 0.03);
    vec3 cityLit = night * 2.6 + vec3(0.012, 0.012, 0.025);

    // ── 3. SPECULAR MAP — Ocean highlight ────────────────────────────────────
    vec3  R     = reflect(-L, N);
    float spec  = pow(max(0.0, dot(R, V)), 150.0);
    vec3  specC = vec3(0.75, 0.88, 1.0)
                  * spec * oceanMask
                  * smoothstep(0.25, 0.65, diffuse) * 0.45;
    // ───────────────────────────────────────────────────────────────────────

    vec3 surface = mix(cityLit, dayLit, dayMix) + specC;

    // ── 3. NHẬT THỰC — Angular Disc Intersection (GIỮ NGUYÊN) ────────────────
    float eclipseShadow = 0.0;
    {
      float d_geo  = dot(N_geo, L);
      vec3  toSun  = normalize(uSunDirection);
      vec3  moonVec = uMoonWorldPos - vWorldPos;
      float dMe    = length(moonVec);
      vec3  toMoon = moonVec / dMe;
      float dSe    = length(uSunWorldPos - vWorldPos);

      float thetaS  = 16.9 / dSe;
      float thetaM  = 0.54 / dMe;
      float cosSM   = clamp(dot(toSun, toMoon), -1.0, 1.0);
      float thetaSM = acos(cosSM);

      if (dot(toMoon, toSun) > 0.0 && thetaSM < thetaS + thetaM) {
        float overlap;
        if (thetaSM <= abs(thetaM - thetaS)) {
          float r = thetaM / thetaS;
          overlap = min(1.0, r * r);
        } else {
          float cosA   = (thetaSM*thetaSM + thetaS*thetaS - thetaM*thetaM)
                         / (2.0 * thetaSM * thetaS);
          float cosB   = (thetaSM*thetaSM + thetaM*thetaM - thetaS*thetaS)
                         / (2.0 * thetaSM * thetaM);
          float A      = thetaS*thetaS * acos(clamp(cosA, -1.0, 1.0));
          float B_area = thetaM*thetaM * acos(clamp(cosB, -1.0, 1.0));
          float det    = (-thetaSM+thetaS+thetaM) * (thetaSM+thetaS-thetaM)
                       * (thetaSM-thetaS+thetaM) * (thetaSM+thetaS+thetaM);
          float intersectArea = A + B_area - 0.5 * sqrt(max(0.0, det));
          overlap = clamp(intersectArea / (3.14159265 * thetaS * thetaS), 0.0, 1.0);
        }
        eclipseShadow = overlap * smoothstep(-0.05, 0.15, d_geo);
      }
    }

    gl_FragColor = vec4(surface * (1.0 - eclipseShadow * 0.94), 1.0);
  }
`

// ── Cloud Fragment Shader  ───────────────────────────────────────
const cloudFragment = /* glsl */`
  precision highp float;
  uniform sampler2D uCloudsTexture;
  uniform vec3 uSunDirection;
  uniform vec3 uSunWorldPos;
  uniform vec3 uMoonWorldPos;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    float cloud = texture2D(uCloudsTexture, vUv).r;
    if (cloud < 0.012) discard;

    vec3  N = normalize(vNormal);
    vec3  L = normalize(uSunDirection);
    float d = dot(N, L);

    float cloudLit = smoothstep(-0.1, 0.40, d);
    float twi = max(0.0, smoothstep(-0.25, 0.05, d) - smoothstep(0.05, 0.4, d));

    vec3 cloudWhite = vec3(0.88, 0.90, 0.93);
    vec3 cloudWarm  = vec3(0.85, 0.68, 0.48);
    vec3 cloudNight = vec3(0.08, 0.12, 0.22);

    vec3  cloudColor = mix(cloudNight, mix(cloudWhite, cloudWarm, twi), cloudLit);
    float finalAlpha = cloud * mix(0.48, 0.78, cloudLit);

    float eclipseShadow = 0.0;
    {
      vec3  toSun   = normalize(uSunDirection);
      vec3  moonVec = uMoonWorldPos - vWorldPos;
      float dMe     = length(moonVec);
      vec3  toMoon  = moonVec / dMe;
      float dSe     = length(uSunWorldPos - vWorldPos);
      float thetaS  = 16.9 / dSe;
      float thetaM  = 0.54 / dMe;
      float thetaSM = acos(clamp(dot(toSun, toMoon), -1.0, 1.0));

      if (dot(toMoon, toSun) > 0.0 && thetaSM < thetaS + thetaM) {
        float overlap;
        if (thetaSM <= abs(thetaM - thetaS)) {
          float r = thetaM / thetaS; overlap = min(1.0, r * r);
        } else {
          float cosA   = (thetaSM*thetaSM + thetaS*thetaS - thetaM*thetaM) / (2.0*thetaSM*thetaS);
          float cosB   = (thetaSM*thetaSM + thetaM*thetaM - thetaS*thetaS) / (2.0*thetaSM*thetaM);
          float A      = thetaS*thetaS * acos(clamp(cosA,-1.0,1.0));
          float B_area = thetaM*thetaM * acos(clamp(cosB,-1.0,1.0));
          float det    = (-thetaSM+thetaS+thetaM)*(thetaSM+thetaS-thetaM)
                       * (thetaSM-thetaS+thetaM)*(thetaSM+thetaS+thetaM);
          overlap = clamp((A+B_area-0.5*sqrt(max(0.0,det)))/(3.14159265*thetaS*thetaS),0.0,1.0);
        }
        eclipseShadow = overlap * smoothstep(-0.05, 0.15, d);
      }
    }
    cloudColor *= (1.0 - eclipseShadow * 0.92);
    finalAlpha  *= (1.0 - eclipseShadow * 0.12);

    gl_FragColor = vec4(cloudColor, finalAlpha);
  }
`

// ─────────────────────────────────────────────────────────────────────────────

function latLonToXYZ(lat, lon, r) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' triệu'
  return n.toLocaleString()
}

// ── Continent Label Component (GIỮ NGUYÊN) ───────────────────────────────────
function ContinentLabel({ name, lat, lon, area, population, fact, activeId, setActiveId }) {
  const isSelected = activeId === name
  const [hovered, setHovered] = useState(false)

  const hitPos  = useMemo(() => latLonToXYZ(lat, lon, 2.05), [lat, lon])
  const namePos = useMemo(() => latLonToXYZ(lat, lon, 2.6),  [lat, lon])
  const cardPos = useMemo(() => latLonToXYZ(lat, lon, 3.4),  [lat, lon])

  const factLines = useMemo(() => {
    if (!fact) return []
    const words = fact.split(' ')
    const lines = []
    let currentLine = ''
    words.forEach(word => {
      if ((currentLine + word).length > 35) { lines.push(currentLine.trim()); currentLine = word + ' ' }
      else { currentLine += word + ' ' }
    })
    lines.push(currentLine.trim())
    return lines
  }, [fact])

  return (
    <group>
      <mesh
        position={hitPos}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={(e)  => { e.stopPropagation(); setHovered(false) }}
        onClick={(e) => { e.stopPropagation(); setActiveId(isSelected ? null : name) }}
      >
        <sphereGeometry args={[0.45, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {hovered && !isSelected && (
        <Billboard position={hitPos} follow>
          <Text position={[-0.15,  0.15, 0.01]} fontSize={0.1} color="#facc15">[</Text>
          <Text position={[ 0.15,  0.15, 0.01]} fontSize={0.1} color="#facc15">]</Text>
          <Text position={[-0.15, -0.15, 0.01]} fontSize={0.1} color="#facc15">[</Text>
          <Text position={[ 0.15, -0.15, 0.01]} fontSize={0.1} color="#facc15">]</Text>
        </Billboard>
      )}

      {hovered && !isSelected && (
        <Billboard position={namePos} follow>
          <Text fontSize={0.12} color="white" anchorX="center" fontWeight="bold"
            outlineWidth={0.012} outlineColor="#020617">
            {name.toUpperCase()}
          </Text>
        </Billboard>
      )}

      {isSelected && (
        <Billboard position={cardPos} follow>
          <mesh>
            <planeGeometry args={[1.8, 0.9 + factLines.length * 0.08]} />
            <meshBasicMaterial color="#020617" transparent opacity={0.85} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[1.84, 0.94 + factLines.length * 0.08]} />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.3} depthWrite={false} />
          </mesh>
          <group position={[-0.8, 0.35 + (factLines.length * 0.04), 0.01]}>
            <Text fontSize={0.14} color="#facc15" anchorX="left" fontWeight="bold">
              {name.toUpperCase()}
            </Text>
            <group position={[0, -0.2, 0]}>
              <Text fontSize={0.06} color="#94a3b8" anchorX="left">DIỆN TÍCH</Text>
              <Text fontSize={0.08} color="#f8fafc" position={[0, -0.07, 0]} anchorX="left">
                {area ? area.toLocaleString() : 'N/A'} km²
              </Text>
            </group>
            <group position={[0.9, -0.2, 0]}>
              <Text fontSize={0.06} color="#94a3b8" anchorX="left">DÂN SỐ</Text>
              <Text fontSize={0.08} color="#f8fafc" position={[0, -0.07, 0]} anchorX="left">
                {formatNum(population)}
              </Text>
            </group>
            <group position={[0, -0.45, 0]}>
              <Text fontSize={0.06} color="#3b82f6" anchorX="left" fontStyle="italic">INFO</Text>
              {factLines.map((line, i) => (
                <Text key={i} fontSize={0.065} color="#cbd5e1"
                  position={[0, -0.08 - (i * 0.08), 0]} anchorX="left">
                  {line}
                </Text>
              ))}
            </group>
          </group>
        </Billboard>
      )}
    </group>
  )
}

// ── Cloud Layer (GIỮ NGUYÊN) ──────────────────────────────────────────────────
function CloudLayer({ cloudsTex, sunWorldPosRef, moonWorldPosRef, speed }) {
  const meshRef       = useRef()
  const cloudWorldPos = useRef(new THREE.Vector3())

  const cloudUniforms = useMemo(() => ({
    uCloudsTexture: { value: cloudsTex },
    uSunDirection:  { value: new THREE.Vector3(0, 0, -1) },
    uSunWorldPos:   { value: new THREE.Vector3(0, 0, -250) },
    uMoonWorldPos:  { value: new THREE.Vector3(0, 8, 0) },
  }), [cloudsTex])

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.006 * speed

    if (meshRef.current && sunWorldPosRef?.current) {
      meshRef.current.getWorldPosition(cloudWorldPos.current)
      cloudUniforms.uSunDirection.value.copy(
        new THREE.Vector3().subVectors(sunWorldPosRef.current, cloudWorldPos.current).normalize()
      )
      cloudUniforms.uSunWorldPos.value.copy(sunWorldPosRef.current)
    }
    if (moonWorldPosRef?.current) {
      cloudUniforms.uMoonWorldPos.value.copy(moonWorldPosRef.current)
    }
  })

  return (
    <mesh ref={meshRef} renderOrder={2}>
      <sphereGeometry args={[2.015, 64, 64]} />
      <shaderMaterial
        vertexShader={earthVertex}
        fragmentShader={cloudFragment}
        uniforms={cloudUniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

// ── Earth Component ───────────────────────────────────────────────────────────
export default function Earth({ speed = 1, sunWorldPosRef, moonWorldPosRef }) {
  const earthGroupRef = useRef()
  const [activeId, setActiveId] = useState(null)

  // Load 5 textures: 3 cũ + 2 mới (Normal Map + Specular Map)
  // QUAN TRỌNG: normalTex và specularTex KHÔNG set SRGBColorSpace — phải để Linear!
  const [dayTex, nightTex, cloudsTex, normalTex, specularTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg',
    '/textures/earth_normal.jpg',     
    '/textures/earth_specular.jpg', 
  ], ([d, n]) => {
    d.colorSpace = n.colorSpace = THREE.SRGBColorSpace
    // normalTex, specularTex tự động là Linear — KHÔNG chỉnh colorSpace
  })

  const earthUniforms = useMemo(() => ({
    uDayTexture:     { value: dayTex },
    uNightTexture:   { value: nightTex },
    uNormalMap:      { value: normalTex },
    uSpecularMap:    { value: specularTex },
    uNormalStrength: { value: 3.5 },  // công thức mới: 2–5 là đẹp, không artifact
    uSunDirection:   { value: new THREE.Vector3(0, 0, -1) },
    uSunWorldPos:    { value: new THREE.Vector3(0, 0, -250) },
    uMoonWorldPos:   { value: new THREE.Vector3(0, 8, 0) },
  }), [dayTex, nightTex, normalTex, specularTex])

  useFrame((_, delta) => {
    if (earthGroupRef.current) {
      earthGroupRef.current.rotation.y += delta * 0.05 * speed
    }
    if (sunWorldPosRef?.current) {
      const earthPos = new THREE.Vector3()
      earthGroupRef.current.getWorldPosition(earthPos)
      earthUniforms.uSunDirection.value
        .subVectors(sunWorldPosRef.current, earthPos).normalize()
      earthUniforms.uSunWorldPos.value.copy(sunWorldPosRef.current)
    }
    if (moonWorldPosRef?.current) {
      earthUniforms.uMoonWorldPos.value.copy(moonWorldPosRef.current)
    }
  })

  return (
    <group ref={earthGroupRef}>
      <mesh castShadow onClick={() => setActiveId(null)}>
        <sphereGeometry args={[2, 64, 64]} />
        <shaderMaterial
          vertexShader={earthVertex}
          fragmentShader={earthFragment}
          uniforms={earthUniforms}
        />
      </mesh>

      <CloudLayer
        cloudsTex={cloudsTex}
        sunWorldPosRef={sunWorldPosRef}
        moonWorldPosRef={moonWorldPosRef}
        speed={speed}
      />

      {geoData.regions.map(c => (
        <ContinentLabel
          key={c.name}
          {...c}
          activeId={activeId}
          setActiveId={setActiveId}
        />
      ))}
    </group>
  )
}