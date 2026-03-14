import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'

const earthVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const earthFragment = `
  precision mediump float;
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec3 uSunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 dayColor   = texture2D(uDayTexture,   vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;
    vec3 normal  = normalize(vNormal);
    vec3 sunDir  = normalize(uSunDirection);

    float sunOrientation = dot(normal, sunDir);
    float dayMix = smoothstep(-0.25, 0.25, sunOrientation);

    float twilight = smoothstep(-0.25, 0.25, sunOrientation)
                   - smoothstep(0.0,   0.5,  sunOrientation);
    vec3 twilightColor = vec3(1.0, 0.4, 0.1) * twilight * 0.6;

    // Tăng độ sáng ánh đèn đô thị ban đêm
    vec3 boostedNight = nightColor * 2.8 + vec3(0.03, 0.03, 0.05);

    vec3 finalColor = mix(boostedNight, dayColor, dayMix) + twilightColor;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

const SEASON_SUN_WORLD = {
  spring: new THREE.Vector3(-1, 0,  0),
  summer: new THREE.Vector3( 0, 0, -1),
  autumn: new THREE.Vector3( 1, 0,  0),
  winter: new THREE.Vector3( 0, 0,  1),
}

// Công thức chuẩn cho Three.js SphereGeometry
// phi  = colatitude (90 - lat) → đúng trục Y của Three.js
// theta = (lon + 180) → đúng hướng wrap texture
function latLonToXYZ(lat, lon, r) {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

const CONTINENTS = [
  // Châu Mỹ
  { name: 'Bắc Mỹ',        lat:  60,  lon: -100 },
  { name: 'Trung Mỹ',      lat:  15,  lon:  -85 },
  { name: 'Nam Mỹ',        lat: -15,  lon:  -55 },

  // Châu Âu
  { name: 'Châu Âu',       lat:  52,  lon:   15 },

  // Trung Đông
  { name: 'Trung Đông',    lat:  28,  lon:   45 },

  // Châu Á
  { name: 'Bắc Á',         lat:  65,  lon:  100 },
  { name: 'Trung Á',       lat:  45,  lon:   65 },
  { name: 'Nam Á',         lat:  20,  lon:   78 },
  { name: 'Đông Á',        lat:  35,  lon:  115 },
  { name: 'Đông Nam Á',    lat:   5,  lon:  115 },

  // Châu Phi
  { name: 'Bắc Phi',       lat:  25,  lon:   20 },
  { name: 'Trung Phi',     lat:   0,  lon:   22 },
  { name: 'Nam Phi',       lat: -28,  lon:   25 },

  // Châu Đại Dương
  { name: 'Châu Đại Dương', lat: -25, lon:  135 },

  // Cực
  { name: 'Bắc Cực',       lat:  88,  lon:    0 },
  { name: 'Nam Cực',       lat: -88,  lon:    0 },
]

function ContinentLabel({ name, lat, lon }) {
  const [hovered, setHovered] = useState(false)

  const hitPos  = useMemo(() => latLonToXYZ(lat, lon, 2.08), [lat, lon])
  const textPos = useMemo(() => latLonToXYZ(lat, lon, 2.55), [lat, lon])

  return (
    <group>
      {/* Vùng hit luôn tồn tại */}
      <mesh
        position={hitPos}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true)  }}
        onPointerOut={(e)  => { e.stopPropagation(); setHovered(false) }}
      >
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>

      {/* Chỉ render khi hover */}
      {hovered && (
        <Billboard position={textPos} follow={true}>
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[0.75, 0.24]} />
            <meshBasicMaterial
              color="#000000"
              transparent
              opacity={0.6}
              depthWrite={false}
            />
          </mesh>
          <Text
            fontSize={0.13}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.008}
            outlineColor="#000000"
          >
            {name}
          </Text>
        </Billboard>
      )}
    </group>
  )
}


export default function Earth({ speed = 1, season = 'summer' }) {
  const earthGroupRef = useRef()
  const cloudsRef     = useRef()

  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg',
  ])

  dayTex.colorSpace   = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace

  const worldSunDir = useRef(SEASON_SUN_WORLD.summer.clone())
  const localSunDir = useRef(new THREE.Vector3())

  const earthUniforms = useMemo(() => ({
    uDayTexture:   { value: dayTex },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    if (earthGroupRef.current) earthGroupRef.current.rotation.y += delta * 0.05 * speed
    if (cloudsRef.current)     cloudsRef.current.rotation.y     += delta * 0.08 * speed

    worldSunDir.current.lerp(SEASON_SUN_WORLD[season], delta * 1.2).normalize()

    if (earthGroupRef.current) {
      localSunDir.current.copy(worldSunDir.current)
      earthGroupRef.current.worldToLocal(localSunDir.current)
      localSunDir.current.normalize()
      earthUniforms.uSunDirection.value.copy(localSunDir.current)
    }
  })

  return (
    <group>
      {/* Sphere + nhãn cùng quay */}
      <group ref={earthGroupRef}>
        <mesh>
          <sphereGeometry args={[2, 64, 64]} />
          <shaderMaterial
            vertexShader={earthVertex}
            fragmentShader={earthFragment}
            uniforms={earthUniforms}
          />
        </mesh>

        {CONTINENTS.map(c => (
          <ContinentLabel key={c.name} {...c} />
        ))}
      </group>

      {/* Mây quay độc lập */}
      <mesh ref={cloudsRef} scale={[1.012, 1.012, 1.012]}>
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial
          map={cloudsTex}
          alphaMap={cloudsTex}
          color="white"
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}