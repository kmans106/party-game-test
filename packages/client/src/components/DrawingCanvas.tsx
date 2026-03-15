import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { CanvasStroke } from "@party-game/shared";

type Point = {
  x: number;
  y: number;
};

type DrawingCanvasProps = {
  canDraw: boolean;
  color: string;
  onStroke: (stroke: CanvasStroke) => void;
  strokeWidth: number;
  strokes: CanvasStroke[];
};

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 480;
const MAX_SEGMENT_DISTANCE = 0.01;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const getNormalizedPoint = (event: PointerEvent<HTMLCanvasElement>): Point | null => {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  return {
    x: clamp01((event.clientX - bounds.left) / bounds.width),
    y: clamp01((event.clientY - bounds.top) / bounds.height)
  };
};

const drawStrokeSegment = (
  context: CanvasRenderingContext2D,
  stroke: CanvasStroke
) => {
  const fromX = stroke.fromX * CANVAS_WIDTH;
  const fromY = stroke.fromY * CANVAS_HEIGHT;
  const toX = stroke.toX * CANVAS_WIDTH;
  const toY = stroke.toY * CANVAS_HEIGHT;

  if (stroke.fromX === stroke.toX && stroke.fromY === stroke.toY) {
    context.beginPath();
    context.fillStyle = stroke.color;
    context.arc(fromX, fromY, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  context.stroke();
};

const interpolateStrokeSegments = (
  fromPoint: Point,
  toPoint: Point,
  color: string,
  width: number
) => {
  const deltaX = toPoint.x - fromPoint.x;
  const deltaY = toPoint.y - fromPoint.y;
  const distance = Math.hypot(deltaX, deltaY);
  const segmentCount = Math.max(1, Math.ceil(distance / MAX_SEGMENT_DISTANCE));
  const segments: CanvasStroke[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const startRatio = segmentIndex / segmentCount;
    const endRatio = (segmentIndex + 1) / segmentCount;

    segments.push({
      fromX: fromPoint.x + deltaX * startRatio,
      fromY: fromPoint.y + deltaY * startRatio,
      toX: fromPoint.x + deltaX * endRatio,
      toY: fromPoint.y + deltaY * endRatio,
      color,
      width
    });
  }

  return segments;
};

export const DrawingCanvas = ({ canDraw, color, onStroke, strokeWidth, strokes }: DrawingCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const stroke of strokes) {
      drawStrokeSegment(context, stroke);
    }
  }, [strokes]);

  return (
    <canvas
      onPointerDown={(event) => {
        if (!canDraw) {
          return;
        }

        const point = getNormalizedPoint(event);
        if (!point) {
          return;
        }

        const stroke = {
          fromX: point.x,
          fromY: point.y,
          toX: point.x,
          toY: point.y,
          color,
          width: strokeWidth
        };
        const context = canvasRef.current?.getContext("2d");
        if (context) {
          drawStrokeSegment(context, stroke);
        }
        onStroke(stroke);
        event.currentTarget.setPointerCapture(event.pointerId);
        setLastPoint(point);
      }}
      onPointerLeave={() => {
        setLastPoint(null);
      }}
      onPointerMove={(event) => {
        if (!canDraw || !lastPoint) {
          return;
        }

        const point = getNormalizedPoint(event);
        if (!point) {
          return;
        }

        const context = canvasRef.current?.getContext("2d");
        const segments = interpolateStrokeSegments(lastPoint, point, color, strokeWidth);
        for (const segment of segments) {
          if (context) {
            drawStrokeSegment(context, segment);
          }

          onStroke(segment);
        }
        setLastPoint(point);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setLastPoint(null);
      }}
      ref={canvasRef}
      style={{
        aspectRatio: "3 / 2",
        background: "#fff",
        border: "1px solid var(--color-border)",
        borderRadius: "6px",
        touchAction: "none",
        width: "100%"
      }}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
    />
  );
};
