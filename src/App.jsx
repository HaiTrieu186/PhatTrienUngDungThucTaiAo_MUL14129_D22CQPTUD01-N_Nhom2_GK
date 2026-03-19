import { Suspense, useState, useRef, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, useTexture } from '@react-three/drei'
import { XR, createXRStore, XROrigin } from '@react-three/xr'
import * as THREE from 'three'
import Earth from './Earth'
import Atmosphere from './Atmosphere'
import Sun from './Sun'

// Khởi tạo WebXR store quản lý trạng thái VR
const xrStore = createXRStore()

// [FIX #1] Preload tất cả texture ngay khi module được import,
// TRƯỚC khi component mount. Đảm bảo Quest Browser có đủ thời gian
// fetch ảnh qua HTTPS trước khi WebXR session bắt đầu.
useTexture.preload('/textures/day.jpg')
useTexture.preload('/textures/night.jpg')
useTexture.preload('/textures/clouds.jpg')
useTexture.preload('/textures/sun.jpg')

const SEASONS = [
  { key: 'spring', label: '🌸 Xuân', color: '#a8e063', border: '#6abf4b' },
  { key: 'summer', label: '☀️ Hạ',   color: '#f9a825', border: '#ff6f00' },
  { key: 'autumn', label: '🍂 Thu',  color: '#e07b39', border: '#bf4e0a' },
  { key: 'winter', label: '❄️ Đông', color: '#a0c4ff', border: '#5b9bd5' },
]

const DEFAULT_CAM    = new THREE.Vector3(0, 0, 6)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)

// ─── TƯƠNG TÁC VR (VR CONTROLS) ─────────────────────────────────────────────
// Xử lý input từ tay cầm Meta Quest
function VRControls({ worldRef, vrZoomRef }) {
  useFrame(({ gl }, delta) => {
    const session = gl.xr.getSession()
    if (!session) return

    for (const source of session.inputSources) {
      if (!source.gamepad) continue
      const axes = source.gamepad.axes
      const stickX = axes[2] ?? 0
      const stickY = axes[3] ?? 0
      const DEAD_ZONE = 0.12 // Bỏ qua vi sai nhẹ của joystick

      // Tay trái: Orbit (xoay) toàn bộ hệ thống mô phỏng
      if (source.handedness === 'left' && worldRef.current) {
        if (Math.abs(stickX) > DEAD_ZONE) worldRef.current.rotation.y -= stickX * delta * 1.4
        if (Math.abs(stickY) > DEAD_ZONE) worldRef.current.rotation.x -= stickY * delta * 1.0
        // Giới hạn góc ngẩng để không lật ngược camera
        worldRef.current.rotation.x = THREE.MathUtils.clamp(worldRef.current.rotation.x, -Math.PI / 2, Math.PI / 2)
      }

      // Tay phải: Zoom (Dịch chuyển cụm camera rig theo trục Z)
      if (source.handedness === 'right' && vrZoomRef.current) {
        if (Math.abs(stickY) > DEAD_ZONE) {
          vrZoomRef.current.position.z = THREE.MathUtils.clamp(
            vrZoomRef.current.position.z + stickY * delta * 3,
            -4, // Zoom in tối đa
             4  // Zoom out tối đa
          )
        }
      }
    }
  })
  return null
}

// ─── CAMERA RESETTER ─────────────────────────────────────────────────────────
// Đưa camera và góc xoay về trạng thái mặc định bằng nội suy mượt (Lerp)
function CameraResetter({ triggerRef, cancelRef, worldRef, vrZoomRef }) {
  const { camera } = useThree()
  const isResetting = useRef(false)
  const orbitRef    = useRef()

  triggerRef.current = (controls) => {
    orbitRef.current    = controls
    isResetting.current = true
  }
  cancelRef.current = () => { isResetting.current = false }

  useFrame((_, delta) => {
    if (!isResetting.current) return

    camera.position.lerp(DEFAULT_CAM, delta * 1.5)
    if (orbitRef.current) {
      orbitRef.current.target.lerp(DEFAULT_TARGET, delta * 1.5)
      orbitRef.current.update()
    }
    if (worldRef?.current) {
      worldRef.current.rotation.x = THREE.MathUtils.lerp(worldRef.current.rotation.x, 0, delta * 1.5)
      worldRef.current.rotation.y = THREE.MathUtils.lerp(worldRef.current.rotation.y, 0, delta * 1.5)
    }
    if (vrZoomRef?.current) {
      vrZoomRef.current.position.z = THREE.MathUtils.lerp(vrZoomRef.current.position.z, 0, delta * 1.5)
    }

    if (camera.position.distanceTo(DEFAULT_CAM) < 0.01) {
      camera.position.copy(DEFAULT_CAM)
      if (orbitRef.current) {
        orbitRef.current.target.copy(DEFAULT_TARGET)
        orbitRef.current.update()
      }
      isResetting.current = false
    }
  })
  return null
}

// ─── THEO DÕI TRẠNG THÁI VR ──────────────────────────────────────────────────
// Lắng nghe sự kiện phần cứng để đồng bộ state của React với trạng thái WebXR
function VRTracker({ setIsVR }) {
  const { gl } = useThree()

  useEffect(() => {
    const handleSessionStart = () => setIsVR(true)
    const handleSessionEnd = () => setIsVR(false)

    // Lắng nghe WebXR API native events để ẩn/hiện UI 2D
    gl.xr.addEventListener('sessionstart', handleSessionStart)
    gl.xr.addEventListener('sessionend', handleSessionEnd)

    return () => {
      gl.xr.removeEventListener('sessionstart', handleSessionStart)
      gl.xr.removeEventListener('sessionend', handleSessionEnd)
    }
  }, [gl, setIsVR])

  return null
}

export default function App() {
  const [speed,  setSpeed]  = useState(1)
  const [season, setSeason] = useState('summer')
  const [isVR, setIsVR]     = useState(false) // Trạng thái kiểm soát UI Web

  const orbitRef   = useRef()
  const triggerRef = useRef(() => {})
  const cancelRef  = useRef(() => {})
  const worldRef   = useRef()
  const vrZoomRef  = useRef()

  // Lưu trữ vị trí thực tế của Mặt trời để truyền cho Shader Trái Đất
  const sunWorldPosRef = useRef(new THREE.Vector3(0, 0, -18))

  const handleReset = () => triggerRef.current(orbitRef.current)

  const handleEnterVR = async () => {
    if (!navigator.xr) {
      alert('Trình duyệt không hỗ trợ WebXR. Vui lòng mở bằng Meta Quest Browser.')
      return
    }
    const supported = await navigator.xr.isSessionSupported('immersive-vr')
    if (!supported) {
      alert('Thiết bị không hỗ trợ Immersive VR.')
      return
    }
    xrStore.enterVR()
  }

  // UI Web (Lớp Overlay) - Sẽ ẩn đi khi người dùng đeo kính vào chế độ VR
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      {!isVR && (
        <div style={{
          position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        }}>
          {/* Bộ chọn mùa */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {SEASONS.map(s => (
              <button key={s.key} onClick={() => setSeason(s.key)} style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: 'bold', fontFamily: 'sans-serif',
                background: season === s.key ? `linear-gradient(135deg, ${s.color}44, ${s.border}66)` : 'rgba(0,0,0,0.5)',
                color: season === s.key ? '#fff' : '#888',
                border: `2px solid ${season === s.key ? s.border : '#333'}`,
                borderRadius: '20px', cursor: 'pointer', transition: 'all 0.3s ease',
              }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Cụm nút điều khiển */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button onClick={handleReset} style={{
               padding: '14px 28px', fontSize: '15px', fontWeight: 'bold', borderRadius: '50px',
               background: '#16213e', color: '#a0c4ff', border: '2px solid #a0c4ff', cursor: 'pointer',
            }}>
              🎯 Reset Góc Nhìn
            </button>
            <button onClick={handleEnterVR} style={{
               padding: '14px 28px', fontSize: '15px', fontWeight: 'bold', borderRadius: '50px',
               background: '#2d1060', color: '#d4aaff', border: '2px solid #9b59f5', cursor: 'pointer',
            }}>
              🥽 Vào VR (Quest 3)
            </button>
          </div>

          {/* Thanh trượt tốc độ */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.55)',
            padding: '8px 18px', borderRadius: '20px', backdropFilter: 'blur(6px)',
          }}>
            <span style={{ color: '#aaa', fontSize: '13px' }}>🌍 Tốc độ quay</span>
            <input type="range" min="0" max="5" step="0.1" value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))} style={{ width: '120px' }}
            />
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>{speed.toFixed(1)}×</span>
          </div>
        </div>
      )}

      {/* ─── KHÔNG GIAN 3D (CANVAS) ─── */}
      {/* [FIX #5] outputColorSpace + NoToneMapping: Quest không tự ý điều chỉnh màu làm trắng cảnh. */}
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.NoToneMapping }}
      >
        {/* Tracker theo dõi trạng thái kính VR */}
        <VRTracker setIsVR={setIsVR} />
        
        <XR store={xrStore}>
          {/* Cụm gốc VR: Quản lý vị trí người chơi */}
          <group ref={vrZoomRef}>
            <XROrigin position={[0, 0, 6]} />
          </group>

          <VRControls worldRef={worldRef} vrZoomRef={vrZoomRef} />
          <CameraResetter triggerRef={triggerRef} cancelRef={cancelRef} worldRef={worldRef} vrZoomRef={vrZoomRef} />

          {/* Cụm không gian thế giới: Xoay toàn cục khi dùng thumbstick trái */}
          <group ref={worldRef}>
            <ambientLight intensity={0.15} />
            <Sun season={season} sunWorldPosRef={sunWorldPosRef} />

            <Suspense fallback={null}>
              {/* Trục Trái Đất nghiêng ~23.5 độ so với mặt phẳng quỹ đạo */}
              <group rotation={[0, 0, THREE.MathUtils.degToRad(-23.5)]}>
                <Earth speed={speed} season={season} sunWorldPosRef={sunWorldPosRef} />
                <Atmosphere />
              </group>
            </Suspense>
            <Stars radius={100} depth={50} count={6000} factor={4} saturation={0} fade />
          </group>

          <OrbitControls ref={orbitRef} enablePan={false} minDistance={3} maxDistance={12} onStart={() => cancelRef.current()} />
        </XR>
      </Canvas>
    </div>
  )
}