import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text, Billboard } from '@react-three/drei'
import * as THREE from 'three'

// Shader tính toán vertex
const earthVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Shader xử lý pha trộn bản đồ Ngày/Đêm dựa vào ánh sáng
const earthFragment = `
  precision mediump float;
  uniform sampler2D uDayTexture;
  uniform sampler2D uNightTexture;
  uniform vec3 uSunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 dayColor   = texture2D(uDayTexture, vUv).rgb;
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb;
    
    vec3 normal  = normalize(vNormal);
    vec3 sunDir  = normalize(uSunDirection);

    // Tính góc chiếu sáng (Tích vô hướng giữa pháp tuyến bề mặt và hướng nắng)
    // > 0: Ban ngày | < 0: Ban đêm
    float sunOrientation = dot(normal, sunDir);
    
    // Smoothstep tạo vùng chuyển tiếp mượt mà giữa ngày và đêm
    float dayMix = smoothstep(-0.25, 0.25, sunOrientation);

    // Tính toán dải màu chạng vạng (Hoàng hôn/Bình minh) ở ranh giới
    float twilight = smoothstep(-0.25, 0.25, sunOrientation) - smoothstep(0.0, 0.5, sunOrientation);
    vec3 twilightColor = vec3(1.0, 0.4, 0.1) * twilight * 0.6;

    // Tăng độ sáng cho ánh đèn thành phố ban đêm
    vec3 boostedNight = nightColor * 2.8 + vec3(0.03, 0.03, 0.05);
    
    // Xuất màu cuối cùng
    vec3 finalColor = mix(boostedNight, dayColor, dayMix) + twilightColor;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

// Chuyển đổi tọa độ Địa lý (Vĩ độ, Kinh độ) sang không gian 3D (Cartesian)
function latLonToXYZ(lat, lon, r) {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  )
}

const CONTINENTS = [
  { name: 'Bắc Mỹ', lat: 60, lon: -100 }, { name: 'Châu Âu', lat: 52, lon: 15 },
  { name: 'Đông Nam Á', lat: 5, lon: 115 }, // ... Thêm các châu lục khác vào đây
]

// Component hiển thị tên Châu lục tương tác được
function ContinentLabel({ name, lat, lon }) {
  const [hovered, setHovered] = useState(false)
  const hitPos  = useMemo(() => latLonToXYZ(lat, lon, 2.08), [lat, lon])
  const textPos = useMemo(() => latLonToXYZ(lat, lon, 2.55), [lat, lon])

  return (
    <group>
      <mesh position={hitPos} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>
      {hovered && (
        <Billboard position={textPos} follow={true}>
          <Text fontSize={0.13} color="#ffffff" outlineWidth={0.008} outlineColor="#000000">
            {name}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

export default function Earth({ speed = 1, sunWorldPosRef }) {
  const earthGroupRef = useRef()
  const cloudsRef     = useRef()

  const [dayTex, nightTex, cloudsTex] = useTexture(['/textures/day.jpg', '/textures/night.jpg', '/textures/clouds.jpg'])
  dayTex.colorSpace   = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace

  const localSunDir = useRef(new THREE.Vector3())
  const earthWorldPos = useRef(new THREE.Vector3())

  const earthUniforms = useMemo(() => ({
    uDayTexture:   { value: dayTex },
    uNightTexture: { value: nightTex },
    uSunDirection: { value: new THREE.Vector3(0, 0, -1) },
  }), [dayTex, nightTex])

  useFrame((_, delta) => {
    // Trái Đất tự quay quanh trục
    if (earthGroupRef.current) earthGroupRef.current.rotation.y += delta * 0.05 * speed
    // Mây trôi nhanh hơn bề mặt một chút tạo hiệu ứng thị giác
    if (cloudsRef.current)     cloudsRef.current.rotation.y     += delta * 0.08 * speed

    // Cập nhật hướng ánh sáng liên tục để Shader xử lý ngày/đêm chính xác trong VR
    if (earthGroupRef.current && sunWorldPosRef?.current) {
      earthGroupRef.current.getWorldPosition(earthWorldPos.current)
      localSunDir.current.subVectors(sunWorldPosRef.current, earthWorldPos.current).normalize()
      earthGroupRef.current.worldToLocal(localSunDir.current)
      earthUniforms.uSunDirection.value.copy(localSunDir.current.normalize())
    }
  })

  return (
    <group>
      <group ref={earthGroupRef}>
        <mesh>
          <sphereGeometry args={[2, 64, 64]} />
          <shaderMaterial vertexShader={earthVertex} fragmentShader={earthFragment} uniforms={earthUniforms} />
        </mesh>
        {CONTINENTS.map(c => <ContinentLabel key={c.name} {...c} />)}
      </group>

      {/* Lớp mây với alphaMap */}
      <mesh ref={cloudsRef} scale={[1.012, 1.012, 1.012]}>
        <sphereGeometry args={[2, 64, 64]} />
        <meshStandardMaterial map={cloudsTex} alphaMap={cloudsTex} color="white" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  )
}