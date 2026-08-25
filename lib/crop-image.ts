// Turns a source image plus a crop rectangle into a square file ready to
// upload.
//
// The cropping UI (react-easy-crop) only reports WHERE to cut; producing
// the actual bytes is done here so the output size and format are decided
// by us rather than by the library.

/** Crop rectangle in natural source-image pixels, as react-easy-crop reports it. */
export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Longest edge of the exported logo. 512 is comfortably past what the
 * chat header (40px) and dashboard preview (64px) need even on a 3x
 * display, while keeping the file small enough that the public chat page
 * isn't waiting on it.
 */
export const LOGO_EXPORT_SIZE = 512;

/** Quality for the JPEG path. High enough to avoid visible artefacts on flat logo colour. */
const JPEG_QUALITY = 0.92;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The source is always a local object URL here, but this keeps the
    // canvas from being tainted if that ever changes.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image couldn't be loaded. Please try another file."));
    image.src = src;
  });
}

/**
 * Whether to keep transparency.
 *
 * Logos are very often PNG (or WebP) with a transparent background, and
 * exporting those as JPEG fills the transparency with solid black — which
 * looks obviously broken against the chat header. So alpha-capable
 * formats round-trip as PNG, and everything else becomes JPEG, which is
 * far smaller for photographic content.
 */
function outputFormat(sourceType: string): { mime: string; extension: string } {
  const keepsAlpha = sourceType === "image/png" || sourceType === "image/webp";
  return keepsAlpha
    ? { mime: "image/png", extension: "png" }
    : { mime: "image/jpeg", extension: "jpg" };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to process the image. Please try again."));
      },
      mime,
      mime === "image/jpeg" ? JPEG_QUALITY : undefined
    );
  });
}

/**
 * Draws the selected region onto a square canvas and returns it as a File.
 *
 * The output is SQUARE, not a circle: the circular overlay in the cropper
 * matches how the logo is displayed, but storing a square keeps the file
 * useful if it's ever rendered in a different shape. The rounding is done
 * with CSS at display time.
 */
export async function cropImageToFile(
  imageSrc: string,
  crop: CropArea,
  sourceFileName: string,
  sourceType: string
): Promise<File> {
  const image = await loadImage(imageSrc);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to process the image. Please try again.");

  // Never upscale: cropping a small region of a small image shouldn't
  // produce a blurry 512px file padded with interpolation.
  const size = Math.min(LOGO_EXPORT_SIZE, Math.round(Math.max(crop.width, crop.height)));
  canvas.width = size;
  canvas.height = size;

  const { mime, extension } = outputFormat(sourceType);

  // JPEG has no alpha, so anything transparent would render as black.
  // Filling white first gives a clean background instead.
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
  }

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size,
    size
  );

  const blob = await canvasToBlob(canvas, mime);

  const baseName = sourceFileName.replace(/\.[^.]+$/, "") || "logo";
  return new File([blob], `${baseName}.${extension}`, { type: mime });
}
