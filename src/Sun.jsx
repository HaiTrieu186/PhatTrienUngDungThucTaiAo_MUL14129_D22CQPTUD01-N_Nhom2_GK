import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

// Giống SEASON_SUN_WORLD trong Earth.jsx — world space
const SEASON_SUN_DIR = {
  spring: { day: new THREE.Vector3(-1,  0,  0), night: new THREE.Vector3( 1,  0,  0) },
  summer: { day: new THREE.Vector3( 0,  0, -1), night: new THREE.Vector3( 0,  0,  1) },
  autumn: { day: new THREE.Vector3( 1,  0,  0), night: new THREE.Vector3(-1,  0,  0) },
  winter: { day: new THREE.Vector3( 0,  0,  1), night: new THREE.Vector3( 0,  0, -1) },
}

const SUN_DISTANCE = 18

export default function Sun({ isDay, season }) {
  const groupRef   = useRef()
  const currentDir = useRef(SEASON_SUN_DIR.summer.day.clone())
  const tex = useTexture('/textures/sun.jpg')

  useFrame((_, delta) => {
    const target = isDay ? SEASON_SUN_DIR[season].day : SEASON_SUN_DIR[season].night
    currentDir.current.lerp(target, delta * 1.2).normalize()
    if (groupRef.current) {
      groupRef.current.position
        .copy(currentDir.current)
        .multiplyScalar(SUN_DISTANCE)
    }
  })

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1.0, 32, 32]} />
        <meshBasicMaterial map={tex} />
      </mesh>

      <mesh>
        <sphereGeometry args={[1.35, 32, 32]} />
        <meshBasicMaterial
          color="#fff4aa"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
        />
      </mesh>

      <pointLight intensity={3.5} decay={0} color="#fff5e0" />
    </group>
  )
}