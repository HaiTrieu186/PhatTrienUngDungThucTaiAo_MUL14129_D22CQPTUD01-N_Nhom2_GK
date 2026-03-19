import { useRef, useMemo } from 'react'
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

// [FIX #3] Thêm needsUpdate, colorSpace và filter vào CanvasTexture.
// Trong môi trường WebXR Multiview của Quest 3, khi session bắt đầu, GPU cần
// được báo hiệu tường minh rằng texture đã sẵn sàng (needsUpdate = true).
// Nếu thiếu cờ này, canvas 2D chưa đồng bộ kịp với dual framebuffer → hào quang trắng.
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

    const texture = new THREE.CanvasTexture(canvas)

    // [FIX #3] Báo hiệu WebGL đẩy dữ liệu điểm ảnh lên VRAM ngay lập tức,
    // không chờ frame tiếp theo — quan trọng cho WebXR session start.
    texture.needsUpdate = true

    // [FIX #3] Đồng bộ không gian màu để hào quang không bị cháy lóa trên kính VR.
    texture.colorSpace = THREE.SRGBColorSpace

    // [FIX #3] Dùng LinearFilter thay vì mặc định để tránh lỗi mipmap
    // khi texture không có kích thước là lũy thừa của 2 trong một số trình duyệt.
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    return texture
  }, [innerColor, outerColor])
}

export default function Sun({ season, sunWorldPosRef }) {
  const groupRef   = useRef()
  const coreRef    = useRef()
  const currentDir = useRef(SEASON_SUN_DIR.summer.clone())
  const tex        = useTexture('/textures/sun.jpg')

  const glowTex1 = useGlowTexture('rgba(255, 220, 80, 0.9)',  'rgba(255,100,0,0)')
  const glowTex2 = useGlowTexture('rgba(255, 255, 200, 0.4)', 'rgba(255,255,255,0)')

  useFrame((_, delta) => {
    currentDir.current.lerp(SEASON_SUN_DIR[season], delta * 1.2).normalize()
    if (groupRef.current) {
      groupRef.current.position.copy(currentDir.current).multiplyScalar(SUN_DISTANCE)
      if (sunWorldPosRef) groupRef.current.getWorldPosition(sunWorldPosRef.current)
    }
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.012
  })

  return (
    <group ref={groupRef}>
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.0, 32, 32]} />
        <meshBasicMaterial map={tex} />
      </mesh>

      <sprite scale={[5.5, 5.5, 1]}>
        <spriteMaterial map={glowTex1} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      <sprite scale={[9, 9, 1]}>
        <spriteMaterial map={glowTex2} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      <pointLight intensity={3.5} decay={0} color="#fff5e0" />
    </group>
  )
}