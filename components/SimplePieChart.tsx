import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

export type PieDatum = {
  label: string;
  value: number;
  color: string;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} L ${cx} ${cy} Z`;
}

function isFullCircle(startAngle: number, endAngle: number) {
  return endAngle - startAngle >= 359.999;
}

export default function SimplePieChart({
  data,
  size = 220,
  innerRadius = 72,
}: {
  data: PieDatum[];
  size?: number;
  innerRadius?: number;
}) {
  const r = size / 2;

  const slices = useMemo(() => {
    const total = data.reduce((s, x) => s + (Number.isFinite(x.value) ? x.value : 0), 0);
    if (total <= 0) return [];

    let angle = 0;
    const out = data
      .filter((d) => d.value > 0)
      .map((d) => {
        const pct = d.value / total;
        const sweep = pct * 360;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        return { ...d, start, end };
      });

    return out;
  }, [data]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G>
          {slices.map((s) =>
            isFullCircle(s.start, s.end) ? (
              // 100% 单分类时，SVG arc 会退化成空路径；这里直接画整圆兜底。
              <Circle key={s.label} cx={r} cy={r} r={r} fill={s.color} />
            ) : (
              <Path key={s.label} d={describeArc(r, r, r, s.start, s.end)} fill={s.color} />
            )
          )}
          {/* 中空做成甜甜圈效果 */}
          <Circle cx={r} cy={r} r={innerRadius} fill="#fff" />
        </G>
      </Svg>
    </View>
  );
}
