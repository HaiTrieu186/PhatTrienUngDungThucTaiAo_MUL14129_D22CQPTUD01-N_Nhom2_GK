import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const SEASON_SUN_DIR = {
  spring: new THREE.Vector3(-1,  0,  0),
  summer: new THREE.Vector3( 0,  0, -1),
  autumn: new THREE.Vector3( 1,  0,  0),
  winter: new THREE.Vector3( 0,  0,  1),
}
const SUN_DISTANCE = 18

function useGlowTexture(innerColor, outerColor, size = 512) {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx  = canvas.getContext('2d')
    const c    = size / 2
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
    grad.addColorStop(0,    innerColor)
    grad.addColorStop(0.30, innerColor.replace(/[\d.]+\)$/, '0.55)'))
    grad.addColorStop(0.65, innerColor.replace(/[\d.]+\)$/, '0.10)'))
    grad.addColorStop(1,    outerColor)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }, [innerColor, outerColor, size])
}

function useCoronaTexture() {
  return useMemo(() => {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const cx = size / 2
    const cy = size / 2
    ctx.clearRect(0, 0, size, size)

    const RAY_COUNT = 20
    for (let i = 0; i < RAY_COUNT; i++) {
      const angle = (i / RAY_COUNT) * Math.PI * 2 + (Math.random() * 0.2 - 0.1)
      const len   = (0.25 + Math.random() * 0.20) * size * 0.5
      const width = (0.007 + Math.random() * 0.010) * size

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)

      const rayGrad = ctx.createLinearGradient(0, 0, len, 0)
      rayGrad.addColorStop(0,   'rgba(255,245,220,0.0)')
      rayGrad.addColorStop(0.12,'rgba(255,245,220,0.50)')
      rayGrad.addColorStop(0.5, 'rgba(255,230,180,0.20)')
      rayGrad.addColorStop(1.0, 'rgba(255,220,150,0.0)')

      ctx.beginPath()
      ctx.moveTo(0, -width / 2)
      ctx.lineTo(len, 0)
      ctx.lineTo(0,  width / 2)
      ctx.closePath()
      ctx.fillStyle = rayGrad
      ctx.fill()
      ctx.restore()
    }
    return new THREE.CanvasTexture(canvas)
  }, [])
}

// ── Sun surface shader – WHITE-HOT core ───────────────────────────────────────
// Mặt Trời thực tế: quá sáng → mắt/camera chỉ thấy TRẮNG CHÓI ở tâm
// Màu cam/vàng chỉ xuất hiện ở rìa (limb) và hào quang
const sunVertex = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv     = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const sunFragment = /* glsl */`
  precision mediump float;
  uniform sampler2D uTex;
  uniform float     uTime;
  varying vec2      vUv;
  varying vec3      vNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
               mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }

  void main() {
    float t = uTime * 0.04;
    float n = noise(vUv*5.0+vec2(t, t*0.7))*0.55
            + noise(vUv*9.0+vec2(-t*1.1,t*0.4))*0.30
            + noise(vUv*3.0+vec2(t*0.3,-t*0.9))*0.15;

    // Fresnel: tính khoảng cách từ tâm để biết đang ở lõi hay rìa
    float rim = 1.0 - max(0.0, dot(normalize(vNormal), vec3(0,0,1)));

    // Palette chuyển từ TRẮNG (tâm) → vàng nhạt → cam (chỉ ở rìa)
    // rim=0 = tâm (trắng), rim=1 = rìa (cam đậm hơn)
    vec3 white  = vec3(1.00, 1.00, 0.97); // Trắng tinh
    vec3 yellow = vec3(1.00, 0.92, 0.65); // Vàng nhạt
    vec3 orange = vec3(0.95, 0.55, 0.15); // Cam chỉ ở rìa ngoài

    // Kết hợp rim + turbulence: tâm luôn trắng bất kể noise
    float rimFactor  = pow(rim, 1.8);         // Tập trung màu ở rìa
    float turbFactor = n * (1.0 - rimFactor); // Noise chỉ ở phần tâm

    vec3 color = white; // Bắt đầu từ trắng
    color = mix(color, yellow, rimFactor * 0.65 + turbFactor * 0.3);
    color = mix(color, orange, rimFactor * 0.40);

    // Texture base blend nhẹ (giảm xuống 25% để không che trắng)
    vec3 base = texture2D(uTex, vUv).rgb;
    color = mix(color, color * mix(vec3(1.0), base*1.2, 0.25), 1.0);

    // Limb darkening nhẹ (thực tế thiên văn, không tối quá)
    color *= 1.0 - rim * 0.25;

    // Output rất sáng – mô phỏng overexposure camera
    gl_FragColor = vec4(color * 1.6, 1.0);
  }
`

export default function Sun({ season, sunWorldPosRef }) {
  const groupRef   = useRef()
  const coreRef    = useRef()
  const currentDir = useRef(SEASON_SUN_DIR.summer.clone())
  const tex        = useTexture('/textures/sun.jpg')

  const coreUniforms = useMemo(() => ({ uTex: { value: tex }, uTime: { value: 0 } }), [tex])

  // Glow: tâm TRẮNG TINH, ngoài dần sang vàng nhạt
  // (khi camera bị overexpose, glow cũng trắng chứ không cam)
  const glowCore  = useGlowTexture('rgba(255,255,255,1.0)',  'rgba(255,255,240,0)')
  const glowMid   = useGlowTexture('rgba(255,248,210,0.75)', 'rgba(255,220,120,0)')
  const glowOuter = useGlowTexture('rgba(255,240,180,0.30)', 'rgba(255,200,80, 0)')

  const coronaTex = useCoronaTexture()

  useFrame(({ clock }, delta) => {
    coreUniforms.uTime.value = clock.elapsedTime
    currentDir.current.lerp(SEASON_SUN_DIR[season], delta * 1.2).normalize()
    if (groupRef.current) {
      groupRef.current.position.copy(currentDir.current).multiplyScalar(SUN_DISTANCE)
      if (sunWorldPosRef) groupRef.current.getWorldPosition(sunWorldPosRef.current)
    }
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.007
  })

  return (
    <group ref={groupRef}>
      {/* Lõi – trắng chói như nhìn thẳng vào Mặt Trời */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.0, 48, 48]} />
        <shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} uniforms={coreUniforms} />
      </mesh>

      {/* Corona tia sáng – Sprite nên luôn face camera */}
      <sprite scale={[9.0, 9.0, 1]}>
        <spriteMaterial map={coronaTex} transparent opacity={0.75}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Glow tâm – trắng tinh (lens flare effect) */}
      <sprite scale={[4.0, 4.0, 1]}>
        <spriteMaterial map={glowCore} transparent opacity={1.0}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Glow giữa – vàng nhạt */}
      <sprite scale={[9.0, 9.0, 1]}>
        <spriteMaterial map={glowMid} transparent opacity={0.60}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Glow ngoài – tỏa rộng */}
      <sprite scale={[16, 16, 1]}>
        <spriteMaterial map={glowOuter} transparent opacity={0.28}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      <pointLight intensity={5.5} decay={0} color="#fff8f0" />
    </group>
  )
}