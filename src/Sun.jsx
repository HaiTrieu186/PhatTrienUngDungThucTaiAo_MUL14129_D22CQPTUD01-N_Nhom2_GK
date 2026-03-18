import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

// Mô phỏng vị trí tương đối của Mặt Trời so với Trái Đất theo từng mùa
const SEASON_SUN_DIR = {
  spring: new THREE.Vector3(-1, 0,  0), // Xuân phân
  summer: new THREE.Vector3( 0, 0, -1), // Hạ chí (Bắc bán cầu ngả về MT)
  autumn: new THREE.Vector3( 1, 0,  0), // Thu phân
  winter: new THREE.Vector3( 0, 0,  1), // Đông chí (Nam bán cầu ngả về MT)
}

const SUN_DISTANCE = 18

// Tối ưu hóa: Tạo texture radial gradient bằng Canvas API thay vì load file ảnh ngoài
function useGlowTexture(innerColor, outerColor) {
  return useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const center = size / 2
    
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
    gradient.addColorStop(0,   innerColor)
    gradient.addColorStop(0.4, innerColor.replace(/[\d.]+\)$/, '0.3)'))
    gradient.addColorStop(1,   outerColor)
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }, [innerColor, outerColor])
}

export default function Sun({ season, sunWorldPosRef }) {
  const groupRef   = useRef()
  const coreRef    = useRef()
  const currentDir = useRef(SEASON_SUN_DIR.summer.clone())
  const tex        = useTexture('/textures/sun.jpg')

  // Sử dụng Sprite để hào quang luôn đối diện Camera (Billboard) - Rất quan trọng để tránh méo ảnh trong VR
  const glowTex1 = useGlowTexture('rgba(255, 220, 80, 0.9)',  'rgba(255,100,0,0)')
  const glowTex2 = useGlowTexture('rgba(255, 255, 200, 0.4)', 'rgba(255,255,255,0)')

  useFrame((_, delta) => {
    // Di chuyển Mặt Trời mượt mà (Lerp) khi đổi mùa
    currentDir.current.lerp(SEASON_SUN_DIR[season], delta * 1.2).normalize()
    if (groupRef.current) {
      groupRef.current.position.copy(currentDir.current).multiplyScalar(SUN_DISTANCE)
      if (sunWorldPosRef) groupRef.current.getWorldPosition(sunWorldPosRef.current)
    }
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.012
  })

  return (
    <group ref={groupRef}>
      {/* Lõi Mặt Trời */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.0, 32, 32]} />
        <meshBasicMaterial map={tex} />
      </mesh>

      {/* Lớp hào quang chói (Additive Blending giúp phát sáng) */}
      <sprite scale={[5.5, 5.5, 1]}>
        <spriteMaterial map={glowTex1} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Lớp hào quang tỏa rộng */}
      <sprite scale={[9, 9, 1]}>
        <spriteMaterial map={glowTex2} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      <pointLight intensity={3.5} decay={0} color="#fff5e0" />
    </group>
  )
}