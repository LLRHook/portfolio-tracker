import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html } from '@react-three/drei';
import * as THREE from 'three';

const COLORS = ['#22d3ee', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#64748b'];

function formatCurrency(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);
}

function DonutSegment({ innerRadius, outerRadius, startAngle, endAngle, color, label, value, total }) {
  const mesh = useRef();
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const segments = 48;
    const angleRange = endAngle - startAngle;

    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (i / segments) * angleRange;
      const x = Math.cos(angle) * outerRadius;
      const y = Math.sin(angle) * outerRadius;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    for (let i = segments; i >= 0; i--) {
      const angle = startAngle + (i / segments) * angleRange;
      const x = Math.cos(angle) * innerRadius;
      const y = Math.sin(angle) * innerRadius;
      s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }, [innerRadius, outerRadius, startAngle, endAngle]);

  const extrudeSettings = useMemo(() => ({
    depth: 0.3,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.03,
    bevelSegments: 3,
  }), []);

  useFrame(() => {
    if (mesh.current) mesh.current.rotation.x = -0.5;
  });

  const midAngle = (startAngle + endAngle) / 2;
  const labelRadius = (innerRadius + outerRadius) / 2;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;

  return (
    <group ref={mesh}>
      <mesh>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>
      {(endAngle - startAngle) > 0.3 && (
        <Text
          position={[Math.cos(midAngle) * labelRadius, Math.sin(midAngle) * labelRadius, 0.5]}
          fontSize={0.15}
          color="white"
          anchorX="center"
          anchorY="middle"
          rotation={[-0.5, 0, 0]}
        >
          {label} {pct}%
        </Text>
      )}
    </group>
  );
}

function DonutChart({ holdings }) {
  const totalValue = useMemo(
    () => holdings.reduce((s, h) => s + (h.currentValue || 0), 0),
    [holdings],
  );

  const segments = useMemo(() => {
    let angle = 0;
    return holdings.map((h, i) => {
      const pct = totalValue > 0 ? (h.currentValue || 0) / totalValue : 0;
      const start = angle;
      angle += pct * Math.PI * 2;
      return { startAngle: start, endAngle: angle, color: COLORS[i % COLORS.length], label: h.symbol, value: h.currentValue || 0 };
    });
  }, [holdings, totalValue]);

  return (
    <group>
      {segments.map((seg, i) => (
        <DonutSegment key={i} innerRadius={0.8} outerRadius={1.4} {...seg} total={totalValue} />
      ))}
      <Html position={[0, 0, 0.5]} center style={{ pointerEvents: 'none' }}>
        <div className="text-center" style={{ transform: 'rotateX(30deg)' }}>
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-sm font-bold text-white">{formatCurrency(totalValue)}</p>
        </div>
      </Html>
    </group>
  );
}

export default function AllocationChart({ holdings }) {
  if (!holdings || holdings.length === 0) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white">Asset Allocation</h2>
        <div className="flex h-72 items-center justify-center">
          <p className="text-sm text-slate-500">No holdings to display.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="mb-2 text-lg font-semibold text-white">Asset Allocation</h2>
      <div className="h-72">
        <Canvas
          camera={{ position: [0, 0, 3.5], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />
          <pointLight position={[-5, -5, 5]} intensity={0.3} color="#22d3ee" />
          <DonutChart holdings={holdings} />
          <OrbitControls enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 4} maxPolarAngle={Math.PI / 1.5} autoRotate autoRotateSpeed={0.5} />
        </Canvas>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {holdings.map((h, i) => (
          <div key={h.symbol} className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {h.symbol}
          </div>
        ))}
      </div>
    </div>
  );
}
