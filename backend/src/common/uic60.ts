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

  const leftWebTop = { x: -halfWeb + 2, y: topY - headHeight + 5 };
  const leftWebBottom = { x: -halfWeb + 5, y: bottomY + footHeight - 5 };

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

  for (let angle = 270; angle <= 360; angle += 3) {
    const rad = (angle * Math.PI) / 180;
    points.push({
      x: halfFoot - footCurveRadius + footCurveRadius * Math.cos(rad),
      y: bottomY + footCurveRadius + footCurveRadius * Math.sin(rad),
    });
  }

  points.push({ x: halfFoot - footCurveRadius, y: footInnerY });

  points.push({ x: halfWeb - 5, y: bottomY + footHeight - 5 });
  points.push({ x: halfWeb - 2, y: topY - headHeight + 5 });

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

export const UIC60_SPEC = {
  totalHeight: 172,
  headWidth: 73,
  headHeight: 30,
  webThickness: 16.5,
  webHeight: 90,
  footWidth: 150,
  footHeight: 20,
};
