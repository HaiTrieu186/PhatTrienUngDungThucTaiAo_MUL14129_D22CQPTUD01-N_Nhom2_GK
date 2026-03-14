import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const earthVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    // chuyển về local space từ JS qua worldToLocal() mỗi frame
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

    vec3 finalColor = mix(nightColor, dayColor, dayMix) + twilightColor;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

// Hướng Mặt Trời trong WORLD SPACE (từ Trái Đất nhìn về Mặt Trời)
// θ=0°→Xuân(-1,0,0), θ=90°→Hạ(0,0,-1), θ=180°→Thu(1,0,0), θ=270°→Đông(0,0,1)
const SEASON_SUN_WORLD = {
  spring: {
    day:   new THREE.Vector3(-1,  0,  0),
    night: new THREE.Vector3( 1,  0,  0),
  },
  summer: {
    day:   new THREE.Vector3( 0,  0, -1),
    night: new THREE.Vector3( 0,  0,  1),
  },
  autumn: {
    day:   new THREE.Vector3( 1,  0,  0),
    night: new THREE.Vector3(-1,  0,  0),
  },
  winter: {
    day:   new THREE.Vector3( 0,  0,  1),
    night: new THREE.Vector3( 0,  0, -1),
  },
}

export default function Earth({ isDay, speed = 1, season = 'summer' }) {
  const earthRef  = useRef()
  const cloudsRef = useRef()

  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg',
  ])

  dayTex.colorSpace   = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace

  // Khai báo ngoài useFrame — không new Vector3 trong vòng lặp (tránh GC spike)
  const worldSunDir = useRef(SEASON_SUN_WORLD.summer.day.clone())
  const localSunDir = useRef(new THREE.Vector3())

  const earthUniforms = useMemo(() => ({
    uDayTexture:   { value: dayTex },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    if (earthRef.current)  earthRef.current.rotation.y  += delta * 0.05 * speed
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.08 * speed

    // Bước 1: Lerp hướng Mặt Trời trong WORLD SPACE
    const target = isDay ? SEASON_SUN_WORLD[season].day : SEASON_SUN_WORLD[season].night
    worldSunDir.current.lerp(target, delta * 1.2).normalize()

    // Bước 2: Chuyển về LOCAL SPACE của mesh Trái Đất đang quay
    // worldToLocal hợp lệ ở đây vì mesh không có translation (chỉ có rotation)
    // → inverse(matrixWorld) * worldSunDir = loại bỏ cả tilt 23.5° lẫn rotation Y hiện tại
    localSunDir.current.copy(worldSunDir.current)
    earthRef.current.worldToLocal(localSunDir.current)
    localSunDir.current.normalize()

    // Bước 3: Truyền vào shader — lúc này dot(vNormal, uSunDirection) đúng không gian
    earthUniforms.uSunDirection.value.copy(localSunDir.current)
  })

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[2, 64, 64]} />
        <shaderMaterial
          vertexShader={earthVertex}
          fragmentShader={earthFragment}
          uniforms={earthUniforms}
        />
      </mesh>

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