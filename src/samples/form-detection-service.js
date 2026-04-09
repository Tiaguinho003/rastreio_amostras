import sharp from 'sharp';

const WORK_WIDTH = 800;
const BLUR_SIGMA = 15;
const BRIGHTNESS_THRESHOLD = 180;
const COL_WHITE_MIN_RATIO = 0.15;
const ROW_WHITE_MIN_RATIO = 0.15;
const MIN_RUN_LENGTH = 30;
const PADDING_RATIO = 0.05;
const MIN_AREA_RATIO = 0.03;
const MAX_AREA_RATIO = 0.65;
const MIN_ASPECT = 0.7;
const MAX_ASPECT = 1.5;
const DETECTION_TIMEOUT_MS = 5000;

export class FormDetectionService {
  /**
   * Detects the white classification form card in the photo and crops it.
   * Uses blur + threshold to create solid bright blobs, then finds the
   * largest rectangular region with aspect ratio close to the card (~1:1).
   *
   * @param {Buffer} imageBuffer - Original photo buffer (JPEG/PNG)
   * @returns {Promise<{ detected: boolean, croppedBuffer: Buffer | null }>}
   */
  async detectAndCrop(imageBuffer) {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Form detection timed out')), DETECTION_TIMEOUT_MS);
    });

    try {
      return await Promise.race([
        this._detect(imageBuffer),
        timeoutPromise
      ]);
    } catch {
      return { detected: false, croppedBuffer: null };
    }
  }

  async _detect(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    const origWidth = metadata.width;
    const origHeight = metadata.height;

    if (!origWidth || !origHeight) {
      return { detected: false, croppedBuffer: null };
    }

    const scale = WORK_WIDTH / origWidth;
    const workHeight = Math.round(origHeight * scale);

    // Heavy blur merges the card's white cells into a solid bright blob,
    // filling gaps from cell borders and printed text
    const { data: pixels } = await sharp(imageBuffer)
      .resize(WORK_WIDTH, workHeight, { fit: 'fill' })
      .grayscale()
      .blur(BLUR_SIGMA)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const binary = new Uint8Array(WORK_WIDTH * workHeight);
    for (let i = 0; i < pixels.length; i++) {
      binary[i] = pixels[i] >= BRIGHTNESS_THRESHOLD ? 1 : 0;
    }

    // Column profile: ratio of white pixels per column
    const colProfile = new Float32Array(WORK_WIDTH);
    for (let x = 0; x < WORK_WIDTH; x++) {
      let whiteCount = 0;
      for (let y = 0; y < workHeight; y++) {
        whiteCount += binary[y * WORK_WIDTH + x];
      }
      colProfile[x] = whiteCount / workHeight;
    }

    // Find contiguous column runs above threshold
    const colRuns = findContiguousRuns(colProfile, COL_WHITE_MIN_RATIO);

    // For each column run, find the best matching row run
    let best = null;

    for (const colRun of colRuns) {
      if (colRun.len < MIN_RUN_LENGTH) continue;

      const regionWidth = colRun.len;
      const rowProfile = new Float32Array(workHeight);

      for (let y = 0; y < workHeight; y++) {
        let whiteCount = 0;
        for (let x = colRun.start; x <= colRun.end; x++) {
          whiteCount += binary[y * WORK_WIDTH + x];
        }
        rowProfile[y] = whiteCount / regionWidth;
      }

      const rowRuns = findContiguousRuns(rowProfile, ROW_WHITE_MIN_RATIO);

      for (const rowRun of rowRuns) {
        if (rowRun.len < MIN_RUN_LENGTH) continue;

        const aspect = colRun.len / rowRun.len;
        const area = (colRun.len * rowRun.len) / (WORK_WIDTH * workHeight);

        if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;
        if (area < MIN_AREA_RATIO || area > MAX_AREA_RATIO) continue;

        // Prefer the largest valid region
        if (!best || area > best.area) {
          best = { colRun, rowRun, aspect, area };
        }
      }
    }

    if (!best) {
      return { detected: false, croppedBuffer: null };
    }

    // Scale back to original coordinates with padding
    const { colRun, rowRun } = best;
    const padX = Math.round(colRun.len * PADDING_RATIO / scale);
    const padY = Math.round(rowRun.len * PADDING_RATIO / scale);

    const cropLeft = Math.max(0, Math.round(colRun.start / scale) - padX);
    const cropTop = Math.max(0, Math.round(rowRun.start / scale) - padY);
    const cropRight = Math.min(origWidth, Math.round((colRun.end + 1) / scale) + padX);
    const cropBottom = Math.min(origHeight, Math.round((rowRun.end + 1) / scale) + padY);
    const cropWidth = cropRight - cropLeft;
    const cropHeight = cropBottom - cropTop;

    if (cropWidth <= 0 || cropHeight <= 0) {
      return { detected: false, croppedBuffer: null };
    }

    const croppedBuffer = await sharp(imageBuffer)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .jpeg({ quality: 95 })
      .toBuffer();

    return { detected: true, croppedBuffer };
  }
}

/**
 * Finds contiguous runs of indices where profile[i] >= minRatio.
 */
function findContiguousRuns(profile, minRatio) {
  const runs = [];
  let start = -1;

  for (let i = 0; i < profile.length; i++) {
    if (profile[i] >= minRatio) {
      if (start === -1) start = i;
    } else {
      if (start !== -1) {
        runs.push({ start, end: i - 1, len: i - start });
        start = -1;
      }
    }
  }

  if (start !== -1) {
    runs.push({ start, end: profile.length - 1, len: profile.length - start });
  }

  return runs;
}
