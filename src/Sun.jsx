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

// ── Glow texture – radial gradient ────────────────────────────────────────────
function useGlowTexture(stops, size = 512) {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx  = canvas.getContext('2d')
    const c    = size / 2
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c)
    stops.forEach(([pos, color]) => grad.addColorStop(pos, color))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }, [])
}

// ── Corona texture – organic curved streamers ─────────────────────────────────
function useCoronaTexture() {
  return useMemo(() => {
    const size = 512, cx = 256, cy = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, size, size)

    // Layer 1: diffuse halo glow trước rồi vẽ tia lên
    const halo = ctx.createRadialGradient(cx, cy, size*0.18, cx, cy, size*0.50)
    halo.addColorStop(0,   'rgba(255,248,210,0.18)')
    halo.addColorStop(0.5, 'rgba(255,230,140,0.07)')
    halo.addColorStop(1,   'rgba(255,200,80,0.0)')
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, size, size)

    // Layer 2: organic streamers (đường cong Bezier, không phải tam giác)
    const STREAMERS = 22
    for (let i = 0; i < STREAMERS; i++) {
      const baseAngle = (i / STREAMERS) * Math.PI * 2
      const jitter    = (Math.random() - 0.5) * 0.28
      const angle     = baseAngle + jitter
      const len       = (0.22 + Math.random() * 0.28) * size * 0.5
      const curl      = (Math.random() - 0.5) * 0.35  // Độ cong tia

      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)

      // Điểm kiểm soát Bezier tạo tia cong tự nhiên
      const cp1x = len * 0.35, cp1y = curl * len * 0.4
      const cp2x = len * 0.70, cp2y = curl * len * 0.2
      const w    = 1.5 + Math.random() * 3.0 // Độ rộng gốc tia

      const grad = ctx.createLinearGradient(0, 0, len, 0)
      grad.addColorStop(0,    'rgba(255,252,225,0.0)')
      grad.addColorStop(0.08, `rgba(255,252,225,${0.45 + Math.random()*0.25})`)
      grad.addColorStop(0.45, 'rgba(255,235,160,0.18)')
      grad.addColorStop(1.0,  'rgba(255,210,100,0.0)')

      ctx.beginPath()
      ctx.moveTo(0, -w)
      ctx.bezierCurveTo(cp1x, cp1y - w, cp2x, cp2y - w*0.5, len, 0)
      ctx.bezierCurveTo(cp2x, cp2y + w*0.5, cp1x, cp1y + w, 0, w)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
      ctx.restore()
    }

    // Layer 3: vài tia dài nổi bật hơn
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2
      const len   = (0.40 + Math.random() * 0.20) * size * 0.5
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(angle)
      const grad = ctx.createLinearGradient(0, 0, len, 0)
      grad.addColorStop(0,    'rgba(255,255,240,0.0)')
      grad.addColorStop(0.06, 'rgba(255,255,240,0.55)')
      grad.addColorStop(0.4,  'rgba(255,240,180,0.15)')
      grad.addColorStop(1.0,  'rgba(255,220,120,0.0)')
      ctx.beginPath()
      ctx.moveTo(0, -1.5)
      ctx.lineTo(len, 0)
      ctx.lineTo(0, 1.5)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
      ctx.restore()
    }

    return new THREE.CanvasTexture(canvas)
  }, [])
}

// ── Sun Surface Shader – Granulation + Overexposed White Core ─────────────────
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

  // Value noise
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i),           hash(i+vec2(1,0)), f.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
  }

  // FBM – Fractal Brownian Motion cho bề mặt Mặt Trời thực tế
  // 4 octave → granulation đủ chi tiết, không quá nặng cho Quest 3
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    vec2  shift = vec2(100.0);
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p  = mat2(cos(0.5), -sin(0.5), sin(0.5), cos(0.5)) * p * 2.1 + shift;
      a *= 0.48;
    }
    return v;
  }

  void main() {
    float t  = uTime * 0.025; // Chậm lại – granulation chuyển động chậm
    vec2  uv = vUv;

    // ── Granulation pattern ──────────────────────────────────────────────
    // FBM với 2 lớp time offset tạo convection turbulence
    float gran  = fbm(uv * 6.5 + vec2(t, t * 0.6));
    float gran2 = fbm(uv * 13.0 + vec2(-t * 0.8, t * 1.1));
    float cell  = gran * 0.65 + gran2 * 0.35;

    // Sharpen: tăng contrast giữa granule sáng và intergranular lane tối
    cell = pow(cell, 0.75);

    // ── Màu granulation ──────────────────────────────────────────────────
    // Granule sáng: vàng-trắng (plasma nóng nổi lên)
    // Lane tối: đỏ-cam (plasma nguội hơn chìm xuống)
    vec3 granule = vec3(1.00, 0.95, 0.70); // Bright granule
    vec3 lane    = vec3(0.82, 0.28, 0.03); // Dark intergranular lane
    vec3 surface = mix(lane, granule, cell);

    // ── Rim / Limb effect ─────────────────────────────────────────────────
    // Thực tế: rìa Mặt Trời tối hơn và đỏ hơn tâm (Limb Darkening)
    // Vì tâm nhìn sâu hơn vào lớp quang cầu nóng hơn
    float cosView = max(0.0, dot(normalize(vNormal), vec3(0,0,1)));
    float rim     = 1.0 - cosView;

    // Limb darkening – tâm sáng, rìa tối dần (law: I ∝ cosθ^0.6)
    float limbDark = pow(cosView, 0.6);
    surface *= (0.4 + 0.6 * limbDark);

    // ── Overexposed bright core ───────────────────────────────────────────
    // Tâm (cosView gần 1) = nhìn trực tiếp → bị overexpose → TRẮNG TINH
    // Đây là hiệu ứng quan trọng nhất để trông như ngôi sao thực
    float overexpose = pow(cosView, 3.5);
    vec3  whiteCore  = vec3(1.20, 1.18, 1.10); // Slightly over 1 → blown out
    surface = mix(surface, whiteCore, overexpose * 0.72);

    // ── Texture blend nhẹ (25%) ───────────────────────────────────────────
    vec3 base = texture2D(uTex, vUv).rgb;
    surface = mix(surface, surface * (0.8 + base * 0.4), 0.20);

    // Output: * 1.5 để đảm bảo tổng thể rất sáng
    gl_FragColor = vec4(surface * 1.50, 1.0);
  }
`

// ─────────────────────────────────────────────────────────────────────────────
export default function Sun({ season, sunWorldPosRef }) {
  const groupRef   = useRef()
  const coreRef    = useRef()
  const currentDir = useRef(SEASON_SUN_DIR.summer.clone())
  const tex        = useTexture('/textures/sun.jpg')

  const coreUniforms = useMemo(() => ({
    uTex:  { value: tex },
    uTime: { value: 0   },
  }), [tex])

  const coronaTex = useCoronaTexture()

  // ── Glow layers – phân tầng từ tâm ra ngoài ───────────────────────────────
  // Tâm: trắng tinh (overexposed)
  // Giữa: vàng nhạt
  // Ngoài: cam nhạt rất mờ (atmosphere far extent)
  const glowBlinding = useGlowTexture([
    [0,    'rgba(255,255,255,1.0)'],
    [0.15, 'rgba(255,255,245,0.9)'],
    [0.40, 'rgba(255,255,230,0.3)'],
    [1.0,  'rgba(255,250,210,0.0)'],
  ])
  const glowMid = useGlowTexture([
    [0,    'rgba(255,252,200,0.75)'],
    [0.25, 'rgba(255,240,160,0.40)'],
    [0.60, 'rgba(255,220,100,0.10)'],
    [1.0,  'rgba(255,200, 60,0.0)'],
  ])
  const glowFar = useGlowTexture([
    [0,    'rgba(255,235,150,0.35)'],
    [0.35, 'rgba(255,210,100,0.12)'],
    [0.70, 'rgba(255,180, 60,0.04)'],
    [1.0,  'rgba(255,160, 30,0.0)'],
  ])
  const glowExtreme = useGlowTexture([
    [0,    'rgba(255,220,120,0.18)'],
    [0.50, 'rgba(255,180, 60,0.05)'],
    [1.0,  'rgba(255,140, 20,0.0)'],
  ])

  useFrame(({ clock }, delta) => {
    coreUniforms.uTime.value = clock.elapsedTime
    currentDir.current.lerp(SEASON_SUN_DIR[season], delta * 1.2).normalize()
    if (groupRef.current) {
      groupRef.current.position.copy(currentDir.current).multiplyScalar(SUN_DISTANCE)
      if (sunWorldPosRef) groupRef.current.getWorldPosition(sunWorldPosRef.current)
    }
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.006
  })

  return (
    <group ref={groupRef}>
      {/* Lõi granulation shader */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[1.0, 48, 48]} />
        <shaderMaterial
          vertexShader={sunVertex}
          fragmentShader={sunFragment}
          uniforms={coreUniforms}
        />
      </mesh>

      {/* Corona streamers – Sprite billboard (luôn face camera) */}
      <sprite scale={[9.5, 9.5, 1]}>
        <spriteMaterial map={coronaTex} transparent opacity={0.80}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Glow tâm – trắng chói (lens flare / overexposed) */}
      <sprite scale={[3.5, 3.5, 1]}>
        <spriteMaterial map={glowBlinding} transparent opacity={1.0}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Glow giữa – vàng nhạt */}
      <sprite scale={[8.0, 8.0, 1]}>
        <spriteMaterial map={glowMid} transparent opacity={0.70}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Glow xa – lan rộng, mờ */}
      <sprite scale={[16.0, 16.0, 1]}>
        <spriteMaterial map={glowFar} transparent opacity={0.50}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      {/* Glow cực xa – tạo cảm giác vì sao chiếu sáng cả không gian */}
      <sprite scale={[28.0, 28.0, 1]}>
        <spriteMaterial map={glowExtreme} transparent opacity={0.40}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>

      <pointLight intensity={6.0} decay={0} color="#fff8e8" />
    </group>
  )
}