import { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';

export interface OverlayOptions {
  enabled: boolean;
  boxes: boolean;
  face: boolean;
  mesh: boolean;
  pose: boolean;
  hands: boolean;
}

export type Point = { x: number; y: number; z: number; visibility?: number };

export interface TrackingFrame {
  face: Point[];
  pose: Point[];
  hands: Point[][];
}

type Connection = { start: number; end: number };
type Context = CanvasRenderingContext2D;
const CYAN = '#22d3ee';
const LIME = '#a3e635';
const AMBER = '#fbbf24';
const ARM_CONNECTIONS: Connection[] = [
  { start: 11, end: 12 },
  { start: 11, end: 13 },
  { start: 13, end: 15 },
  { start: 12, end: 14 },
  { start: 14, end: 16 },
];

function valid(point: Point | undefined): point is Point {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function visible(point: Point | undefined): point is Point {
  return valid(point) && (point.visibility ?? 0) >= 0.5;
}

function connections(
  ctx: Context,
  points: readonly Point[],
  edges: readonly Connection[],
  color: string,
  width: number,
  requireVisibility = false,
): void {
  const usable = requireVisibility ? visible : valid;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const { start, end } of edges) {
    const a = points[start];
    const b = points[end];
    if (!usable(a) || !usable(b)) continue;
    ctx.moveTo(a.x * ctx.canvas.width, a.y * ctx.canvas.height);
    ctx.lineTo(b.x * ctx.canvas.width, b.y * ctx.canvas.height);
  }
  ctx.stroke();
  ctx.restore();
}

function box(ctx: Context, points: readonly Point[], color: string, label: string): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const point of points) {
    if (!valid(point)) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    count++;
  }
  if (count < 2 || maxX <= minX || maxY <= minY) return;
  const { width, height } = ctx.canvas;
  const padding = 6;
  const x = Math.max(0, minX * width - padding);
  const y = Math.max(0, minY * height - padding);
  const right = Math.min(width, maxX * width + padding);
  const bottom = Math.min(height, maxY * height + padding);
  if (right <= x || bottom <= y) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, right - x, bottom - y);
  // The entire overlay is mirrored in CSS. Counter-mirror only the label,
  // anchoring it to the box's right edge (the displayed left edge).
  ctx.translate(right, y >= 20 ? y - 5 : y + 15);
  ctx.scale(-1, 1);
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillStyle = color;
  ctx.strokeText(label, 0, 0);
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

export function drawFaceBox(ctx: Context, points: readonly Point[]): void {
  box(ctx, points, CYAN, 'FACE');
}

/** MediaPipe contours include the eyes, eyebrows, lips, and face oval. */
export function drawFaceContours(ctx: Context, points: readonly Point[]): void {
  connections(ctx, points, FaceLandmarker.FACE_LANDMARKS_CONTOURS, CYAN, 1.5);
}

export function drawFaceMesh(ctx: Context, points: readonly Point[]): void {
  connections(ctx, points, FaceLandmarker.FACE_LANDMARKS_TESSELATION, 'rgba(34, 211, 238, 0.16)', 0.6);
}

export function drawArmSkeleton(ctx: Context, points: readonly Point[]): void {
  connections(ctx, points, ARM_CONNECTIONS, LIME, 3, true);
  ctx.save();
  ctx.fillStyle = LIME;
  for (const index of [11, 12, 13, 14, 15, 16]) {
    const point = points[index];
    if (!visible(point)) continue;
    ctx.beginPath();
    ctx.arc(point.x * ctx.canvas.width, point.y * ctx.canvas.height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawHandBoxes(ctx: Context, hands: readonly (readonly Point[])[]): void {
  for (const points of hands) {
    if (points) box(ctx, points, AMBER, 'HAND');
  }
}

export function drawHandLandmarks(ctx: Context, hands: readonly (readonly Point[])[]): void {
  for (const points of hands) {
    if (!points) continue;
    connections(ctx, points, HandLandmarker.HAND_CONNECTIONS, AMBER, 2);
    ctx.save();
    ctx.fillStyle = AMBER;
    for (const point of points) {
      if (!valid(point)) continue;
      ctx.beginPath();
      ctx.arc(point.x * ctx.canvas.width, point.y * ctx.canvas.height, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function drawOverlay(
  canvas: HTMLCanvasElement,
  frame: TrackingFrame,
  options: OverlayOptions,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!options.enabled || !canvas.width || !canvas.height) return;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const face = frame.face ?? [];
    const pose = frame.pose ?? [];
    const hands = frame.hands ?? [];
    if (options.mesh) drawFaceMesh(ctx, face);
    if (options.face) drawFaceContours(ctx, face);
    if (options.pose) drawArmSkeleton(ctx, pose);
    if (options.hands) drawHandLandmarks(ctx, hands);
    if (options.boxes) {
      drawFaceBox(ctx, face);
      drawHandBoxes(ctx, hands);
    }
  } finally {
    ctx.restore();
  }
}
