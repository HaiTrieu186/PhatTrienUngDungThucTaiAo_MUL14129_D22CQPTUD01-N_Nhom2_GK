import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const earthVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const earthFragment = `
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

// Vị trí Mặt Trời: ngày = chiếu thẳng, đêm = chiếu từ phía sau
const SUN_DAY   = new THREE.Vector3(5, 3, 5).normalize()
const SUN_NIGHT = new THREE.Vector3(-5, -1, -5).normalize()

export default function Earth({ isDay }) {
  const earthRef  = useRef()
  const cloudsRef = useRef()

  const [dayTex, nightTex, cloudsTex] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg',
    '/textures/clouds.jpg',
  ])

  dayTex.colorSpace   = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace

  const earthUniforms = useMemo(() => ({
    uDayTexture:   { value: dayTex },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: SUN_DAY.clone() },
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    // Quay Trái Đất và mây
    if (earthRef.current)  earthRef.current.rotation.y  += delta * 0.05
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.08

    // Lerp (di chuyển mượt) hướng Mặt Trời về đích
    const target = isDay ? SUN_DAY : SUN_NIGHT
    earthUniforms.uSunDirection.value.lerp(target, delta * 1.2)
    earthUniforms.uSunDirection.value.normalize()
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