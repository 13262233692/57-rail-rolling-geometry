export class Matrix2D {
  a: number = 1;
  b: number = 0;
  c: number = 0;
  d: number = 1;
  tx: number = 0;
  ty: number = 0;

  constructor();
  constructor(a: number, b: number, c: number, d: number, tx: number, ty: number);
  constructor(a?: number, b?: number, c?: number, d?: number, tx?: number, ty?: number) {
    if (a !== undefined) {
      this.a = a;
      this.b = b || 0;
      this.c = c || 0;
      this.d = d || 1;
      this.tx = tx || 0;
      this.ty = ty || 0;
    }
  }

  static identity(): Matrix2D {
    return new Matrix2D(1, 0, 0, 1, 0, 0);
  }

  static scale(sx: number, sy: number = sx): Matrix2D {
    return new Matrix2D(sx, 0, 0, sy, 0, 0);
  }

  static translate(tx: number, ty: number): Matrix2D {
    return new Matrix2D(1, 0, 0, 1, tx, ty);
  }

  static rotate(angle: number): Matrix2D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Matrix2D(cos, sin, -sin, cos, 0, 0);
  }

  multiply(other: Matrix2D): Matrix2D {
    return new Matrix2D(
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.tx + this.c * other.ty + this.tx,
      this.b * other.tx + this.d * other.ty + this.ty,
    );
  }

  translate(tx: number, ty: number): Matrix2D {
    return this.multiply(Matrix2D.translate(tx, ty));
  }

  scale(sx: number, sy: number = sx): Matrix2D {
    return this.multiply(Matrix2D.scale(sx, sy));
  }

  rotate(angle: number): Matrix2D {
    return this.multiply(Matrix2D.rotate(angle));
  }

  invert(): Matrix2D {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < 1e-10) {
      return Matrix2D.identity();
    }
    const invDet = 1 / det;
    return new Matrix2D(
      this.d * invDet,
      -this.b * invDet,
      -this.c * invDet,
      this.a * invDet,
      (this.c * this.ty - this.d * this.tx) * invDet,
      (this.b * this.tx - this.a * this.ty) * invDet,
    );
  }

  transformPoint(x: number, y: number): { x: number; y: number } {
    return {
      x: this.a * x + this.c * y + this.tx,
      y: this.b * x + this.d * y + this.ty,
    };
  }

  transformPoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
    const result = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      result[i] = this.transformPoint(points[i].x, points[i].y);
    }
    return result;
  }

  clone(): Matrix2D {
    return new Matrix2D(this.a, this.b, this.c, this.d, this.tx, this.ty);
  }

  toArray(): number[] {
    return [this.a, this.b, this.c, this.d, this.tx, this.ty];
  }
}

export class ViewTransform {
  private worldToScreen: Matrix2D = Matrix2D.identity();
  private screenToWorld: Matrix2D = Matrix2D.identity();
  private _scale: number = 1;
  private _offsetX: number = 0;
  private _offsetY: number = 0;
  private _viewportWidth: number = 800;
  private _viewportHeight: number = 600;
  private _flipY: boolean = true;

  get scale(): number {
    return this._scale;
  }

  get offsetX(): number {
    return this._offsetX;
  }

  get offsetY(): number {
    return this._offsetY;
  }

  setViewport(width: number, height: number) {
    this._viewportWidth = width;
    this._viewportHeight = height;
    this.updateMatrices();
  }

  setScale(scale: number) {
    this._scale = Math.max(0.1, Math.min(100, scale));
    this.updateMatrices();
  }

  setOffset(x: number, y: number) {
    this._offsetX = x;
    this._offsetY = y;
    this.updateMatrices();
  }

  zoom(factor: number, centerX: number, centerY: number) {
    const worldCenter = this.screenToWorldPoint(centerX, centerY);
    this._scale = Math.max(0.1, Math.min(100, this._scale * factor));
    this.updateMatrices();
    const newScreenCenter = this.worldToScreenPoint(worldCenter.x, worldCenter.y);
    this._offsetX += centerX - newScreenCenter.x;
    this._offsetY += centerY - newScreenCenter.y;
    this.updateMatrices();
  }

  pan(dx: number, dy: number) {
    this._offsetX += dx;
    this._offsetY += dy;
    this.updateMatrices();
  }

  fitToBounds(minX: number, maxX: number, minY: number, maxY: number, padding: number = 50) {
    const width = maxX - minX;
    const height = maxY - minY;

    if (width <= 0 || height <= 0) return;

    const scaleX = (this._viewportWidth - padding * 2) / width;
    const scaleY = (this._viewportHeight - padding * 2) / height;
    this._scale = Math.min(scaleX, scaleY);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const screenCenterX = this._viewportWidth / 2;
    const screenCenterY = this._viewportHeight / 2;

    this._offsetX = screenCenterX - centerX * this._scale;
    this._offsetY = screenCenterY + centerY * this._scale;

    this.updateMatrices();
  }

  private updateMatrices() {
    const sy = this._flipY ? -this._scale : this._scale;

    this.worldToScreen = Matrix2D.identity()
      .scale(this._scale, sy)
      .translate(this._offsetX, this._offsetY);

    this.screenToWorld = this.worldToScreen.invert();
  }

  worldToScreenPoint(x: number, y: number): { x: number; y: number } {
    return this.worldToScreen.transformPoint(x, y);
  }

  screenToWorldPoint(x: number, y: number): { x: number; y: number } {
    return this.screenToWorld.transformPoint(x, y);
  }

  applyToContext(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.worldToScreen.a, this.worldToScreen.b,
      this.worldToScreen.c, this.worldToScreen.d,
      this.worldToScreen.tx, this.worldToScreen.ty);
  }

  getMatrix(): Matrix2D {
    return this.worldToScreen.clone();
  }
}
