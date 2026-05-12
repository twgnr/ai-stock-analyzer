interface Props {
  data: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 100, height = 30 }: Props) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className="opacity-30" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastY = height - ((data[data.length - 1] - min) / range) * height;
  const firstY = height - ((data[0] - min) / range) * height;
  const isUp = data[data.length - 1] >= data[0];
  const color = isUp ? "#22c55e" : "#ef4444";
  const fillColor = isUp ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)";

  const areaPath = `M 0,${firstY.toFixed(1)} L ${points.replaceAll(",", " ").split(" ").reduce((acc, val, i) => {
    if (i % 2 === 0) return acc + (acc ? " L " : "") + val;
    return acc + " " + val;
  }, "")} L ${width},${lastY.toFixed(1)} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={fillColor}
      />
    </svg>
  );
}
