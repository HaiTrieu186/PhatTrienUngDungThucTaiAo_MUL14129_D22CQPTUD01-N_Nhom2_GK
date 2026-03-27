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
// THAY ĐỔI: Thay moonShadow (xấp xỉ) bằng Angular Disc Intersection
// chính xác pixel-perfect cho hiệu ứng nhật thực với umbra + penumbra.
//
// Công thức: Tính tỉ lệ diện tích đĩa Mặt Trời bị đĩa Mặt Trăng che
// từ góc nhìn của từng điểm trên bề mặt Trái Đất.
//   θs  = bán kính góc biểu kiến của Mặt Trời
//   θm  = bán kính góc biểu kiến của Mặt Trăng
//   θsm = khoảng cách góc biểu kiến giữa 2 tâm
// → Circle-circle intersection area / Sun disc area = tỉ lệ che khuất
const earthFragment = /* glsl */`
  precision highp float;
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec3 uSunDirection;
  uniform vec3 uSunWorldPos;
  uniform vec3 uMoonWorldPos;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 day   = texture2D(uDayTexture,   vUv).rgb;
    vec3 night = texture2D(uNightTexture, vUv).rgb;
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);

    // Day/night blending
    float dayMix = smoothstep(-0.10, 0.40, d);
    float diffuse = max(0.0, d);
    vec3 dayLit  = day * (diffuse + 0.04);
    vec3 cityLit = night * 2.6 + vec3(0.012, 0.012, 0.025);

    // Ocean specular highlight
    vec3 R = reflect(-L, N);
    float spec  = pow(max(0.0, dot(R, V)), 150.0);
    float lum   = dot(day, vec3(0.299, 0.587, 0.114));
    float ocean = clamp((0.48 - lum) * 3.0, 0.0, 1.0);
    vec3 specC  = vec3(0.75, 0.88, 1.0) * spec * ocean
                  * smoothstep(0.25, 0.65, diffuse) * 0.40;

    vec3 surface = mix(cityLit, dayLit, dayMix) + specC;

    // ── Nhật Thực: Angular Disc Intersection ─────────────────────────────────
    // Tính tỉ lệ đĩa Mặt Trời bị Mặt Trăng che khuất nhìn từ mỗi điểm bề mặt.
    // Hoàn toàn trong Fragment Shader → pixel-perfect, 0 draw call, VR-safe.
    float eclipseShadow = 0.0;
    {
      vec3 toSun  = normalize(uSunDirection);
      vec3 moonVec = uMoonWorldPos - vWorldPos;
      float dMe   = length(moonVec);
      vec3 toMoon = moonVec / dMe;
      float dSe   = length(uSunWorldPos - vWorldPos);

      // Bán kính góc biểu kiến (radians) của Mặt Trời và Mặt Trăng
      // nhìn từ điểm bề mặt hiện tại
      float thetaS  = 16.9 / dSe;   // SUN_RADIUS / dist_surface_to_sun
      float thetaM  = 0.54 / dMe;   // MOON_RADIUS / dist_surface_to_moon

      // Góc phân cách giữa tâm hai thiên thể
      float cosSM   = clamp(dot(toSun, toMoon), -1.0, 1.0);
      float thetaSM = acos(cosSM);

      // Điều kiện: Mặt Trăng phải nằm giữa bề mặt và Mặt Trời,
      // và hai đĩa thiên thể phải giao nhau
      if (dot(toMoon, toSun) > 0.0 && thetaSM < thetaS + thetaM) {
        float overlap;
        if (thetaSM <= abs(thetaM - thetaS)) {
          // Nhật thực toàn phần (Mặt Trăng che hoàn toàn) hoặc hình khuyên
          float r = thetaM / thetaS;
          overlap = min(1.0, r * r);
        } else {
          // Nhật thực một phần — công thức giao nhau 2 đường tròn
          float cosA = (thetaSM*thetaSM + thetaS*thetaS - thetaM*thetaM)
                        / (2.0 * thetaSM * thetaS);
          float cosB = (thetaSM*thetaSM + thetaM*thetaM - thetaS*thetaS)
                        / (2.0 * thetaSM * thetaM);
          float A = thetaS*thetaS * acos(clamp(cosA, -1.0, 1.0));
          float B = thetaM*thetaM * acos(clamp(cosB, -1.0, 1.0));
          // Diện tích tam giác (Heron's formula)
          float det = (-thetaSM+thetaS+thetaM) * (thetaSM+thetaS-thetaM)
                    * (thetaSM-thetaS+thetaM) * (thetaSM+thetaS+thetaM);
          float intersectArea = A + B - 0.5 * sqrt(max(0.0, det));
          float sunArea = 3.14159265 * thetaS * thetaS;
          overlap = clamp(intersectArea / sunArea, 0.0, 1.0);
        }
        // Chỉ tối ở phần bề mặt đang nhận ánh sáng Mặt Trời
        eclipseShadow = overlap * smoothstep(-0.05, 0.15, d);
      }
    }

    gl_FragColor = vec4(surface * (1.0 - eclipseShadow * 0.94), 1.0);
  }
`

// ── Cloud Fragment Shader ─────────────────────────────────────────────────────
// THAY ĐỔI: Thêm eclipse shadow cho mây (cùng công thức angular disc)
// → mây cũng tối đi khi nhật thực xảy ra, tạo hiệu ứng nhất quán
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

    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunDirection);
    float d = dot(N, L);

    float cloudLit = smoothstep(-0.1, 0.40, d);
    float twi = max(0.0, smoothstep(-0.25, 0.05, d) - smoothstep(0.05, 0.4, d));

    vec3 cloudWhite = vec3(0.88, 0.90, 0.93);
    vec3 cloudWarm  = vec3(0.85, 0.68, 0.48);
    vec3 cloudNight = vec3(0.08, 0.12, 0.22);

    vec3 cloudColor = mix(cloudNight, mix(cloudWhite, cloudWarm, twi), cloudLit);
    float finalAlpha = cloud * mix(0.48, 0.78, cloudLit);

    // ── Eclipse shadow trên mây (cùng angular disc formula) ──────────────────
    float eclipseShadow = 0.0;
    {
      vec3 toSun   = normalize(uSunDirection);
      vec3 moonVec = uMoonWorldPos - vWorldPos;
      float dMe    = length(moonVec);
      vec3 toMoon  = moonVec / dMe;
      float dSe    = length(uSunWorldPos - vWorldPos);
      float thetaS  = 16.9 / dSe;
      float thetaM  = 0.54 / dMe;
      float thetaSM = acos(clamp(dot(toSun, toMoon), -1.0, 1.0));

      if (dot(toMoon, toSun) > 0.0 && thetaSM < thetaS + thetaM) {
        float overlap;
        if (thetaSM <= abs(thetaM - thetaS)) {
          float r = thetaM / thetaS;
          overlap = min(1.0, r * r);
        } else {
          float cosA = (thetaSM*thetaSM + thetaS*thetaS - thetaM*thetaM)
                        / (2.0*thetaSM*thetaS);
          float cosB = (thetaSM*thetaSM + thetaM*thetaM - thetaS*thetaS)
                        / (2.0*thetaSM*thetaM);
          float A = thetaS*thetaS * acos(clamp(cosA, -1.0, 1.0));
          float B = thetaM*thetaM * acos(clamp(cosB, -1.0, 1.0));
          float det = (-thetaSM+thetaS+thetaM)*(thetaSM+thetaS-thetaM)
                    * (thetaSM-thetaS+thetaM)*(thetaSM+thetaS+thetaM);
          float intersectArea = A + B - 0.5*sqrt(max(0.0, det));
          overlap = clamp(intersectArea/(3.14159265*thetaS*thetaS), 0.0, 1.0);
        }
        eclipseShadow = overlap * smoothstep(-0.05, 0.15, d);
      }
    }
    // Mây tối màu + giảm alpha nhẹ khi bị che bóng
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

// ── Continent Label Component ─────────────────────────────────────────────────
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

// ── Cloud Layer ───────────────────────────────────────────────────────────────
// THAY ĐỔI: Nhận thêm moonWorldPosRef để cập nhật eclipse uniforms cho shader mây
function CloudLayer({ cloudsTex, sunWorldPosRef, moonWorldPosRef, speed }) {
  const meshRef      = useRef()
  const cloudWorldPos = useRef(new THREE.Vector3())

  const cloudUniforms = useMemo(() => ({
    uCloudsTexture: { value: cloudsTex },
    uSunDirection:  { value: new THREE.Vector3(0, 0, -1) },
    uSunWorldPos:   { value: new THREE.Vector3(0, 0, -250) }, // thêm mới
    uMoonWorldPos:  { value: new THREE.Vector3(0, 8, 0) },   // thêm mới
  }), [cloudsTex])

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.006 * speed

    if (meshRef.current && sunWorldPosRef?.current) {
      meshRef.current.getWorldPosition(cloudWorldPos.current)
      cloudUniforms.uSunDirection.value.copy(
        new THREE.Vector3()
          .subVectors(sunWorldPosRef.current, cloudWorldPos.current)
          .normalize()
      )
      // Cập nhật vị trí thực của Mặt Trời cho eclipse calculation
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

  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg'
  ], ([d, n]) => {
    d.colorSpace = n.colorSpace = THREE.SRGBColorSpace
  })

  // THAY ĐỔI: Thêm uSunWorldPos vào uniforms để shader tính bán kính góc Mặt Trời
  const earthUniforms = useMemo(() => ({
    uDayTexture:   { value: dayTex },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
    uSunWorldPos:  { value: new THREE.Vector3(0, 0, -250) }, // thêm mới
    uMoonWorldPos: { value: new THREE.Vector3(0, 8, 0) },
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    if (earthGroupRef.current) {
      earthGroupRef.current.rotation.y += delta * 0.05 * speed
    }

    if (sunWorldPosRef?.current) {
      const earthPos = new THREE.Vector3()
      earthGroupRef.current.getWorldPosition(earthPos)
      // Hướng Mặt Trời từ tâm Trái Đất
      earthUniforms.uSunDirection.value
        .subVectors(sunWorldPosRef.current, earthPos)
        .normalize()
      // Vị trí thực của Mặt Trời (dùng cho tính bán kính góc biểu kiến trong shader)
      earthUniforms.uSunWorldPos.value.copy(sunWorldPosRef.current)
    }

    if (moonWorldPosRef?.current) {
      earthUniforms.uMoonWorldPos.value.copy(moonWorldPosRef.current)
    }
  })

  return (
    <group ref={earthGroupRef}>
      {/* Bấm vào quả đất để đóng card đang mở */}
      <mesh castShadow onClick={() => setActiveId(null)}>
        <sphereGeometry args={[2, 64, 64]} />
        <shaderMaterial
          vertexShader={earthVertex}
          fragmentShader={earthFragment}
          uniforms={earthUniforms}
        />
      </mesh>

      {/* THAY ĐỔI: Truyền moonWorldPosRef vào CloudLayer */}
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