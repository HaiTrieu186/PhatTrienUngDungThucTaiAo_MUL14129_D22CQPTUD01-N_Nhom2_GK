import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const SUN_DISTANCE = 250
const SUN_RADIUS   = 16.9

const SEASON_SUN_DIR = {
  spring: new THREE.Vector3(-1,  0,  0),
  summer: new THREE.Vector3( 0,  0, -1),
  autumn: new THREE.Vector3( 1,  0,  0),
  winter: new THREE.Vector3( 0,  0,  1),
}

// ── CÁC HÀM TẠO TEXTURE ──────────────────────────

// 1. Glow nền
function useGlowTex(stops, size = 512) {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d'), c = size / 2
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
    stops.forEach(([t, col]) => grad.addColorStop(t, col))
    ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }, [])
}

// 2. Corona
function useCoronaTex() {
  return useMemo(() => {
    const size = 1024, cx = 512, cy = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size; const ctx = canvas.getContext('2d')
    const halo = ctx.createRadialGradient(cx, cy, size * 0.16, cx, cy, size * 0.50)
    halo.addColorStop(0, 'rgba(255,245,200,0.22)')
    halo.addColorStop(0.4, 'rgba(255,220,130,0.09)')
    halo.addColorStop(1, 'rgba(255,190,60,0.0)')
    ctx.fillStyle = halo; ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.22
      const len = (0.18 + Math.random() * 0.32) * size * 0.5
      const curl = (Math.random() - 0.5) * 0.4, w = 1.2 + Math.random() * 3.5
      const cp1x = len * 0.30, cp1y = curl * len * 0.45
      const cp2x = len * 0.68, cp2y = curl * len * 0.18
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
      const g = ctx.createLinearGradient(0, 0, len, 0)
      g.addColorStop(0, 'rgba(255,250,220,0.0)')
      g.addColorStop(0.07, `rgba(255,250,220,${(0.38 + Math.random() * 0.32).toFixed(2)})`)
      g.addColorStop(0.50, 'rgba(255,230,150,0.14)')
      g.addColorStop(1.0, 'rgba(255,200, 80,0.0)')
      ctx.beginPath(); ctx.moveTo(0, -w)
      ctx.bezierCurveTo(cp1x, cp1y - w, cp2x, cp2y - w * 0.5, len, 0)
      ctx.bezierCurveTo(cp2x, cp2y + w * 0.5, cp1x, cp1y + w, 0, w)
      ctx.fillStyle = g; ctx.fill(); ctx.restore()
    }
    return new THREE.CanvasTexture(canvas)
  }, [])
}

// 3. Ghosting Lục giác (Thấu kính)
function useHexagonArtifactTex() {
  return useMemo(() => {
    const size = 128, c = size / 2, r = size * 0.45
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size; const ctx = canvas.getContext('2d')
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3
      if (i === 0) ctx.moveTo(c + r * Math.cos(angle), c + r * Math.sin(angle))
      else ctx.lineTo(c + r * Math.cos(angle), c + r * Math.sin(angle))
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.lineWidth = 2
    ctx.stroke()
    return new THREE.CanvasTexture(canvas)
  }, [])
}

// 4. Ghosting Vòng tròn mờ (Thấu kính)
function useCircleArtifactTex() {
  return useMemo(() => {
    const size = 128, c = size / 2
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size; const ctx = canvas.getContext('2d')
    const grad = ctx.createRadialGradient(c, c, size * 0.3, c, c, size * 0.45)
    grad.addColorStop(0, 'rgba(255,255,255,0.05)')
    grad.addColorStop(0.9, 'rgba(255,255,255,0.2)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.arc(c, c, size * 0.45, 0, Math.PI * 2)
    ctx.fill()
    return new THREE.CanvasTexture(canvas)
  }, [])
}

// ── BỀ MẶT MẶT TRỜI ────────────────────────────────────────────────────────
const sunVertex = `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const sunFragment = `
  precision highp float; uniform float uTime; varying vec3 vNormal;
  void main() {
    float cosView = max(0.0, dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
    float limb = 0.36 + 0.64 * cosView;
    vec3 colorCenter = vec3(1.00, 0.97, 0.85);
    vec3 colorLimb   = vec3(0.92, 0.38, 0.05);
    vec3 surface = mix(colorLimb, colorCenter, pow(cosView, 0.42)) * limb;
    float blown = pow(cosView, 1.6);
    surface = mix(surface, vec3(1.8, 1.75, 1.60), blown * 0.92);
    gl_FragColor = vec4(surface * 2.4 * (1.0 + 0.025 * sin(uTime * 0.48)), 1.0);
  }
`

export default function Sun({ season, sunWorldPosRef }) {
  const { camera } = useThree() 
  const groupRef              = useRef()
  const coronaRef             = useRef()
  const flareGroupRef         = useRef()
  const currentDir            = useRef(SEASON_SUN_DIR.summer.clone())

  const uniforms       = useMemo(() => ({ uTime: { value: 0 } }), [])
  const coronaTex      = useCoronaTex()
  const hexTex         = useHexagonArtifactTex()
  const circleTex      = useCircleArtifactTex()
  const R              = SUN_RADIUS

  const glowCore = useGlowTex([[0, 'rgba(255,255,255,1.0)'], [0.10, 'rgba(255,255,252,0.96)'], [0.28, 'rgba(255,252,230,0.60)'], [0.52, 'rgba(255,245,200,0.22)'], [1.0, 'rgba(255,230,170,0.0)']])
  const glowMid = useGlowTex([[0, 'rgba(255,248,200,0.82)'], [0.18, 'rgba(255,232,148,0.52)'], [0.48, 'rgba(255,205,80,0.20)'], [0.78, 'rgba(255,175,45,0.05)'], [1.0, 'rgba(255,150,25,0.0)']])
  const glowFar = useGlowTex([[0, 'rgba(255,225,130,0.48)'], [0.22, 'rgba(255,195,72,0.22)'], [0.58, 'rgba(255,155,35,0.07)'], [1.0, 'rgba(255,120,10,0.0)']])
  const glowExtreme = useGlowTex([[0, 'rgba(255,200, 90,0.24)'], [0.32, 'rgba(255,160, 45,0.09)'], [0.65, 'rgba(255,120, 15,0.02)'], [1.0, 'rgba(255, 90, 0,0.0)']])

  useFrame(({ clock }, delta) => {
    uniforms.uTime.value = clock.elapsedTime
    currentDir.current.lerp(SEASON_SUN_DIR[season], delta * 1.2).normalize()

    if (groupRef.current) {
      groupRef.current.position.copy(currentDir.current).multiplyScalar(SUN_DISTANCE)
      if (sunWorldPosRef) groupRef.current.getWorldPosition(sunWorldPosRef.current)
    }

    if (coronaRef.current) coronaRef.current.material.rotation += delta * 0.006

    // ── MATH CHO OPTICAL LENS FLARE (ĐÃ FIX CHUẨN CHO VR) ──────────────────
    if (flareGroupRef.current && sunWorldPosRef?.current) {
      
      // Dùng getWorldPosition/Direction để lấy đúng vị trí đầu thật trong không gian VR
      const camPos = new THREE.Vector3()
      camera.getWorldPosition(camPos) 
      
      const camDir = new THREE.Vector3()
      camera.getWorldDirection(camDir)

      const sunPos = sunWorldPosRef.current 
      const sunDir = new THREE.Vector3().subVectors(sunPos, camPos).normalize()

      const dot = camDir.dot(sunDir)
      
      // Bắt đầu chói khi góc nhìn lớn hơn 0.65
      const flareIntensity = Math.max(0, (dot - 0.65) * 3.0) 

      if (flareIntensity > 0) {
        flareGroupRef.current.visible = true
        
        // Đẩy khoảng cách render ra vô cực (cách 220 đơn vị) 
        // Để 2 mắt VR hội tụ ở xa, không bị lác mắt hay double-vision
        const DISTANCE = 220.0 
        
        const pSun = camPos.clone().add(sunDir.clone().multiplyScalar(DISTANCE))
        const pCenter = camPos.clone().add(camDir.clone().multiplyScalar(DISTANCE))

        flareGroupRef.current.children.forEach((sprite) => {
          sprite.material.opacity = flareIntensity * sprite.userData.baseOpacity
          
          const f = sprite.userData.factor 
          sprite.position.copy(pSun).lerp(pCenter, f)
          sprite.lookAt(camPos)
        })
      } else {
        flareGroupRef.current.visible = false
      }
    }
  })

  return (
    <group>
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[R, 48, 48]} />
          <shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} uniforms={uniforms} />
        </mesh>
        <sprite ref={coronaRef} scale={[R * 4.0, R * 4.0, 1]}>
          <spriteMaterial map={coronaTex} transparent opacity={0.72} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
        <sprite scale={[R * 2.4, R * 2.4, 1]}>
          <spriteMaterial map={glowCore} transparent opacity={1.0} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
        <sprite scale={[R * 5.5, R * 5.5, 1]}>
          <spriteMaterial map={glowMid} transparent opacity={0.88} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
        <sprite scale={[R * 11.0, R * 11.0, 1]}>
          <spriteMaterial map={glowFar} transparent opacity={0.68} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
        <sprite scale={[R * 20.0, R * 20.0, 1]}>
          <spriteMaterial map={glowExtreme} transparent opacity={0.52} blending={THREE.AdditiveBlending} depthWrite={false} />
        </sprite>
        <pointLight intensity={8.0} decay={0} color="#fff6e0" />
      </group>

      {/* ── HỆ THỐNG LENS FLARE THEO TRỤC THẤU KÍNH (OPTICAL AXIS) ──────────────────── */}
      {/* VÌ DISTANCE TĂNG LÊN 220 MÉT, SCALE PHÓNG TO LÊN ~28 LẦN ĐỂ GIỮ TỈ LỆ NHÌN */}
      <group ref={flareGroupRef}>
        
        {/* Đốm mờ gần mặt trời */}
        <sprite userData={{ factor: 0.2, baseOpacity: 0.4 }} scale={[42, 42, 1]}>
          <spriteMaterial map={circleTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#a0c4ff" />
        </sprite>
        
        {/* Lướt ra giữa màn hình */}
        <sprite userData={{ factor: 0.6, baseOpacity: 0.5 }} scale={[78, 78, 1]} rotation={[0, 0, Math.PI/6]}>
          <spriteMaterial map={hexTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffb74d" />
        </sprite>

        {/* Nằm ngay tâm mắt kính */}
        <sprite userData={{ factor: 1.0, baseOpacity: 0.2 }} scale={[33, 33, 1]}>
          <spriteMaterial map={circleTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffffff" />
        </sprite>

        {/* Phản chiếu đối xứng sang mặt bên kia của kính (Mirrored) */}
        <sprite userData={{ factor: 1.4, baseOpacity: 0.35 }} scale={[112, 112, 1]} rotation={[0, 0, -Math.PI/4]}>
          <spriteMaterial map={hexTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#a0c4ff" />
        </sprite>
        
        <sprite userData={{ factor: 1.8, baseOpacity: 0.25 }} scale={[168, 168, 1]} rotation={[0, 0, Math.PI/12]}>
          <spriteMaterial map={hexTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffb74d" />
        </sprite>
      </group>
    </group>
  )
}