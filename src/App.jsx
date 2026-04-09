import { Suspense, useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import { XR, createXRStore, XROrigin } from '@react-three/xr'
import * as THREE from 'three'
import Earth from './Earth'
import Atmosphere from './Atmosphere'
import Sun from './Sun'
import Moon from './Moon'
import StarField from './StarField'

const xrStore = createXRStore()

useTexture.preload('/textures/day.jpg')
useTexture.preload('/textures/night.jpg')
useTexture.preload('/textures/clouds.jpg')
useTexture.preload('/textures/sun.jpg')
useTexture.preload('/textures/moon_color.jpg')
useTexture.preload('/textures/milky_way.jpg')

const SEASONS = [
  { key: 'spring', label: '🌸 Xuân', color: '#a8e063', border: '#6abf4b' },
  { key: 'summer', label: '☀️ Hạ',   color: '#f9a825', border: '#ff6f00' },
  { key: 'autumn', label: '🍂 Thu',  color: '#e07b39', border: '#bf4e0a' },
  { key: 'winter', label: '❄️ Đông', color: '#a0c4ff', border: '#5b9bd5' },
]

const DEFAULT_CAM    = new THREE.Vector3(0, 0, 6)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)

// depthWrite={false}: không ghi depth buffer → tránh che các object phía trước
// side={THREE.BackSide}: render mặt trong của sphere → camera nhìn vào từ bên trong
function MilkyWayBackground() {
  const tex = useTexture('/textures/milky_way.jpg')
  // Không set colorSpace để giữ màu tối tự nhiên, không bị gamma brighten
  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[155, 32, 32]} />
      <meshBasicMaterial
        map={tex}
        side={THREE.BackSide}
        opacity={0.18}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

function VRControls({ worldRef, vrZoomRef }) {
  useFrame(({ gl }, delta) => {
    const session = gl.xr.getSession()
    if (!session) return
    for (const source of session.inputSources) {
      if (!source.gamepad) continue
      const axes = source.gamepad.axes
      const stickX = axes[2] ?? 0
      const stickY = axes[3] ?? 0
      const DEAD_ZONE = 0.12
      if (source.handedness === 'left' && worldRef.current) {
        if (Math.abs(stickX) > DEAD_ZONE) worldRef.current.rotation.y -= stickX * delta * 1.4
        if (Math.abs(stickY) > DEAD_ZONE) worldRef.current.rotation.x -= stickY * delta * 1.0
        worldRef.current.rotation.x = THREE.MathUtils.clamp(worldRef.current.rotation.x, -Math.PI / 2, Math.PI / 2)
      }
      if (source.handedness === 'right' && vrZoomRef.current) {
        if (Math.abs(stickY) > DEAD_ZONE) {
          vrZoomRef.current.position.z = THREE.MathUtils.clamp(
            vrZoomRef.current.position.z + stickY * delta * 3, -4, 4
          )
        }
      }
    }
  })
  return null
}

function CameraResetter({ triggerRef, cancelRef, worldRef, vrZoomRef }) {
  const { camera } = useThree()
  const isResetting = useRef(false)
  const orbitRef    = useRef()

  useLayoutEffect(() => {
    triggerRef.current = (controls) => {
      orbitRef.current = controls
      isResetting.current = true
    }
    cancelRef.current = () => {
      isResetting.current = false
    }
  }, [triggerRef, cancelRef])

  useFrame((_, delta) => {
    if (!isResetting.current) return
    camera.position.lerp(DEFAULT_CAM, delta * 1.5)
    if (orbitRef.current) { orbitRef.current.target.lerp(DEFAULT_TARGET, delta * 1.5); orbitRef.current.update() }
    if (worldRef?.current) {
      worldRef.current.rotation.x = THREE.MathUtils.lerp(worldRef.current.rotation.x, 0, delta * 1.5)
      worldRef.current.rotation.y = THREE.MathUtils.lerp(worldRef.current.rotation.y, 0, delta * 1.5)
    }
    if (vrZoomRef?.current) vrZoomRef.current.position.z = THREE.MathUtils.lerp(vrZoomRef.current.position.z, 0, delta * 1.5)
    if (camera.position.distanceTo(DEFAULT_CAM) < 0.01) {
      camera.position.copy(DEFAULT_CAM)
      if (orbitRef.current) { orbitRef.current.target.copy(DEFAULT_TARGET); orbitRef.current.update() }
      isResetting.current = false
    }
  })
  return null
}

function VRTracker({ setIsVR }) {
  const { gl } = useThree()
  useEffect(() => {
    const onStart = () => setIsVR(true)
    const onEnd   = () => setIsVR(false)
    gl.xr.addEventListener('sessionstart', onStart)
    gl.xr.addEventListener('sessionend',   onEnd)
    return () => { gl.xr.removeEventListener('sessionstart', onStart); gl.xr.removeEventListener('sessionend', onEnd) }
  }, [gl, setIsVR])
  return null
}

export default function App() {
  const [speed,  setSpeed]  = useState(1)
  const [season, setSeason] = useState('summer')
  const [isVR,   setIsVR]   = useState(false)

  const orbitRef   = useRef()
  const triggerRef = useRef(() => {})
  const cancelRef  = useRef(() => {})
  const worldRef   = useRef()
  const vrZoomRef  = useRef()

  const sunWorldPosRef  = useRef(new THREE.Vector3(0, 0, -18))
  // ref để Moon xuất vị trí ra, Earth đọc vào để tính bóng ──────────
  const moonWorldPosRef = useRef(new THREE.Vector3(0, 8, 0))

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      {!isVR && (
        <div style={{
          position: 'absolute', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {SEASONS.map(s => (
              <button key={s.key} onClick={() => setSeason(s.key)} style={{
                padding: '8px 16px', fontSize: '13px', fontWeight: 'bold', fontFamily: 'sans-serif',
                background: season === s.key ? `linear-gradient(135deg, ${s.color}44, ${s.border}66)` : 'rgba(0,0,0,0.5)',
                color: season === s.key ? '#fff' : '#888',
                border: `2px solid ${season === s.key ? s.border : '#333'}`,
                borderRadius: '20px', cursor: 'pointer', transition: 'all 0.3s ease',
              }}>{s.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button onClick={() => triggerRef.current(orbitRef.current)} style={{
              padding: '14px 28px', fontSize: '15px', fontWeight: 'bold', borderRadius: '50px',
              background: '#16213e', color: '#a0c4ff', border: '2px solid #a0c4ff', cursor: 'pointer',
            }}>🎯 Reset Góc Nhìn</button>
            <button onClick={async () => {
              if (!navigator.xr) { alert('Trình duyệt không hỗ trợ WebXR.'); return }
              const ok = await navigator.xr.isSessionSupported('immersive-vr')
              if (!ok) { alert('Thiết bị không hỗ trợ Immersive VR.'); return }
              xrStore.enterVR()
            }} style={{
              padding: '14px 28px', fontSize: '15px', fontWeight: 'bold', borderRadius: '50px',
              background: '#2d1060', color: '#d4aaff', border: '2px solid #9b59f5', cursor: 'pointer',
            }}>🥽 Vào VR (Quest 3)</button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.55)',
            padding: '8px 18px', borderRadius: '20px', backdropFilter: 'blur(6px)',
          }}>
            <span style={{ color: '#aaa', fontSize: '13px' }}>🌍 Tốc độ quay</span>
            <input type="range" min="0" max="5" step="0.1" value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))} style={{ width: '120px' }} />
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>{speed.toFixed(1)}×</span>
          </div>
        </div>
      )}

      <Canvas
        shadows
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.NoToneMapping }}
      >
        <VRTracker setIsVR={setIsVR} />
        <XR store={xrStore}>
          <group ref={vrZoomRef}>
            <XROrigin position={[0, 0, 6]} />
          </group>
          <VRControls worldRef={worldRef} vrZoomRef={vrZoomRef} />
          <CameraResetter triggerRef={triggerRef} cancelRef={cancelRef} worldRef={worldRef} vrZoomRef={vrZoomRef} />

          <group ref={worldRef}>
            <ambientLight intensity={0.12} />
            <Sun season={season} sunWorldPosRef={sunWorldPosRef} />

            <Suspense fallback={null}>
              {/* moonWorldPosRef: Moon ghi vào, Earth đọc ra để tính bóng nguyệt thực */}
              <Moon sunWorldPosRef={sunWorldPosRef} speed={speed} moonWorldPosRef={moonWorldPosRef} />

              {/* Trái Đất nghiêng 23.5° */}
              <group rotation={[0, 0, THREE.MathUtils.degToRad(-23.5)]}>
                <Earth speed={speed} sunWorldPosRef={sunWorldPosRef} moonWorldPosRef={moonWorldPosRef} />
                <Atmosphere sunWorldPosRef={sunWorldPosRef} />
              </group>
            </Suspense>

            <Suspense fallback={null}>
              <MilkyWayBackground />
            </Suspense>
            <StarField />
          </group>

          <OrbitControls
            ref={orbitRef}
            enablePan={false}
            minDistance={3}
            maxDistance={12}
            onStart={() => cancelRef.current()}
          />
        </XR>
      </Canvas>
    </div>
  )
}