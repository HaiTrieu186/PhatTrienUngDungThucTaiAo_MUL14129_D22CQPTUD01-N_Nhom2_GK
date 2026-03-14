import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import Earth from './Earth'
import Atmosphere from './Atmosphere'

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <ambientLight intensity={0.05} />
        <directionalLight position={[5, 3, 5]} intensity={1.5} />

        <Suspense fallback={null}>
          <Earth />
          <Atmosphere />
        </Suspense>

        <Stars
          radius={100}
          depth={50}
          count={6000}
          factor={4}
          saturation={0}
          fade
        />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={3}
          maxDistance={12}
          autoRotate={false}
        />
      </Canvas>
    </div>
  )
}