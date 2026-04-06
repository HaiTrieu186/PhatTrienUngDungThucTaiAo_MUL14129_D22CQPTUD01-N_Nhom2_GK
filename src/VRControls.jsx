import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'


export default function VRControls({ worldRef }) {
  const { controllers } = useXR()

  // Velocity refs — không dùng useState để tránh re-render React mỗi frame
  const velYaw   = useRef(0)   // vận tốc xoay quanh trục Y (kinh độ)
  const velPitch = useRef(0)   // vận tốc xoay quanh trục X (vĩ độ)
  const velZoom  = useRef(0)   // vận tốc zoom (scale)

  // Reusable Quaternion objects — tránh tạo object mới mỗi frame (giảm GC pressure)
  const _qY  = useRef(new THREE.Quaternion())
  const _qX  = useRef(new THREE.Quaternion())
  const _axY = useRef(new THREE.Vector3(0, 1, 0))
  const _axX = useRef(new THREE.Vector3(1, 0, 0))

  useFrame((_, delta) => {
    if (!worldRef?.current) return

    // ── 1. Đọc input joystick từ tay cầm ──────────────────────────────────────
    //
    //   Quest 3 GamePad API layout:
    //     axes[0], axes[1] — thường là 0 (không dùng)
    //     axes[2]          — Thumbstick X (trái/phải)
    //     axes[3]          — Thumbstick Y (lên/xuống, -1=lên, +1=xuống)
    //
    //   Nếu xoay bị ngược chiều, đổi dấu nhân (ví dụ: -ax thay vì ax)

    const right = controllers.find(c => c.inputSource?.handedness === 'right')
    const left  = controllers.find(c => c.inputSource?.handedness === 'left')

    if (right?.inputSource?.gamepad) {
      const axes = right.inputSource.gamepad.axes
      const ax = axes[2] ?? 0   // thumbstick X → yaw
      const ay = axes[3] ?? 0   // thumbstick Y → pitch
      // Deadzone 0.08: lọc drift nhẹ của joystick vật lý
      if (Math.abs(ax) > 0.08) velYaw.current   += ax * delta * 1.8
      if (Math.abs(ay) > 0.08) velPitch.current += ay * delta * 1.8
    }

    if (left?.inputSource?.gamepad) {
      const axes = left.inputSource.gamepad.axes
      const ay = axes[3] ?? 0   // thumbstick Y trái → zoom
      // Đẩy lên (ay < 0) = zoom in (scale tăng), đẩy xuống = zoom out
      if (Math.abs(ay) > 0.08) velZoom.current -= ay * delta * 1.2
    }

    // ── 2. Exponential Damping — quán tính suy giảm theo hàm mũ ───────────────
    //
    //   Công thức: v(t) = v(t-1) * e^(-k * Δt)
    //   k = 5.5: suy giảm vừa phải — dừng sau ~0.4 giây khi thả tay
    //   Frame-rate independent: không phụ thuộc FPS (72Hz vs 90Hz)
    const decay = Math.exp(-5.5 * delta)
    velYaw.current   *= decay
    velPitch.current *= decay
    velZoom.current  *= decay

    // ── 3. Áp dụng xoay qua Quaternion (không Gimbal Lock) ────────────────────
    //
    //   Không dùng rotation.x += vel vì sẽ bị Gimbal Lock khi pitch ±90°
    //   Quaternion premultiply đảm bảo xoay liên tục, trơn tru, 360° mọi hướng
    if (Math.abs(velYaw.current) > 0.00005 || Math.abs(velPitch.current) > 0.00005) {
      _qY.current.setFromAxisAngle(_axY.current, velYaw.current)
      _qX.current.setFromAxisAngle(_axX.current, velPitch.current)
      worldRef.current.quaternion
        .premultiply(_qY.current)
        .premultiply(_qX.current)
    }

    // ── 4. Zoom qua scale — an toàn cho VR (không thay đổi FOV) ───────────────
    //
    //   Scale 0.35 = nhìn từ xa (thấy quỹ đạo Mặt Trăng)
    //   Scale 1.00 = mặc định
    //   Scale 2.80 = zoom gần, thấy chi tiết lục địa
    if (Math.abs(velZoom.current) > 0.00005) {
      const currentScale = worldRef.current.scale.x
      const newScale = THREE.MathUtils.clamp(
        currentScale + velZoom.current * 0.06,
        0.35,
        2.8
      )
      worldRef.current.scale.setScalar(newScale)
    }
  })

  // Component này không render gì — chỉ xử lý logic trong useFrame
  return null
}