import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Tăng lên 12000 – vẫn rất mượt trên Quest 3 (chỉ là points, rất nhẹ)
const STAR_COUNT = 5000

// Spectral class colors (approximate blackbody RGB for Quest 3 display)
// Weighted toward real stellar population (M-dwarfs dominate the galaxy)
const SPECTRAL_CLASSES = [
  { color: [0.61, 0.70, 1.00], weight: 0.0003 }, // O – Intense blue (cực hiếm)
  { color: [0.68, 0.76, 1.00], weight: 0.0013 }, // B – Blue-white
  { color: [0.80, 0.87, 1.00], weight: 0.006  }, // A – White-blue
  { color: [0.97, 0.97, 1.00], weight: 0.03   }, // F – White
  { color: [1.00, 0.95, 0.88], weight: 0.073  }, // G – Yellow-white (like Sun)
  { color: [1.00, 0.82, 0.63], weight: 0.121  }, // K – Orange
  { color: [1.00, 0.78, 0.42], weight: 0.769  }, // M – Red-orange (phổ biến nhất)
]

const CUM_WEIGHTS = SPECTRAL_CLASSES.reduce((acc, cls, i) => {
  acc.push((acc[i - 1] ?? 0) + cls.weight)
  return acc
}, [])

function pickSpectralClass() {
  const r = Math.random()
  for (let i = 0; i < CUM_WEIGHTS.length; i++) {
    if (r < CUM_WEIGHTS[i]) return SPECTRAL_CLASSES[i]
  }
  return SPECTRAL_CLASSES[SPECTRAL_CLASSES.length - 1]
}

export default function StarField() {
  const pointsRef = useRef()
  const uniforms  = useMemo(() => ({ uTime: { value: 0 } }), [])

  const { positions, aColors, aSizes } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3)
    const aColors   = new Float32Array(STAR_COUNT * 3)
    const aSizes    = new Float32Array(STAR_COUNT)

    for (let i = 0; i < STAR_COUNT; i++) {
      // Marsaglia method: uniform distribution on sphere surface (không bias)
      const u = Math.random() * 2 - 1
      const t = Math.random() * 2 * Math.PI
      const s = Math.sqrt(1 - u * u)
      const r = 175 + Math.random() * 25

      positions[i * 3]     = r * s * Math.cos(t)
      positions[i * 3 + 1] = r * u
      positions[i * 3 + 2] = r * s * Math.sin(t)

      const cls = pickSpectralClass()
      aColors[i * 3]     = cls.color[0]
      aColors[i * 3 + 1] = cls.color[1]
      aColors[i * 3 + 2] = cls.color[2]

      const mag = Math.random()
      aSizes[i] = mag < 0.003 ? 3.5 + Math.random() * 2.5
               :  mag < 0.04  ? 1.4 + Math.random() * 1.4
               :  mag < 0.20  ? 0.7 + Math.random() * 0.6
               :                0.3 + Math.random() * 0.4
    }
    return { positions, aColors, aSizes }
  }, [])

  useFrame(({ clock }) => { uniforms.uTime.value = clock.elapsedTime })

  const vertexShader = /* glsl */`
    precision highp float;
    attribute vec3  aColor;
    attribute float aSize;

    varying vec3  vColor;
    varying float vTwinkle;
    uniform float uTime;

    void main() {
      vColor = aColor;

      // Per-star twinkling dựa vào position hash
      // → đảm bảo 2 mắt VR thấy cùng nhịp nháy (tránh gây khó chịu)
      float seed  = dot(position, vec3(127.1, 311.7, 74.7));
      float freq  = 0.4 + fract(sin(seed)       * 43758.5453) * 2.2;
      float phase = fract(cos(seed * 3.7)        * 43758.5453) * 6.28318;

      // Tăng biên độ nhấp nháy: 0.87+0.13 → 0.82+0.18
      // Sao nhấp nháy rõ hơn, tự nhiên hơn nhưng không gây khó chịu VR
      vTwinkle = 0.82 + 0.18 * sin(uTime * freq + phase);

      vec4 mvPos   = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * (260.0 / -mvPos.z);
      gl_Position  = projectionMatrix * mvPos;
    }
  `

  const fragmentShader = /* glsl */`
    precision mediump float;
    varying vec3  vColor;
    varying float vTwinkle;

    void main() {
      vec2  uv = gl_PointCoord * 2.0 - 1.0;
      float d  = dot(uv, uv);
      if (d > 1.0) discard;

      float alpha = (1.0 - smoothstep(0.15, 1.0, d)) * vTwinkle;
      gl_FragColor = vec4(vColor * vTwinkle, alpha);
    }
  `

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={STAR_COUNT} array={positions} itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aColor"
          count={STAR_COUNT} array={aColors} itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aSize"
          count={STAR_COUNT} array={aSizes} itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}