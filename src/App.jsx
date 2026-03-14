import { Suspense, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import Earth from './Earth'
import Atmosphere from './Atmosphere'
import Sun from './Sun' 

const SEASONS = [
  { key: 'spring', label: '🌸 Xuân', color: '#a8e063', border: '#6abf4b' },
  { key: 'summer', label: '☀️ Hạ',   color: '#f9a825', border: '#ff6f00' },
  { key: 'autumn', label: '🍂 Thu',  color: '#e07b39', border: '#bf4e0a' },
  { key: 'winter', label: '❄️ Đông', color: '#a0c4ff', border: '#5b9bd5' },
]

export default function App() {
  const [isDay,  setIsDay]  = useState(true)
  const [speed,  setSpeed]  = useState(1)
  const [season, setSeason] = useState('summer')

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>

      <div style={{
        position: 'absolute',
        bottom: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}>

        {/* Nút chọn 4 mùa */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {SEASONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSeason(s.key)}
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 'bold',
                fontFamily: 'sans-serif',
                background: season === s.key
                  ? `linear-gradient(135deg, ${s.color}44, ${s.border}66)`
                  : 'rgba(0,0,0,0.5)',
                color: season === s.key ? '#fff' : '#888',
                border: `2px solid ${season === s.key ? s.border : '#333'}`,
                borderRadius: '20px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: season === s.key ? `0 0 14px ${s.color}88` : 'none',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Nút ngày/đêm */}
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

        {/* Slider tốc độ quay */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(0,0,0,0.55)',
          padding: '8px 18px',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(6px)',
        }}>
          <span style={{ color: '#aaa', fontSize: '13px', fontFamily: 'sans-serif' }}>
            🌍 Tốc độ quay
          </span>
          <input
            type="range" min="0" max="5" step="0.1" value={speed}
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
        <ambientLight intensity={0.15} />  {/* giảm xuống để đêm tối hơn */}

        {/* Mặt Trời nằm ngoài group nghiêng — world space */}
        <Sun isDay={isDay} season={season} /> 

        <Suspense fallback={null}>
          <group rotation={[0, 0, THREE.MathUtils.degToRad(-23.5)]}>
            <Earth isDay={isDay} speed={speed} season={season} />
            <Atmosphere />
          </group>
        </Suspense>

        <Stars radius={100} depth={50} count={6000} factor={4} saturation={0} fade />
        <OrbitControls enablePan={false} enableZoom={true} minDistance={3} maxDistance={12} />
      </Canvas>
    </div>
  )
}