import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
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

    vec3 finalColor = mix(nightColor, dayColor, dayMix) + twilightColor;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

const SEASON_SUN_WORLD = {
  spring: new THREE.Vector3(-1, 0,  0),
  summer: new THREE.Vector3( 0, 0, -1),
  autumn: new THREE.Vector3( 1, 0,  0),
  winter: new THREE.Vector3( 0, 0,  1),
}

export default function Earth({ speed = 1, season = 'summer' }) {
  const earthRef  = useRef()
  const cloudsRef = useRef()

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
    if (earthRef.current)  earthRef.current.rotation.y  += delta * 0.05 * speed
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.08 * speed

    worldSunDir.current.lerp(SEASON_SUN_WORLD[season], delta * 1.2).normalize()

    localSunDir.current.copy(worldSunDir.current)
    earthRef.current.worldToLocal(localSunDir.current)
    localSunDir.current.normalize()

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