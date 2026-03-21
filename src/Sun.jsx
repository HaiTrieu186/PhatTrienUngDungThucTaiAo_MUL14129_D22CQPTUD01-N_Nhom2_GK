import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const SUN_DISTANCE  = 250
const SUN_RADIUS    = 16.9
const EARTH_RADIUS  = 2.0   // khớp với sphereGeometry Earth

const SEASON_SUN_DIR = {
  spring: new THREE.Vector3(-1,  0,  0),
  summer: new THREE.Vector3( 0,  0, -1),
  autumn: new THREE.Vector3( 1,  0,  0),
  winter: new THREE.Vector3( 0,  0,  1),
}

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
      const len   = (0.18 + Math.random() * 0.32) * size * 0.5
      const curl  = (Math.random() - 0.5) * 0.4
      const w     = 1.2 + Math.random() * 3.5
      const cp1x  = len * 0.30, cp1y = curl * len * 0.45
      const cp2x  = len * 0.68, cp2y = curl * len * 0.18
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle)
      const g = ctx.createLinearGradient(0, 0, len, 0)
      g.addColorStop(0,    'rgba(255,250,220,0.0)')
      g.addColorStop(0.07, `rgba(255,250,220,${(0.38 + Math.random() * 0.32).toFixed(2)})`)
      g.addColorStop(0.50, 'rgba(255,230,150,0.14)')
      g.addColorStop(1.0,  'rgba(255,200, 80,0.0)')
      ctx.beginPath(); ctx.moveTo(0, -w)
      ctx.bezierCurveTo(cp1x, cp1y - w, cp2x, cp2y - w * 0.5, len, 0)
      ctx.bezierCurveTo(cp2x, cp2y + w * 0.5, cp1x, cp1y + w, 0, w)
      ctx.fillStyle = g; ctx.fill(); ctx.restore()
    }
    return new THREE.CanvasTexture(canvas)
  }, [])
}

function useHexagonArtifactTex() {
  return useMemo(() => {
    const size = 128, c = size / 2, r = size * 0.45
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size; const ctx = canvas.getContext('2d')
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3
      if (i === 0) ctx.moveTo(c + r * Math.cos(angle), c + r * Math.sin(angle))
      else         ctx.lineTo(c + r * Math.cos(angle), c + r * Math.sin(angle))
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke()
    return new THREE.CanvasTexture(canvas)
  }, [])
}

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
    ctx.arc(c, c, size * 0.45, 0, Math.PI * 2); ctx.fill()
    return new THREE.CanvasTexture(canvas)
  }, [])
}

function useAnamorphicTex() {
  return useMemo(() => {
    const W = 512, H = 32
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    const hGrad = ctx.createLinearGradient(0, 0, W, 0)
    hGrad.addColorStop(0,    'rgba(180,215,255,0)')
    hGrad.addColorStop(0.18, 'rgba(190,220,255,0.45)')
    hGrad.addColorStop(0.40, 'rgba(210,232,255,0.85)')
    hGrad.addColorStop(0.50, 'rgba(228,242,255,1.00)')
    hGrad.addColorStop(0.60, 'rgba(210,232,255,0.85)')
    hGrad.addColorStop(0.82, 'rgba(190,220,255,0.45)')
    hGrad.addColorStop(1,    'rgba(180,215,255,0)')
    ctx.fillStyle = hGrad; ctx.fillRect(0, 0, W, H)
    const vGrad = ctx.createLinearGradient(0, 0, 0, H)
    vGrad.addColorStop(0,    'rgba(0,0,0,0.95)')
    vGrad.addColorStop(0.22, 'rgba(0,0,0,0)')
    vGrad.addColorStop(0.78, 'rgba(0,0,0,0)')
    vGrad.addColorStop(1,    'rgba(0,0,0,0.95)')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = vGrad; ctx.fillRect(0, 0, W, H)
    return new THREE.CanvasTexture(canvas)
  }, [])
}

// ── Tính tỉ lệ đĩa Mặt Trời KHÔNG bị đĩa Trái Đất che ────────────────────────
//
// Ý tưởng: chiếu cả Sun lẫn Earth lên "bầu trời" nhìn từ camera như 2 hình tròn
// (đĩa góc - angular disc), rồi tính phần diện tích Sun không bị Earth phủ lên.
//
//  Từ camera nhìn ra:
//
//       ┌──────┐
//      /  SUN   \       r = góc bán kính Mặt Trời (angular radius)
//     │    ☀     │
//      \        /
//       └──────┘
//            ╲
//         ┌───╲──┐
//        /  EA╲TH \    R = góc bán kính Trái Đất (angular radius)
//       │    🌍    │
//        \        /     d = góc phân cách giữa 2 tâm
//         └──────┘
//
// Dùng công thức diện tích giao nhau 2 đường tròn (circle-circle intersection):
//
//   A_intersect = r²·arccos(cosA) + R²·arccos(cosB) - 0.5·√Δ
//
//   cosA = (d² + r² - R²) / (2dr)   ← góc sector của Sun bị che
//   cosB = (d² + R² - r²) / (2dR)   ← góc sector của Earth che
//   Δ    = (-d+r+R)(d+r-R)(d-r+R)(d+r+R)  ← Heron's formula
//
//   visibility = 1 - A_intersect / (π·r²)
//
// Đây là công thức vật lý chính xác tuyệt đối:
//   - Che 0%   → visibility = 1.0  (flare đầy)
//   - Che 50%  → visibility = 0.5  (flare nửa)
//   - Che 100% → visibility = 0.0  (flare tắt)
//
// Không có threshold cứng, không có smoothstep giả tạo — tất cả là toán học thực.
// ─────────────────────────────────────────────────────────────────────────────
// Reusable vectors – tránh tạo object mới mỗi frame
const _camPos  = new THREE.Vector3()
const _camDir  = new THREE.Vector3()
const _sunDir  = new THREE.Vector3()
const _ocVec   = new THREE.Vector3()
const _pSun    = new THREE.Vector3()
const _pCenter = new THREE.Vector3()

// ── Lấy camera position + direction đúng cho Web và VR ────────────────────────
// Web:  camera thường từ useThree() → getWorldPosition/Direction bình thường
// VR:   ArrayCamera.getWorldDirection() trả về (0,0,-1) mặc định vì không có
//       head-tracking rotation riêng. Phải dùng cameras[0] (left eye sub-camera)
//       mới có matrixWorld được WebXR cập nhật theo head pose thực tế mỗi frame.
function getActiveCamVectors(camera, gl, outPos, outDir) {
  if (gl.xr.isPresenting) {
    const xrCam = gl.xr.getCamera()
    xrCam.getWorldPosition(outPos)
    // cameras[0] = left eye, có head-tracking rotation đúng
    const eyeCam = xrCam.cameras?.length > 0 ? xrCam.cameras[0] : xrCam
    eyeCam.getWorldDirection(outDir)
  } else {
    camera.getWorldPosition(outPos)
    camera.getWorldDirection(outDir)
  }
}

// ── Tính tỉ lệ đĩa Mặt Trời KHÔNG bị đĩa Trái Đất che ────────────────────────
// BƯỚC 1 – Ray-sphere test: đảm bảo Earth thực sự nằm GIỮA camera và Sun.
//   Nếu camera đứng giữa Earth và Sun (Earth phía sau lưng), angular radius
//   Earth rất lớn (gần) → sẽ tính sai "che hết" dù không che gì cả.
//   Ray-sphere loại trừ case này trước khi vào tính angular.
// BƯỚC 2 – Circle-circle intersection: tính diện tích giao nhau chính xác.
//   visibility = 1 - A_giao / A_sun_disc
function getSunVisibility(camPos, sunWorldPos) {
  const distToSun = camPos.distanceTo(sunWorldPos)
  _sunDir.subVectors(sunWorldPos, camPos).normalize()

  // BƯỚC 1: ray-sphere test (Earth tại gốc tọa độ)
  _ocVec.copy(camPos)
  const b    = _ocVec.dot(_sunDir)
  const c    = _ocVec.dot(_ocVec) - EARTH_RADIUS * EARTH_RADIUS
  const disc = b * b - c
  if (disc < 0) return 1.0  // ray không cắt Earth sphere

  const sqrtD = Math.sqrt(disc)
  const tNear = -b - sqrtD
  const tFar  = -b + sqrtD
  // Earth hoàn toàn sau lưng camera, hoặc ở xa hơn Sun
  if (tFar <= 0 || tNear >= distToSun) return 1.0

  // BƯỚC 2: circle-circle intersection
  const distToEarth = camPos.length()
  const r = SUN_RADIUS   / distToSun
  const R = EARTH_RADIUS / distToEarth

  // Hướng từ camera → Earth tâm = (0,0,0)
  const toEarthDir = _ocVec.clone().negate().normalize()
  const cosAngle   = THREE.MathUtils.clamp(_sunDir.dot(toEarthDir), -1, 1)
  const d          = Math.acos(cosAngle)

  // Trường hợp đặc biệt: không giao nhau → Sun hoàn toàn lộ
  if (d >= r + R) return 1.0

  // Trường hợp đặc biệt: Sun nằm hoàn toàn trong đĩa Earth (nhật thực toàn phần)
  if (d + r <= R) return 0.0

  // Trường hợp đặc biệt: Earth nằm hoàn toàn trong đĩa Sun
  // (Earth nhỏ hơn, bị Sun "nuốt" về mặt góc nhìn — xảy ra khi đứng rất xa)
  if (d + R <= r) {
    const earthArea = Math.PI * R * R
    const sunArea   = Math.PI * r * r
    return 1.0 - earthArea / sunArea
  }

  // Trường hợp chung: giao nhau một phần
  // cosA, cosB từ luật cosine cho tam giác tạo bởi 2 tâm và giao điểm
  const cosA = THREE.MathUtils.clamp((d * d + r * r - R * R) / (2 * d * r), -1, 1)
  const cosB = THREE.MathUtils.clamp((d * d + R * R - r * r) / (2 * d * R), -1, 1)
  const A    = Math.acos(cosA)  // nửa góc sector của Sun bị che
  const B    = Math.acos(cosB)  // nửa góc sector của Earth che

  // Diện tích phần tam giác (Heron's formula dạng rút gọn)
  const s1 = -d + r + R
  const s2 =  d + r - R
  const s3 =  d - r + R
  const s4 =  d + r + R
  const triangleArea = 0.5 * Math.sqrt(Math.max(0, s1 * s2 * s3 * s4))

  // Diện tích giao nhau = 2 sector cung tròn - hình thoi giữa
  const intersectionArea = r * r * A + R * R * B - triangleArea

  const sunDiscArea = Math.PI * r * r
  const occluded    = THREE.MathUtils.clamp(intersectionArea / sunDiscArea, 0, 1)
  return 1.0 - occluded
}

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
  const { camera, gl } = useThree()
  const groupRef       = useRef()
  const coronaRef      = useRef()
  const flareGroupRef  = useRef()
  const streakGroupRef = useRef()
  const currentDir     = useRef(SEASON_SUN_DIR.summer.clone())

  const uniforms      = useMemo(() => ({ uTime: { value: 0 } }), [])
  const coronaTex     = useCoronaTex()
  const hexTex        = useHexagonArtifactTex()
  const circleTex     = useCircleArtifactTex()
  const anamorphicTex = useAnamorphicTex()
  const R             = SUN_RADIUS

  const glowCore    = useGlowTex([[0,'rgba(255,255,255,1.0)'],[0.10,'rgba(255,255,252,0.96)'],[0.28,'rgba(255,252,230,0.60)'],[0.52,'rgba(255,245,200,0.22)'],[1.0,'rgba(255,230,170,0.0)']])
  const glowMid     = useGlowTex([[0,'rgba(255,248,200,0.82)'],[0.18,'rgba(255,232,148,0.52)'],[0.48,'rgba(255,205,80,0.20)'],[0.78,'rgba(255,175,45,0.05)'],[1.0,'rgba(255,150,25,0.0)']])
  const glowFar     = useGlowTex([[0,'rgba(255,225,130,0.48)'],[0.22,'rgba(255,195,72,0.22)'],[0.58,'rgba(255,155,35,0.07)'],[1.0,'rgba(255,120,10,0.0)']])
  const glowExtreme = useGlowTex([[0,'rgba(255,200,90,0.24)'],[0.32,'rgba(255,160,45,0.09)'],[0.65,'rgba(255,120,15,0.02)'],[1.0,'rgba(255,90,0,0.0)']])

  useFrame(({ clock }, delta) => {
    uniforms.uTime.value = clock.elapsedTime
    currentDir.current.lerp(SEASON_SUN_DIR[season], delta * 1.2).normalize()

    if (groupRef.current) {
      groupRef.current.position.copy(currentDir.current).multiplyScalar(SUN_DISTANCE)
      if (sunWorldPosRef) groupRef.current.getWorldPosition(sunWorldPosRef.current)
    }

    if (coronaRef.current) coronaRef.current.material.rotation += delta * 0.006

    if (!sunWorldPosRef?.current) return

    // Lấy camera pos + dir đúng cho cả Web và VR (xem getActiveCamVectors)
    getActiveCamVectors(camera, gl, _camPos, _camDir)
    const sunDir = _sunDir.subVectors(sunWorldPosRef.current, _camPos).normalize()
    const dot    = _camDir.dot(sunDir)

    const visibility = getSunVisibility(_camPos, sunWorldPosRef.current)

    const DISTANCE = 220.0
    _pSun.copy(_camPos).addScaledVector(sunDir, DISTANCE)
    _pCenter.copy(_camPos).addScaledVector(_camDir, DISTANCE)

    // ── QUAN TRỌNG: Convert world space → local space của worldRef ────────────
    //
    // Sơ đồ cây:  worldRef  →  Sun root group  →  flareGroupRef  →  sprites
    //
    // Khi worldRef xoay (VR left-stick controls), tất cả con của nó xoay theo.
    // sprite.position = tọa độ LOCAL trong worldRef, KHÔNG phải world space.
    //
    // Ví dụ lỗi: worldRef xoay 90°, _pSun = [0,0,-220] (world)
    //   → sprite.position = [0,0,-220] local → world pos = [220,0,0] ← SAI HƯỚNG!
    //
    // Fix: lSun = worldRef.worldToLocal(_pSun) = tọa độ local tương ứng world _pSun
    //   → sprite xuất hiện đúng vị trí Mặt Trời trên màn hình VR.
    //
    // sprite.lookAt(_camPos) vẫn dùng world space — Three.js tự undo parent
    // transform bên trong lookAt() nên không cần convert. ✓
    //
    // worldRef = flareGroupRef.parent (Sun root group) .parent (worldRef)
    const worldRefGrp = flareGroupRef.current?.parent?.parent
    const lSun    = worldRefGrp ? worldRefGrp.worldToLocal(_pSun.clone())    : _pSun
    const lCenter = worldRefGrp ? worldRefGrp.worldToLocal(_pCenter.clone()) : _pCenter

    // Ghost flares — intensity tỉ lệ chính xác với phần Sun còn lộ ra
    if (flareGroupRef.current) {
      const fi = Math.max(0, (dot - 0.65) * 3.0) * visibility
      if (fi > 0.001) {
        flareGroupRef.current.visible = true
        flareGroupRef.current.children.forEach(s => {
          s.material.opacity = fi * s.userData.baseOpacity
          s.position.copy(lSun).lerp(lCenter, s.userData.factor)
          s.lookAt(_camPos)
        })
      } else {
        flareGroupRef.current.visible = false
      }
    }

    // Anamorphic streaks — tương tự
    if (streakGroupRef.current) {
      const si = Math.max(0, (dot - 0.90) * 10.0) * visibility
      if (si > 0.001) {
        streakGroupRef.current.visible = true
        streakGroupRef.current.children.forEach(s => {
          s.material.opacity = si * s.userData.baseOpacity
          s.position.copy(lSun)
          s.lookAt(_camPos)
        })
      } else {
        streakGroupRef.current.visible = false
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

      <group ref={flareGroupRef}>
        <sprite userData={{ factor: 0.2, baseOpacity: 0.4 }} scale={[42, 42, 1]}>
          <spriteMaterial map={circleTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#a0c4ff" />
        </sprite>
        <sprite userData={{ factor: 0.6, baseOpacity: 0.5 }} scale={[78, 78, 1]} rotation={[0,0,Math.PI/6]}>
          <spriteMaterial map={hexTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffb74d" />
        </sprite>
        <sprite userData={{ factor: 1.0, baseOpacity: 0.2 }} scale={[33, 33, 1]}>
          <spriteMaterial map={circleTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffffff" />
        </sprite>
        <sprite userData={{ factor: 1.4, baseOpacity: 0.35 }} scale={[112, 112, 1]} rotation={[0,0,-Math.PI/4]}>
          <spriteMaterial map={hexTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#a0c4ff" />
        </sprite>
        <sprite userData={{ factor: 1.8, baseOpacity: 0.25 }} scale={[168, 168, 1]} rotation={[0,0,Math.PI/12]}>
          <spriteMaterial map={hexTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ffb74d" />
        </sprite>
      </group>

      <group ref={streakGroupRef}>
        <sprite userData={{ baseOpacity: 0.65 }} scale={[310, 7, 1]}>
          <spriteMaterial map={anamorphicTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#b4d2ff" />
        </sprite>
        <sprite userData={{ baseOpacity: 0.45 }} scale={[150, 4, 1]}>
          <spriteMaterial map={anamorphicTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} color="#ddeeff" />
        </sprite>
      </group>
    </group>
  )
}