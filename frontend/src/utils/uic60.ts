export interface RailPoint {
  x: number;
  y: number;
}

export function generateUIC60Profile(): RailPoint[] {
  const points: RailPoint[] = [];

  const totalHeight = 172;
  const headWidth = 73;
  const headHeight = 30;
  const webThickness = 16.5;
  const webHeight = 90;
  const footWidth = 150;
  const footHeight = 20;

  const halfHead = headWidth / 2;
  const halfWeb = webThickness / 2;
  const halfFoot = footWidth / 2;
  const topY = totalHeight / 2;
  const bottomY = -totalHeight / 2;

  const headRadius = headWidth / 2 + 2;
  const headCenterY = topY - headHeight / 2 + 2;

  for (let angle = -70; angle <= 70; angle += 0.8) {
    const rad = (angle * Math.PI) / 180;
    points.push({
      x: headRadius * Math.sin(rad),
      y: headCenterY + headRadius * Math.cos(rad) - headRadius,
    });
  }

  const headBottomY = topY - headHeight;
  const headBottomLeft = points[points.length - 1];
  const webTopY = headBottomY;
  const webBottomY = bottomY + footHeight;

  const leftWebTop = { x: -halfWeb + 2, y: webTopY + 5 };
  const leftWebBottom = { x: -halfWeb + 5, y: webBottomY - 5 };

  points.push(leftWebTop);
  points.push(leftWebBottom);

  const footCurveRadius = 15;
  const footInnerY = bottomY + footHeight - footCurveRadius;

  points.push({ x: -halfFoot + footCurveRadius, y: footInnerY });

  for (let angle = 180; angle <= 270; angle += 3) {
    const rad = (angle * Math.PI) / 180;
    points.push({
      x: -halfFoot + footCurveRadius + footCurveRadius * Math.cos(rad),
      y: bottomY + footCurveRadius + footCurveRadius * Math.sin(rad),
    });
  }

  points.push({ x: 0, y: bottomY });

  const rightFootStart = points.length;

  for (let angle = 270; angle <= 360; angle += 3) {
    const rad = (angle * Math.PI) / 180;
    points.push({
      x: halfFoot - footCurveRadius + footCurveRadius * Math.cos(rad),
      y: bottomY + footCurveRadius + footCurveRadius * Math.sin(rad),
    });
  }

  points.push({ x: halfFoot - footCurveRadius, y: footInnerY });

  points.push({ x: halfWeb - 5, y: webBottomY - 5 });
  points.push({ x: halfWeb - 2, y: webTopY + 5 });

  return points;
}

export function generateUIC60Outline(): RailPoint[] {
  const points: RailPoint[] = [];
  const upper = generateUIC60Profile();

  for (const p of upper) {
    points.push(p);
  }

  for (let i = upper.length - 1; i >= 0; i--) {
    points.push({ x: -upper[i].x, y: upper[i].y });
  }

  return points;
}

export function intensityToColor(intensity: number, maxIntensity: number = 255): string {
  const normalized = Math.max(0, Math.min(1, intensity / maxIntensity));

  const h = (1 - normalized) * 240;
  const s = 1;
  const l = 0.3 + normalized * 0.5;

  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  h = h / 360;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function heatMapColor(value: number): string {
  value = Math.max(0, Math.min(1, value));

  if (value < 0.25) {
    const t = value / 0.25;
    return `rgb(${Math.round(0 + t * 0)}, ${Math.round(0 + t * 128)}, ${Math.round(128 + t * 127)})`;
  } else if (value < 0.5) {
    const t = (value - 0.25) / 0.25;
    return `rgb(${Math.round(0 + t * 0)}, ${Math.round(128 + t * 127)}, ${Math.round(255 - t * 128)})`;
  } else if (value < 0.75) {
    const t = (value - 0.5) / 0.25;
    return `rgb(${Math.round(0 + t * 255)}, ${Math.round(255 - t * 128)}, ${Math.round(127 - t * 127)})`;
  } else {
    const t = (value - 0.75) / 0.25;
    return `rgb(${Math.round(255 - t * 55)}, ${Math.round(127 - t * 77)}, 0)`;
  }
}
