import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import Earth from './Earth'
import Atmosphere from './Atmosphere'

export default function App() {
  const [isDay, setIsDay] = useState(true)

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>

      {/* Nút toggle*/}
      <div style={{
        position: 'absolute',
        bottom: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
      }}>
        <button
          onClick={() => setIsDay(prev => !prev)}
          style={{
            padding: '14px 36px',
            fontSize: '16px',
            fontWeight: 'bold',
            fontFamily: 'sans-serif',
            background: isDay
              ? 'linear-gradient(135deg, #1a1a2e, #16213e)'
              : 'linear-gradient(135deg, #f9a825, #ff6f00)',
            color: isDay ? '#a0c4ff' : '#fff',
            border: `2px solid ${isDay ? '#a0c4ff' : '#ffca28'}`,
            borderRadius: '50px',
            cursor: 'pointer',
            letterSpacing: '1px',
            boxShadow: isDay
              ? '0 0 20px rgba(100,160,255,0.4)'
              : '0 0 20px rgba(255,180,0,0.5)',
            transition: 'all 0.4s ease',
          }}
        >
          {isDay ? '🌙 Chuyển sang Đêm' : '☀️ Chuyển sang Ngày'}
        </button>
      </div>

      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <ambientLight intensity={0.3} />
        <directionalLight position={[5, 3, 5]} intensity={2.5} />

        <Suspense fallback={null}>
          <Earth isDay={isDay} />
          <Atmosphere />
        </Suspense>

        <Stars radius={100} depth={50} count={6000} factor={4} saturation={0} fade />
        <OrbitControls enablePan={false} enableZoom={true} minDistance={3} maxDistance={12} />
      </Canvas>
    </div>
  )
}