// src/components/Digit.tsx
import React from "react";
import { Typography, Paper } from "@mui/material";
import { ImageDataLoader } from "./minst";

const sizeScale = 2;

export interface Props {
  pixels: Float32Array;
  label: number;
  prediction: number;
}

export function Digit(props: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const { pixels, label, prediction } = props;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const size = ImageDataLoader.IMAGE_SIZE;
        canvas.width = size * sizeScale;
        canvas.height = size * sizeScale;

        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < pixels.length; i += ImageDataLoader.CHANNELS) {
          // Assuming pixels are in [0, 1], convert to [0, 255]
          const r = pixels[i] * 255;
          const g = pixels[i + 1] * 255;
          const b = pixels[i + 2] * 255;

          ctx.fillStyle = `rgb(${r},${g},${b})`;
          const pixelIndex = i / ImageDataLoader.CHANNELS;
          const row = Math.floor(pixelIndex / size);
          const col = pixelIndex % size;
          ctx.fillRect(col * sizeScale, row * sizeScale, sizeScale, sizeScale);
        }
      }
    }
  }, [pixels]);

  return (
    <>
      <canvas ref={canvasRef}></canvas>
      <div>
        {prediction !== undefined ? (
          prediction === label ? (
            <Typography variant="body2" color="primary">
              ✅ {prediction}
            </Typography>
          ) : (
            <Typography variant="body2" color="error">
              ❌ {prediction} (Expected {label})
            </Typography>
          )
        ) : (
          <Typography variant="body2">Expecting {label}</Typography>
        )}
      </div>
    </>
  );
}
