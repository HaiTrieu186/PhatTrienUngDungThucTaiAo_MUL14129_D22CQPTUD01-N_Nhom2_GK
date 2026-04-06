import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Tham số địa lý — khớp với Earth.jsx (radius = 2.0) ───────────────────────
//
//   Vật lý thực tế:
//     - Vành đai cực quang (Auroral Oval): vĩ độ 65°–75°, trung tâm ≈ 70°
//     - Độ cao thực: 90km (đáy, N₂ tím) → 150km (thân, O₂ xanh) → 300km (đỉnh, O₂ đỏ)
//     - Hình dạng: KHÔNG phải vòng tròn hoàn hảo — oval lệch, uốn khúc theo áp lực gió mặt trời
//     - Ban ngày (sunAngle > 0): mờ, ngả đỏ vì tương tác ở tầng khí quyển cực cao
//     - Ban đêm (sunAngle < 0): rực rỡ, đầy đủ màu sắc

const EARTH_R = 2.0
const LIFT    = 1.048

const LAT_CENTER = 70   // vĩ độ 70° (thực tế hơn 72°)

// Bán kính + chiều cao trụ (tỷ lệ mô hình)
const AURORA_RADIUS = EARTH_R * LIFT * Math.cos(LAT_CENTER * Math.PI / 180)  // ≈ 0.71
const AURORA_HEIGHT = 0.30   // tăng từ 0.20 → thấy rõ chiều cao hơn từ không gian
const AURORA_Y      = EARTH_R * LIFT * Math.sin(LAT_CENTER * Math.PI / 180)  // ≈ 1.97

// ─────────────────────────────────────────────────────────────────────────────
// VERTEX SHADER — Displacement để phá vỡ hình tròn hoàn hảo
// ─────────────────────────────────────────────────────────────────────────────
//
//   NGUYÊN LÝ:
//     CylinderGeometry tạo vòng tròn hoàn hảo → trông giả.
//     Trong thực tế, Auroral Oval bị méo bởi áp lực gió Mặt Trời:
//       - Phía ban ngày (dayside): oval bị nén vào → bán kính nhỏ hơn
//       - Phía ban đêm (nightside): oval bị kéo ra → bán kính lớn hơn
//     Ta mô phỏng điều này bằng multi-frequency sine displacement theo góc + thời gian.
//
//   TẠI SAO KHÔNG DÙNG NOISE TEXTURE?
//     → Tránh texture sampler trong vertex shader (không được hỗ trợ trên một số thiết bị Quest)
//     → Sin tổ hợp đủ "hữu cơ" và rẻ hơn nhiều (< 1ms GPU trên Quest 3)
//
//   UVs sau displacement vẫn nguyên — fragment shader không bị ảnh hưởng ✓
//   Normal vẫn là normal trụ → sunDir dot product cho day/night vẫn đúng ✓

const auroraVert = /* glsl */`
  precision highp float;

  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  #define TAU 6.28318530718

  void main() {
    vUv = uv;

    // Góc quanh chu vi (uv.x = 0→1 ↔ angle = 0→2π)
    float angle = uv.x * TAU;

    // ── Radial displacement — phá vỡ hình tròn ───────────────────────────────
    //   4 thành phần sóng với tần số + tốc độ khác nhau:
    //     Tần số thấp (1,2): biến dạng oval lớn, drift chậm
    //     Tần số cao (5,9):  chi tiết nhỏ uốn khúc, chuyển động nhanh hơn
    //   Tổng displacement tối đa ≈ ±0.22 → oval có thể méo tới ~22%

    float d1 = sin(angle * 1.0 + uTime * 0.040) * 0.12;   // oval lớn, rất chậm
    float d2 = sin(angle * 2.0 - uTime * 0.060 + 1.20) * 0.07;  // oval thứ 2
    float d3 = sin(angle * 5.0 + uTime * 0.110 + 2.50) * 0.04;  // gợn vừa
    float d4 = sin(angle * 9.0 - uTime * 0.085 + 0.80) * 0.02;  // gợn nhỏ

    // Bất đối xứng ngày/đêm: phía trước (z+) hơi bị kéo ra (nightside tail)
    float asymmetry = sin(angle) * 0.04;  // z+ → nightside → to ra; z- → dayside → nhỏ vào

    float radialScale = 1.0 + d1 + d2 + d3 + d4 + asymmetry;

    // ── Apply displacement (chỉ scale X,Z — không đụng Y) ────────────────────
    vec3 pos = position;
    pos.x   *= radialScale;
    pos.z   *= radialScale;

    // Nhúng sóng dọc nhẹ → đỉnh rèm lúc lên lúc xuống tự nhiên
    pos.y += sin(angle * 4.0 + uTime * 0.09) * 0.018
           + sin(angle * 7.0 - uTime * 0.13 + 1.1) * 0.009;

    // Normal sang world space (dùng normal gốc của trụ — OK cho day/night mask)
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

// ─────────────────────────────────────────────────────────────────────────────
// FRAGMENT SHADER — Màu sắc vật lý đầy đủ + Day/Night cải tiến
// ─────────────────────────────────────────────────────────────────────────────
//
//   BẢNG MÀU THEO VẬT LÝ (từ tài liệu nghiên cứu):
//     v = 0.00–0.12  Tím/Xanh dương  N₂  dưới 100km    [viền đáy sắc nét]
//     v = 0.08–0.50  Xanh lá rực     O₂  100–150km     [màu chủ đạo, sáng nhất]
//     v = 0.45–0.72  Xanh lam/cyan   O₂  150–200km     [chuyển tiếp]
//     v = 0.68–1.00  Đỏ/Hồng         O₂  trên 200km    [đỉnh mờ dần]
//
//   DAY/NIGHT MASK:
//     sunAngle > +0.20  → ban ngày: alpha cực thấp (0.05–0.12), màu ngả đỏ/cam
//     sunAngle ≈ 0      → rạng sáng/hoàng hôn: mờ dần, bắt đầu thấy được
//     sunAngle < -0.15  → ban đêm: alpha đầy đủ (0.75–0.92), màu rực rỡ
//
//   HIỆU ỨNG TIA DỌC (Vertical Rays):
//     3 tần số giao thoa → pattern sọc hữu cơ, không đều
//     pow(..., 0.5) làm nét các tia sáng (contrast tăng)
//
//   ⚠ precision highp float BẮT BUỘC — tránh banding artifact trên Quest 3

const auroraFrag = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform vec3  uSunDir;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  #define PI  3.14159265359
  #define TAU 6.28318530718

  void main() {
    float u = vUv.x;   // 0–1 quanh vòng (seamless)
    float v = vUv.y;   // 0=đáy trụ (90km), 1=đỉnh trụ (300km+)

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 1: Tia dọc (Vertical Ray Columns)
    //   Đặc trưng nổi bật nhất của cực quang — các cột sáng chạy dọc theo
    //   đường sức từ trường. Ba tần số giao thoa tạo pattern không đều.
    // ════════════════════════════════════════════════════════════════════════
    float ray1 = sin(u * TAU * 48.0 + uTime * 0.35) * 0.5 + 0.5;
    float ray2 = sin(u * TAU * 29.0 - uTime * 0.22 + 1.40) * 0.5 + 0.5;
    float ray3 = sin(u * TAU * 71.0 + uTime * 0.55 + 2.80) * 0.5 + 0.5;
    // pow < 1: làm rõ đỉnh sáng, giữ vùng tối vẫn tối (contrast kiểu gamma)
    float rays  = pow(ray1 * (0.45 + 0.55 * ray2) * (0.60 + 0.40 * ray3), 0.50);

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 2: Sóng rèm ngang (Curtain Waves)
    //   Cực quang "nhảy múa" theo gió mặt trời — 4 sóng tần số thấp hơn,
    //   giao thoa tạo chuyển động hữu cơ, không lặp lại.
    // ════════════════════════════════════════════════════════════════════════
    float w1 = sin(u * TAU *  9.0 + uTime * 1.40) * 0.5 + 0.5;
    float w2 = sin(u * TAU * 16.0 - uTime * 1.90 + 1.047) * 0.5 + 0.5;
    float w3 = sin(u * TAU *  5.0 + uTime * 0.65 + 2.094) * 0.5 + 0.5;
    float w4 = sin(u * TAU * 23.0 - uTime * 2.30 + 0.524) * 0.5 + 0.5;
    float curtain = mix(w1 * w2, w3 * w4, 0.45) * (0.50 + 0.50 * w3);

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 3: Profile chiều cao (Height Brightness Profile)
    //   Thực tế: sáng nhất ở khoảng 1/4 từ đáy lên (vùng O₂ 100-130km).
    //   Dùng bell curve lệch (skewed) thay vì linear để tự nhiên hơn.
    // ════════════════════════════════════════════════════════════════════════
    // Đỉnh sáng nhất ở v ≈ 0.25 (lower third)
    float peakV   = 0.25;
    float bellW   = 0.35;
    float bell    = exp(-pow((v - peakV) / bellW, 2.0) * 2.0);
    // Fade cứng ở đáy để không dính vào bề mặt Trái Đất
    float botFade = smoothstep(0.0, 0.07, v);
    float vertBrightness = bell * botFade;

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 4: Đỉnh rèm lượn sóng bất thường (Irregular Wavy Top Edge)
    //   Đỉnh trên không bằng phẳng: 3 sóng giao thoa → rèm có "răng cưa" mềm
    // ════════════════════════════════════════════════════════════════════════
    float top1 = 0.78 + 0.14 * sin(u * TAU *  6.0 + uTime * 1.00);
    float top2 = 0.72 + 0.11 * sin(u * TAU * 11.0 - uTime * 0.75 + 0.80);
    float top3 = 0.85 + 0.08 * sin(u * TAU *  3.0 + uTime * 0.45 + 1.60);
    float topFade = smoothstep(top1, top1 - 0.20, v)
                  * smoothstep(top2, top2 - 0.14, v)
                  * smoothstep(top3, top3 - 0.25, v);

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 5: Màu sắc theo chiều cao (Physical Color Gradient)
    //
    //   Đáy → Đỉnh: Tím → Xanh lá → Cyan → Đỏ/Hồng
    //   (khớp với bảng màu trong tài liệu nghiên cứu)
    // ════════════════════════════════════════════════════════════════════════

    // Màu các tầng
    vec3 purpleBot = vec3(0.32, 0.06, 0.85);   // N₂, < 100km
    vec3 greenMain = vec3(0.04, 1.00, 0.30);   // O₂, 100–150km (màu chủ đạo rực nhất)
    vec3 greenCyan = vec3(0.02, 0.80, 0.72);   // O₂, 150–200km
    vec3 cyanBlue  = vec3(0.08, 0.55, 0.95);   // O₂/N₂ transition
    vec3 redPink   = vec3(0.95, 0.18, 0.35);   // O₂, > 200km (đỉnh đỏ)
    vec3 pinkFade  = vec3(1.00, 0.45, 0.60);   // O₂, rất cao — hồng nhạt

    // Blend tuần tự theo v (chiều cao)
    vec3 col = purpleBot;
    col = mix(col,      greenMain, smoothstep(0.00, 0.18, v));   // tím → xanh lá
    col = mix(col,      greenCyan, smoothstep(0.35, 0.58, v));   // xanh lá → lam lục
    col = mix(col,      cyanBlue,  smoothstep(0.55, 0.72, v));   // lam lục → cyan
    col = mix(col,      redPink,   smoothstep(0.68, 0.90, v));   // cyan → đỏ
    col = mix(col,      pinkFade,  smoothstep(0.85, 1.00, v) * 0.55); // đỏ → hồng nhạt

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 6: Day/Night Mask + Dawn Tint
    //
    //   sunAngle = dot(normal, sunDir):
    //     > +0.20  → phía sáng (dayside): rất mờ, màu ngả đỏ/cam
    //     ≈ 0      → terminator (rạng sáng/hoàng hôn): mờ vừa
    //     < -0.15  → phía tối (nightside): rực rỡ đầy đủ
    //
    //   Thực tế khoa học:
    //     - Cực quang ban ngày (Dayside Aurora) tồn tại ở Polar Cusp
    //     - Nhưng bị ánh sáng Mặt Trời lấn át → cần alpha rất thấp
    //     - Màu ban ngày thiên đỏ vì particle năng lượng thấp ở tầng cao
    // ════════════════════════════════════════════════════════════════════════
    float sunAngle  = dot(normalize(vWorldNormal), normalize(uSunDir));

    // nightMask: 1.0 về đêm, gần 0 ban ngày
    // smoothstep(0.22, -0.18, ...): terminator sắc nét hơn bản gốc
    float nightMask = smoothstep(0.22, -0.18, sunAngle);

    // Dayside aurora: cực kỳ mờ (alpha ~0.06), vẫn thấy được để "đúng vật lý"
    float dayAurora = smoothstep(0.40, 0.10, sunAngle) * (1.0 - nightMask) * 0.06;

    // Dawn tint: vùng terminator ngả đỏ/cam (tương tác tầng khí quyển cao)
    float dawnZone  = smoothstep(0.35, 0.0, sunAngle) * smoothstep(-0.15, 0.35, sunAngle);
    vec3  dawnColor = mix(col, col * vec3(1.30, 0.65, 0.40) + vec3(0.08, 0.0, 0.0), dawnZone * 0.55);

    // Ban đêm dùng màu đầy đủ; ban ngày dùng màu ngả đỏ/cam
    col = mix(dawnColor, col, nightMask);

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 7: Tổng hợp alpha
    // ════════════════════════════════════════════════════════════════════════
    // Nhân tất cả các mask với nhau + scale cuối
    float alphaNight = curtain * rays * vertBrightness * topFade * botFade * nightMask;
    float alpha = clamp(alphaNight * 0.90 + dayAurora, 0.0, 1.0);

    // Tránh hoàn toàn vô hình: nếu alpha quá nhỏ → discard (tối ưu fill rate Quest 3)
    if (alpha < 0.005) discard;

    gl_FragColor = vec4(col, alpha);
  }
`

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
//
//   Đặt bên trong <group ref={earthGroupRef}> của Earth.jsx.
//
// 
//     1. Vertex shader có uTime → displacement để phá vỡ hình tròn
//     2. heightSegments tăng 10 → 18 (cần nhiều hơn cho vertex displacement mượt)
//     3. radialSegments giảm 128 → 96 (tiết kiệm ~25% vertex, Quest 3 vẫn mịn)
//     4. AURORA_HEIGHT tăng 0.20 → 0.30 (thấy rõ hơn từ không gian)
//     5. LAT_CENTER = 70° (thực tế hơn 72°)
//     6. Thêm uTime vào uniforms (cần cho vertex displacement)

export default function AuroraRings({ sunWorldPosRef }) {
  const northRef  = useRef()
  const _worldPos = useRef(new THREE.Vector3())

  const uniforms = useMemo(() => ({
    uTime:   { value: 0 },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
  }), [])

  useFrame((_, delta) => {
    uniforms.uTime.value += delta

    if (northRef.current && sunWorldPosRef?.current) {
      northRef.current.getWorldPosition(_worldPos.current)
      uniforms.uSunDir.value
        .subVectors(sunWorldPosRef.current, _worldPos.current)
        .normalize()
    }
  })

  const shaderProps = {
    vertexShader:   auroraVert,
    fragmentShader: auroraFrag,
    uniforms,
    transparent:    true,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false,
    side:           THREE.DoubleSide,
  }

  // Geometry args: [radiusTop, radiusBottom, height, radialSeg, heightSeg, openEnded]
  //   radialSegments = 96  (đủ mịn, nhẹ hơn 128)
  //   heightSegments = 18  (cần nhiều hơn cho vertex displacement nhìn mượt)
  const geoArgs = [AURORA_RADIUS, AURORA_RADIUS, AURORA_HEIGHT, 96, 18, true]

  return (
    <group>
      {/* Cực Bắc */}
      <mesh ref={northRef} position={[0, AURORA_Y, 0]}>
        <cylinderGeometry args={geoArgs} />
        <shaderMaterial {...shaderProps} />
      </mesh>

      {/* Cực Nam — mirror qua trục Y */}
      <mesh position={[0, -AURORA_Y, 0]}>
        <cylinderGeometry args={geoArgs} />
        <shaderMaterial {...shaderProps} />
      </mesh>
    </group>
  )
}