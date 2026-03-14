import { Suspense, useState, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import { XR, createXRStore } from '@react-three/xr'
import * as THREE from 'three'
import Earth from './Earth'
import Atmosphere from './Atmosphere'
import Sun from './Sun'

// Tạo XR store — quản lý phiên VR
const xrStore = createXRStore()

const SEASONS = [
  { key: 'spring', label: '🌸 Xuân', color: '#a8e063', border: '#6abf4b' },
  { key: 'summer', label: '☀️ Hạ',   color: '#f9a825', border: '#ff6f00' },
  { key: 'autumn', label: '🍂 Thu',  color: '#e07b39', border: '#bf4e0a' },
  { key: 'winter', label: '❄️ Đông', color: '#a0c4ff', border: '#5b9bd5' },
]

const DEFAULT_CAM    = new THREE.Vector3(0, 0, 6)
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0)

function CameraResetter({ triggerRef, cancelRef }) {
  const { camera } = useThree()
  const isResetting = useRef(false)
  const orbitRef    = useRef()

  triggerRef.current = (controls) => {
    orbitRef.current    = controls
    isResetting.current = true
  }

  cancelRef.current = () => {
    isResetting.current = false
  }

  useFrame((_, delta) => {
    if (!isResetting.current) return
    camera.position.lerp(DEFAULT_CAM, delta * 1.5)
    if (orbitRef.current) {
      orbitRef.current.target.lerp(DEFAULT_TARGET, delta * 1.5)
      orbitRef.current.update()
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

export default function App() {
  const [speed,  setSpeed]  = useState(1)
  const [season, setSeason] = useState('summer')
  const orbitRef   = useRef()
  const triggerRef = useRef(() => {})
  const cancelRef  = useRef(() => {})

  const handleReset = () => triggerRef.current(orbitRef.current)

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>

      {/* UI controls */}
      <div style={{
        position: 'absolute', bottom: '32px', left: '50%',
        transform: 'translateX(-50%)', zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
      }}>

        {/* Nút 4 mùa */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {SEASONS.map(s => (
            <button key={s.key} onClick={() => setSeason(s.key)} style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: 'bold',
              fontFamily: 'sans-serif',
              background: season === s.key
                ? `linear-gradient(135deg, ${s.color}44, ${s.border}66)`
                : 'rgba(0,0,0,0.5)',
              color: season === s.key ? '#fff' : '#888',
              border: `2px solid ${season === s.key ? s.border : '#333'}`,
              borderRadius: '20px', cursor: 'pointer', transition: 'all 0.3s ease',
              boxShadow: season === s.key ? `0 0 14px ${s.color}88` : 'none',
            }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Hàng 2 nút: Reset + Enter VR */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>

          {/* Nút về góc nhìn chuẩn */}
          <button onClick={handleReset} style={{
            padding: '14px 28px', fontSize: '15px', fontWeight: 'bold',
            fontFamily: 'sans-serif',
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
            color: '#a0c4ff', border: '2px solid #a0c4ff', borderRadius: '50px',
            cursor: 'pointer', letterSpacing: '1px',
            boxShadow: '0 0 20px rgba(100,160,255,0.4)', transition: 'all 0.4s ease',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #16213e, #0f3460)'
              e.currentTarget.style.boxShadow  = '0 0 28px rgba(100,160,255,0.7)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #1a1a2e, #16213e)'
              e.currentTarget.style.boxShadow  = '0 0 20px rgba(100,160,255,0.4)'
            }}
          >
            🎯 Về góc nhìn chuẩn
          </button>

          {/* Nút Enter VR — chỉ hiện trên thiết bị hỗ trợ WebXR */}
          <button
            onClick={() => xrStore.enterVR()}
            style={{
              padding: '14px 28px', fontSize: '15px', fontWeight: 'bold',
              fontFamily: 'sans-serif',
              background: 'linear-gradient(135deg, #1a0a2e, #2d1060)',
              color: '#d4aaff', border: '2px solid #9b59f5', borderRadius: '50px',
              cursor: 'pointer', letterSpacing: '1px',
              boxShadow: '0 0 20px rgba(155,89,245,0.4)', transition: 'all 0.4s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #2d1060, #1a0a2e)'
              e.currentTarget.style.boxShadow  = '0 0 28px rgba(155,89,245,0.7)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #1a0a2e, #2d1060)'
              e.currentTarget.style.boxShadow  = '0 0 20px rgba(155,89,245,0.4)'
            }}
          >
            🥽 Vào VR
          </button>
        </div>

        {/* Slider tốc độ quay */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(0,0,0,0.55)', padding: '8px 18px',
          borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(6px)',
        }}>
          <span style={{ color: '#aaa', fontSize: '13px', fontFamily: 'sans-serif' }}>
            🌍 Tốc độ quay
          </span>
          <input type="range" min="0" max="5" step="0.1" value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
            style={{ width: '120px', cursor: 'pointer', accentColor: '#a0c4ff' }}
          />
          <span style={{
            color: '#fff', fontSize: '13px', fontFamily: 'monospace',
            minWidth: '36px', fontWeight: 'bold',
          }}>
            {speed.toFixed(1)}×
          </span>
        </div>
      </div>

      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        {/* XR bọc toàn bộ scene — bắt buộc để WebXR hoạt động */}
        <XR store={xrStore}>
          <ambientLight intensity={0.15} />
          <Sun season={season} />
          <CameraResetter triggerRef={triggerRef} cancelRef={cancelRef} />

          <Suspense fallback={null}>
            <group rotation={[0, 0, THREE.MathUtils.degToRad(-23.5)]}>
              <Earth speed={speed} season={season} />
              <Atmosphere />
            </group>
          </Suspense>

          <Stars radius={100} depth={50} count={6000} factor={4} saturation={0} fade />
          <OrbitControls
            ref={orbitRef}
            enablePan={false}
            enableZoom={true}
            minDistance={3}
            maxDistance={12}
            onStart={() => cancelRef.current()}
          />
        </XR>
      </Canvas>
    </div>
  )
}