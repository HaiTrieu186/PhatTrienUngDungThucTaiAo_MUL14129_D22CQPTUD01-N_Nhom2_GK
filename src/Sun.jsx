import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const SEASON_SUN_DIR = {
  spring: new THREE.Vector3(-1, 0,  0),
  summer: new THREE.Vector3( 0, 0, -1),
  autumn: new THREE.Vector3( 1, 0,  0),
  winter: new THREE.Vector3( 0, 0,  1),
}

const SUN_DISTANCE = 18

export default function Sun({ season }) {
  const groupRef   = useRef()
  const currentDir = useRef(SEASON_SUN_DIR.summer.clone())
  const tex = useTexture('/textures/sun.jpg')

  useFrame((_, delta) => {
    currentDir.current.lerp(SEASON_SUN_DIR[season], delta * 1.2).normalize()
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