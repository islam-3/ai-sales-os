"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cropImageToFile, type CropArea } from "@/lib/crop-image";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

// Cropping step shown between picking a logo file and uploading it.
//
// The overlay is circular because that's exactly how the logo renders in
// the chat header — an owner should be framing the shape they'll actually
// get, not a square they have to imagine cropped. The exported file is
// still square (see cropImageToFile); only the guide is round.
export function LogoCropDialog({
  open,
  imageSrc,
  fileName,
  fileType,
  onCancel,
  onCropped,
}: {
  open: boolean;
  /** Object URL of the file the owner picked. */
  imageSrc: string | null;
  fileName: string;
  fileType: string;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<CropArea | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // react-easy-crop reports both a percentage area and a pixel area; the
  // pixel one is what maps onto the source image for canvas drawing.
  const handleCropComplete = useCallback((_percent: Area, pixels: Area) => {
    setCroppedArea(pixels);
  }, []);

  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setError(null);
  }

  async function handleConfirm() {
    if (!imageSrc || !croppedArea) return;
    setError(null);
    setIsProcessing(true);
    try {
      const file = await cropImageToFile(imageSrc, croppedArea, fileName, fileType);
      reset();
      onCropped(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process the image.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing by Escape or the overlay counts as cancelling, so the
        // picked file is discarded rather than silently kept.
        if (!next) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Position your logo</DialogTitle>
          <DialogDescription>
            Drag to reposition and zoom to frame it. This is exactly how it will appear to
            your customers.
          </DialogDescription>
        </DialogHeader>

        {/* Fixed-height stage on a dark backdrop so a light logo stays
            visible against it while being positioned. */}
        <div className="relative h-64 w-full overflow-hidden rounded-xl bg-neutral-900 sm:h-72">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
              // Restricting position keeps the image covering the circle,
              // so a crop can never include empty space at an edge.
              restrictPosition
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP * 2).toFixed(2)))}
            disabled={zoom <= MIN_ZOOM}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={ZOOM_STEP}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP * 2).toFixed(2)))}
            disabled={zoom >= MAX_ZOOM}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          On a touch screen you can pinch to zoom.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={isProcessing || !croppedArea}
          >
            {isProcessing ? "Processing…" : "Use this logo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
