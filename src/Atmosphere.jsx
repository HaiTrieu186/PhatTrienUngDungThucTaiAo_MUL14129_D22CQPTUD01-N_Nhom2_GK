import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const atmosVertex = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec4 wPos  = modelMatrix * vec4(position, 1.0);
    vWorldPos  = wPos.xyz;
    vNormal    = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const atmosFragment = /* glsl */`
  uniform vec3 uSunDirection;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3  viewDir = normalize(cameraPosition - vWorldPos);
    vec3  N       = normalize(vNormal);

    // Fresnel rim - Đã giảm số mũ xuống 3.5 để quầng sáng khí quyển dày và mềm hơn
    float base    = 0.5 - dot(N, viewDir);
    float fresnel = pow(clamp(base, 0.0, 1.0), 3.5);

    // Sun-aware brightness
    float sunDot    = dot(N, normalize(uSunDirection));
    float sunFactor = smoothstep(-0.5, 0.8, sunDot) * 0.60 + 0.40;

    // Color: cyan-blue day, deep blue night
    vec3 dayColor   = vec3(0.22, 0.55, 1.00);
    vec3 nightColor = vec3(0.04, 0.09, 0.35);
    vec3 atmosColor = mix(nightColor, dayColor, smoothstep(-0.3, 0.7, sunDot));

    gl_FragColor = vec4(atmosColor, 1.0) * fresnel * sunFactor * 0.58;
  }
`

export default function Atmosphere({ sunWorldPosRef }) {
  const meshRef     = useRef()
  const atmosPos    = useRef(new THREE.Vector3())
  const sunDirWorld = useRef(new THREE.Vector3())

  const uniforms = useMemo(() => ({
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [])

  useFrame(() => {
    if (meshRef.current && sunWorldPosRef?.current) {
      meshRef.current.getWorldPosition(atmosPos.current)
      sunDirWorld.current
        .subVectors(sunWorldPosRef.current, atmosPos.current)
        .normalize()
      uniforms.uSunDirection.value.copy(sunDirWorld.current)
    }
  })

  return (
    <mesh
      ref={meshRef}
      // Đã tăng scale lên 1.18 để khí quyển trông bao phủ rộng hơn một chút
      scale={[1.18, 1.18, 1.18]}
      raycast={() => {}}
    >
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={atmosVertex}
        fragmentShader={atmosFragment}
        uniforms={uniforms}
        transparent
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
}