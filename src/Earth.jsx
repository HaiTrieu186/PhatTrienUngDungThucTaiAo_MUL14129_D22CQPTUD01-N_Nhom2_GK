import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import geoData from './continents.json'

// ── Vertex Shader ──
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

// ── Earth Shader ──
const earthFragment = /* glsl */`
  precision highp float;
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec3 uSunDirection;
  uniform vec3 uMoonWorldPos;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 day = texture2D(uDayTexture, vUv).rgb;
    vec3 night = texture2D(uNightTexture, vUv).rgb;
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uSunDirection);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float d = dot(N, L);
    float dayMix = smoothstep(-0.10, 0.40, d);
    float diffuse = max(0.0, d);
    vec3 dayLit = day * (diffuse + 0.04);
    float nightVis = clamp(-d * 2.5, 0.0, 1.0) * (1.0 - dayMix);
    vec3 cityLit = night * 2.6 + vec3(0.012, 0.012, 0.025);
    vec3 R = reflect(-L, N);
    float spec = pow(max(0.0, dot(R, V)), 150.0);
    float lum = dot(day, vec3(0.299, 0.587, 0.114));
    float ocean = clamp((0.48 - lum) * 3.0, 0.0, 1.0);
    vec3 specC = vec3(0.75, 0.88, 1.0) * spec * ocean * smoothstep(0.25, 0.65, diffuse) * 0.40;
    vec3 surface = mix(cityLit, dayLit, dayMix) + specC;
    float moonShadow = 0.0;
    {
      vec3 toMoon = uMoonWorldPos - vWorldPos;
      float proj = dot(toMoon, normalize(uSunDirection));
      if (proj > 0.1) {
        float perpDist = length(toMoon - normalize(uSunDirection) * proj);
        moonShadow = smoothstep(0.54 * 1.6, 0.54 * 0.25, perpDist) * smoothstep(0.0, 0.25, d);
      }
    }
    gl_FragColor = vec4(surface * (1.0 - moonShadow * 0.90), 1.0);
  }
`

// ── Cloud Shader (Mây đêm sáng & rõ) ──
const cloudFragment = /* glsl */`
  precision highp float;
  uniform sampler2D uCloudsTexture;
  uniform vec3 uSunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
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

    gl_FragColor = vec4(cloudColor, finalAlpha);
  }
`

function latLonToXYZ(lat, lon, r) {
  const phi = (90 - lat) * (Math.PI / 180)
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

// ── Continent Label Component ──
function ContinentLabel({ name, lat, lon, area, population, fact, activeId, setActiveId }) {
  const isSelected = activeId === name
  const [hovered, setHovered] = useState(false)

  // Cải tiến: Tăng bán kính namePos và cardPos lên một chút để tránh lún ở 2 đầu cực (lat 88/-88)
  const hitPos = useMemo(() => latLonToXYZ(lat, lon, 2.05), [lat, lon])
  const namePos = useMemo(() => latLonToXYZ(lat, lon, 2.6), [lat, lon]) 
  const cardPos = useMemo(() => latLonToXYZ(lat, lon, 3.4), [lat, lon])

  const factLines = useMemo(() => {
    if (!fact) return []
    const words = fact.split(' ')
    const lines = []
    let currentLine = ''
    words.forEach(word => {
      if ((currentLine + word).length > 35) { lines.push(currentLine.trim()); currentLine = word + ' ' }
      else { currentLine += word + ' ' }
    })
    lines.push(currentLine.trim()); return lines
  }, [fact])

  return (
    <group>
      {/* UX SNAPPING: Mesh tàng hình rộng (0.4) để dễ click trong VR */}
      <mesh 
        position={hitPos}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false) }}
        onClick={(e) => { 
          e.stopPropagation() 
          setActiveId(isSelected ? null : name) 
        }}
      >
        <sphereGeometry args={[0.45, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* HUD Reticle hiện tại tâm pin khi hover vùng snapping */}
      {hovered && !isSelected && (
        <Billboard position={hitPos} follow>
          <Text position={[-0.15, 0.15, 0.01]} fontSize={0.1} color="#facc15">[</Text>
          <Text position={[0.15, 0.15, 0.01]} fontSize={0.1} color="#facc15">]</Text>
          <Text position={[-0.15, -0.15, 0.01]} fontSize={0.1} color="#facc15">[</Text>
          <Text position={[0.15, -0.15, 0.01]} fontSize={0.1} color="#facc15">]</Text>
        </Billboard>
      )}

      {/* Tên lục địa khi hover */}
      {hovered && !isSelected && (
        <Billboard position={namePos} follow>
          <Text 
            fontSize={0.12} 
            color="white" 
            anchorX="center" 
            fontWeight="bold"
            outlineWidth={0.012}
            outlineColor="#020617"
          >
            {name.toUpperCase()}
          </Text>
        </Billboard>
      )}

      {/* Info Card */}
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
            <Text fontSize={0.14} color="#facc15" anchorX="left" fontWeight="bold">{name.toUpperCase()}</Text>
            <group position={[0, -0.2, 0]}>
              <Text fontSize={0.06} color="#94a3b8" anchorX="left">DIỆN TÍCH</Text>
              <Text fontSize={0.08} color="#f8fafc" position={[0, -0.07, 0]} anchorX="left">{area ? area.toLocaleString() : 'N/A'} km²</Text>
            </group>
            <group position={[0.9, -0.2, 0]}>
              <Text fontSize={0.06} color="#94a3b8" anchorX="left">DÂN SỐ</Text>
              <Text fontSize={0.08} color="#f8fafc" position={[0, -0.07, 0]} anchorX="left">{formatNum(population)}</Text>
            </group>
            <group position={[0, -0.45, 0]}>
              <Text fontSize={0.06} color="#3b82f6" anchorX="left" fontStyle="italic">INFO</Text>
              {factLines.map((line, i) => (
                <Text key={i} fontSize={0.065} color="#cbd5e1" position={[0, -0.08 - (i * 0.08), 0]} anchorX="left">{line}</Text>
              ))}
            </group>
          </group>
        </Billboard>
      )}
    </group>
  )
}

function CloudLayer({ cloudsTex, sunWorldPosRef, speed }) {
  const meshRef = useRef()
  const cloudWorldPos = useRef(new THREE.Vector3())
  const cloudUniforms = useMemo(() => ({
    uCloudsTexture: { value: cloudsTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [cloudsTex])

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.006 * speed
    if (meshRef.current && sunWorldPosRef?.current) {
      meshRef.current.getWorldPosition(cloudWorldPos.current)
      cloudUniforms.uSunDirection.value.copy(
        new THREE.Vector3().subVectors(sunWorldPosRef.current, cloudWorldPos.current).normalize()
      )
    }
  })

  return (
    <mesh ref={meshRef} renderOrder={2}>
      <sphereGeometry args={[2.015, 64, 64]} />
      <shaderMaterial vertexShader={earthVertex} fragmentShader={cloudFragment} uniforms={cloudUniforms} transparent depthWrite={false} />
    </mesh>
  )
}

export default function Earth({ speed = 1, sunWorldPosRef, moonWorldPosRef }) {
  const earthGroupRef = useRef()
  const [activeId, setActiveId] = useState(null)

  const [dayTex, nightTex, cloudsTex] = useTexture(['/textures/day.jpg', '/textures/night.jpg', '/textures/clouds.jpg'])
  dayTex.colorSpace = nightTex.colorSpace = THREE.SRGBColorSpace

  const earthUniforms = useMemo(() => ({
    uDayTexture: { value: dayTex },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
    uMoonWorldPos: { value: new THREE.Vector3(0, 8, 0) },
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    if (earthGroupRef.current) earthGroupRef.current.rotation.y += delta * 0.05 * speed
    if (sunWorldPosRef?.current) {
        const earthPos = new THREE.Vector3()
        earthGroupRef.current.getWorldPosition(earthPos)
        earthUniforms.uSunDirection.value.subVectors(sunWorldPosRef.current, earthPos).normalize()
    }
    if (moonWorldPosRef?.current) earthUniforms.uMoonWorldPos.value.copy(moonWorldPosRef.current)
  })

  return (
    <group ref={earthGroupRef}>
      {/* Bấm vào quả đất để đóng card đang mở */}
      <mesh onClick={() => setActiveId(null)}>
        <sphereGeometry args={[2, 64, 64]} />
        <shaderMaterial vertexShader={earthVertex} fragmentShader={earthFragment} uniforms={earthUniforms} />
      </mesh>

      <CloudLayer cloudsTex={cloudsTex} sunWorldPosRef={sunWorldPosRef} speed={speed} />
      
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