// Helper to solve 8x8 system using Gaussian elimination
const solveGaussian = (A, B) => {
  const n = 8;
  const M = [];
  for (let i = 0; i < n; i++) {
    M.push([...A[i], B[i]]);
  }

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    const pivot = M[i][i];
    if (Math.abs(pivot) < 1e-10) {
      return null;
    }
    for (let j = i; j <= n; j++) {
      M[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }
  }

  const h = new Float32Array(8);
  for (let i = 0; i < n; i++) {
    h[i] = M[i][n];
  }
  return h;
};

// Finds the top and bottom extremes of a timing track
const findTimingTrackExtremes = (ctx, startX, startY, searchW, searchH) => {
  const imgData = ctx.getImageData(startX, startY, searchW, searchH);
  const data = imgData.data;
  const w = imgData.width;
  const h = imgData.height;

  const gray = new Uint8Array(w * h);
  let sumGray = 0;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sumGray += gray[i];
  }
  const avgGray = sumGray / (w * h || 1);
  const thresh = Math.min(130, avgGray * 0.7);

  const visited = new Uint8Array(w * h);
  const components = [];

  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const idx = y * w + x;
      if (gray[idx] < thresh && !visited[idx]) {
        let sumX = 0, sumY = 0, count = 0;
        let minX = x, maxX = x, minY = y, maxY = y;

        const queue = [idx];
        visited[idx] = 1;

        let qHead = 0;
        while (qHead < queue.length) {
          const cur = queue[qHead++];
          const cx = cur % w;
          const cy = Math.floor(cur / w);

          sumX += cx;
          sumY += cy;
          count++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
          for (const n of neighbors) {
            const nx = n % w, ny = Math.floor(n / w);
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              if (gray[n] < thresh && !visited[n]) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const density = count / (bw * bh);
        
        // Relaxed constraints for timing mark rectangles
        if (bw >= 5 && bw <= 150 && bh >= 3 && bh <= 80 && density >= 0.3) {
          components.push({
            cx: startX + sumX / count,
            cy: startY + sumY / count,
            width: bw,
            height: bh,
            size: count
          });
        }
      }
    }
  }

  if (components.length < 2) return null;

  // Filter out stray marks by enforcing vertical alignment (all marks should have roughly the same X)
  components.sort((a, b) => a.cx - b.cx);
  const medianX = components[Math.floor(components.length / 2)].cx;
  const alignedComponents = components.filter(c => Math.abs(c.cx - medianX) < 25);

  if (alignedComponents.length < 2) return null;

  alignedComponents.sort((a, b) => a.cy - b.cy);
  return {
    top: alignedComponents[0],
    bottom: alignedComponents[alignedComponents.length - 1]
  };
};

// BFS Blob Finder in a Search region of the canvas
const findAnchorInRegion = (
  ctx,
  startX,
  startY,
  searchW,
  searchH,
  expectedCorner,
  expectedPt = null,
) => {
  const imgData = ctx.getImageData(startX, startY, searchW, searchH);
  const data = imgData.data;
  const w = imgData.width;
  const h = imgData.height;

  // Convert to grayscale
  const gray = new Uint8Array(w * h);
  let sumGray = 0;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    sumGray += gray[i];
  }
  const avgGray = sumGray / (w * h || 1);

  // Dynamic threshold: e.g. 70% of average gray, max 110
  const thresh = Math.min(110, avgGray * 0.7);

  const visited = new Uint8Array(w * h);
  const components = [];

  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const idx = y * w + x;
      if (gray[idx] < thresh && !visited[idx]) {
        let sumX = 0;
        let sumY = 0;
        let count = 0;
        let minX = x,
          maxX = x;
        let minY = y,
          maxY = y;

        const queue = [idx];
        visited[idx] = 1;

        let qHead = 0;
        while (qHead < queue.length) {
          const cur = queue[qHead++];
          const cx = cur % w;
          const cy = Math.floor(cur / w);

          sumX += cx;
          sumY += cy;
          count++;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // Check 4-neighbors
          const neighbors = [cur - 1, cur + 1, cur - w, cur + w];

          for (const n of neighbors) {
            const nx = n % w;
            const ny = Math.floor(n / w);
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              if (gray[n] < thresh && !visited[n]) {
                visited[n] = 1;
                queue.push(n);
              }
            }
          }
        }

        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const density = count / (bw * bh);
        const aspectRatio = bw / bh;

        // In a ~1000px wide image, search region is around 250-300px.
        // Anchors are typically around 8px to 80px wide/high.
        // Aspect ratio should be close to 1.
        if (
          bw >= 8 &&
          bw <= 80 &&
          bh >= 8 &&
          bh <= 80 &&
          aspectRatio >= 0.55 &&
          aspectRatio <= 1.8 &&
          density >= 0.45
        ) {
          components.push({
            cx: startX + sumX / count,
            cy: startY + sumY / count,
            width: bw,
            height: bh,
            size: count,
          });
        }
      }
    }
  }

  if (components.length === 0) return null;

  let best = null;
  let minDistance = Infinity;

  components.forEach((c) => {
    let targetX = 0;
    let targetY = 0;
    if (expectedPt) {
      targetX = expectedPt.x - startX;
      targetY = expectedPt.y - startY;
    } else {
      if (expectedCorner === "topRight") targetX = w;
      else if (expectedCorner === "bottomLeft") targetY = h;
      else if (expectedCorner === "bottomRight") {
        targetX = w;
        targetY = h;
      }
    }

    const localX = c.cx - startX;
    const localY = c.cy - startY;
    const dist = Math.sqrt((localX - targetX) ** 2 + (localY - targetY) ** 2);

    if (dist < minDistance) {
      minDistance = dist;
      best = c;
    }
  });

  return best;
};

/**
 * Automatically attempts to detect 4 corner anchor markers on an image canvas.
 * Anchors are expected to be high-contrast, black square/circular markers near the corners.
 */
export const detectAnchors = async (canvasElement, template = null) => {
  const originalWidth = canvasElement.width;
  const originalHeight = canvasElement.height;
  const maxDim = 1000;
  let scale = 1.0;
  let processingCanvas = canvasElement;

  if (Math.max(originalWidth, originalHeight) > maxDim) {
    scale = maxDim / Math.max(originalWidth, originalHeight);
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = Math.round(originalWidth * scale);
    tempCanvas.height = Math.round(originalHeight * scale);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.drawImage(canvasElement, 0, 0, tempCanvas.width, tempCanvas.height);
    processingCanvas = tempCanvas;
  }

  const ctx = processingCanvas.getContext("2d");
  const w = processingCanvas.width;
  const h = processingCanvas.height;

  // Resolve expected anchor coordinates scaled from template if provided
  let scaledExpected = null;
  if (template) {
    const tW = template.width || 800;
    const tH = template.height || 1100;
    let templateAnchors = template.anchors_json;
    if (typeof templateAnchors === "string")
      templateAnchors = JSON.parse(templateAnchors);

    if (templateAnchors) {
      if (templateAnchors.type === 'timing_marks' && templateAnchors.timingMarks) {
        const leftTrack = templateAnchors.timingMarks.left;
        const rightTrack = templateAnchors.timingMarks.right;

        const scaleX = w / tW;
        const scaleY = h / tH;

        // Add large padding (150px vertical) to the search area to handle significant paper shifts during scanning
        const vPadding = 150;
        const hPadding = 50;
        
        const lx = Math.max(0, Math.round(leftTrack.x * scaleX) - hPadding);
        const ly = Math.max(0, Math.round(leftTrack.y * scaleY) - vPadding);
        const lw = Math.min(w - lx, Math.round(leftTrack.width * scaleX) + hPadding * 2);
        const lh = Math.min(h - ly, Math.round(leftTrack.height * scaleY) + vPadding * 2);

        const rx = Math.max(0, Math.round(rightTrack.x * scaleX) - hPadding);
        const ry = Math.max(0, Math.round(rightTrack.y * scaleY) - vPadding);
        const rw = Math.min(w - rx, Math.round(rightTrack.width * scaleX) + hPadding * 2);
        const rh = Math.min(h - ry, Math.round(rightTrack.height * scaleY) + vPadding * 2);

        const leftExtremes = findTimingTrackExtremes(ctx, lx, ly, lw, lh);
        const rightExtremes = findTimingTrackExtremes(ctx, rx, ry, rw, rh);

        const getFallback = (cornerName) => {
            if (cornerName === "topLeft") return { x: originalWidth * 0.05, y: originalHeight * 0.05 };
            if (cornerName === "topRight") return { x: originalWidth * 0.95, y: originalHeight * 0.05 };
            if (cornerName === "bottomLeft") return { x: originalWidth * 0.05, y: originalHeight * 0.95 };
            return { x: originalWidth * 0.95, y: originalHeight * 0.95 };
        };

        return {
          topLeft: leftExtremes?.top ? { x: leftExtremes.top.cx / scale, y: leftExtremes.top.cy / scale } : getFallback("topLeft"),
          bottomLeft: leftExtremes?.bottom ? { x: leftExtremes.bottom.cx / scale, y: leftExtremes.bottom.cy / scale } : getFallback("bottomLeft"),
          topRight: rightExtremes?.top ? { x: rightExtremes.top.cx / scale, y: rightExtremes.top.cy / scale } : getFallback("topRight"),
          bottomRight: rightExtremes?.bottom ? { x: rightExtremes.bottom.cx / scale, y: rightExtremes.bottom.cy / scale } : getFallback("bottomRight"),
          autoDetected: !!(leftExtremes && rightExtremes)
        };
      }

      scaledExpected = {
        topLeft: {
          x: (templateAnchors.topLeft.x / tW) * w,
          y: (templateAnchors.topLeft.y / tH) * h,
        },
        topRight: {
          x: (templateAnchors.topRight.x / tW) * w,
          y: (templateAnchors.topRight.y / tH) * h,
        },
        bottomLeft: {
          x: (templateAnchors.bottomLeft.x / tW) * w,
          y: (templateAnchors.bottomLeft.y / tH) * h,
        },
        bottomRight: {
          x: (templateAnchors.bottomRight.x / tW) * w,
          y: (templateAnchors.bottomRight.y / tH) * h,
        },
      };
    }
  }

  // Quadrant bounds (e.g. search within 30% of edges)
  const searchW = Math.round(w * 0.3);
  const searchH = Math.round(h * 0.3);

  const tl = findAnchorInRegion(
    ctx,
    5,
    5,
    searchW,
    searchH,
    "topLeft",
    scaledExpected?.topLeft,
  );
  const tr = findAnchorInRegion(
    ctx,
    w - searchW - 5,
    5,
    searchW,
    searchH,
    "topRight",
    scaledExpected?.topRight,
  );
  const bl = findAnchorInRegion(
    ctx,
    5,
    h - searchH - 5,
    searchW,
    searchH,
    "bottomLeft",
    scaledExpected?.bottomLeft,
  );
  const br = findAnchorInRegion(
    ctx,
    w - searchW - 5,
    h - searchH - 5,
    searchW,
    searchH,
    "bottomRight",
    scaledExpected?.bottomRight,
  );

  const getFallback = (cornerName) => {
    if (template) {
      const tW = template.width || 800;
      const tH = template.height || 1100;
      let templateAnchors = template.anchors_json;
      if (typeof templateAnchors === "string")
        templateAnchors = JSON.parse(templateAnchors);
      if (templateAnchors && templateAnchors[cornerName]) {
        return {
          x: (templateAnchors[cornerName].x / tW) * originalWidth,
          y: (templateAnchors[cornerName].y / tH) * originalHeight,
        };
      }
    }
    // Default fallback coordinates if no template or expected point exists
    if (cornerName === "topLeft")
      return { x: originalWidth * 0.05, y: originalHeight * 0.05 };
    if (cornerName === "topRight")
      return { x: originalWidth * 0.95, y: originalHeight * 0.05 };
    if (cornerName === "bottomLeft")
      return { x: originalWidth * 0.05, y: originalHeight * 0.95 };
    return { x: originalWidth * 0.95, y: originalHeight * 0.95 };
  };

  const result = {
    topLeft: tl
      ? { x: tl.cx / scale, y: tl.cy / scale }
      : getFallback("topLeft"),
    topRight: tr
      ? { x: tr.cx / scale, y: tr.cy / scale }
      : getFallback("topRight"),
    bottomLeft: bl
      ? { x: bl.cx / scale, y: bl.cy / scale }
      : getFallback("bottomLeft"),
    bottomRight: br
      ? { x: br.cx / scale, y: br.cy / scale }
      : getFallback("bottomRight"),
    autoDetected: !!(tl && tr && bl && br),
  };

  return result;
};

/**
 * Warps the perspective of the source canvas so that it is aligned to the target dimensions
 * using the 4 anchor points. Outputs the result to the destination canvas.
 */
export const warpPerspective = async (
  sourceCanvas,
  destCanvas,
  sourceAnchors,
  targetDimensions,
) => {
  const srcCtx = sourceCanvas.getContext("2d");
  const dstCtx = destCanvas.getContext("2d");

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const dstW = targetDimensions.width;
  const dstH = targetDimensions.height;

  const dstPts = [
    {
      x: targetDimensions.anchors.topLeft.x,
      y: targetDimensions.anchors.topLeft.y,
    },
    {
      x: targetDimensions.anchors.topRight.x,
      y: targetDimensions.anchors.topRight.y,
    },
    {
      x: targetDimensions.anchors.bottomRight.x,
      y: targetDimensions.anchors.bottomRight.y,
    },
    {
      x: targetDimensions.anchors.bottomLeft.x,
      y: targetDimensions.anchors.bottomLeft.y,
    },
  ];

  const srcPts = [
    { x: sourceAnchors.topLeft.x, y: sourceAnchors.topLeft.y },
    { x: sourceAnchors.topRight.x, y: sourceAnchors.topRight.y },
    { x: sourceAnchors.bottomRight.x, y: sourceAnchors.bottomRight.y },
    { x: sourceAnchors.bottomLeft.x, y: sourceAnchors.bottomLeft.y },
  ];

  const A = [];
  const B = [];
  for (let i = 0; i < 4; i++) {
    const xd = dstPts[i].x;
    const yd = dstPts[i].y;
    const xs = srcPts[i].x;
    const ys = srcPts[i].y;

    A.push([xd, yd, 1, 0, 0, 0, -xd * xs, -yd * xs]);
    B.push(xs);
    A.push([0, 0, 0, xd, yd, 1, -xd * ys, -yd * ys]);
    B.push(ys);
  }

  const h = solveGaussian(A, B);
  if (!h) {
    throw new Error("Perspective projection matrix is singular.");
  }

  const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcData = srcImgData.data;

  const dstImgData = dstCtx.createImageData(dstW, dstH);
  const dstData = dstImgData.data;

  // Bilinear interpolation
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const den = h[6] * x + h[7] * y + 1;
      const sxFloat = (h[0] * x + h[1] * y + h[2]) / den;
      const syFloat = (h[3] * x + h[4] * y + h[5]) / den;

      const sx0 = Math.floor(sxFloat);
      const sx1 = Math.min(srcW - 1, sx0 + 1);
      const sy0 = Math.floor(syFloat);
      const sy1 = Math.min(srcH - 1, sy0 + 1);

      const dx = sxFloat - sx0;
      const dy = syFloat - sy0;

      const dstIdx = (y * dstW + x) * 4;

      if (sx0 >= 0 && sx0 < srcW && sy0 >= 0 && sy0 < srcH) {
        const idx00 = (sy0 * srcW + sx0) * 4;
        const idx10 = (sy0 * srcW + sx1) * 4;
        const idx01 = (sy1 * srcW + sx0) * 4;
        const idx11 = (sy1 * srcW + sx1) * 4;

        for (let c = 0; c < 4; c++) {
          const val =
            (1 - dx) * (1 - dy) * srcData[idx00 + c] +
            dx * (1 - dy) * srcData[idx10 + c] +
            (1 - dx) * dy * srcData[idx01 + c] +
            dx * dy * srcData[idx11 + c];
          dstData[dstIdx + c] = Math.round(val);
        }
      } else {
        dstData[dstIdx] = 255;
        dstData[dstIdx + 1] = 255;
        dstData[dstIdx + 2] = 255;
        dstData[dstIdx + 3] = 255;
      }
    }
  }

  dstCtx.putImageData(dstImgData, 0, 0);
};

/**
 * Analyzes pixel darkness within a specific bounding box (bubble) on a canvas.
 * Returns the fill percentage (0 to 1).
 */
export const analyzeBubbleFill = (
  imgDataOrCtx,
  x,
  y,
  radius,
  thresholdValue = 127,
) => {
  const size = Math.ceil(radius * 2);
  const startX = Math.round(x - radius);
  const startY = Math.round(y - radius);

  let data;
  let imgWidth;
  let imgHeight;

  const isImageData =
    imgDataOrCtx && imgDataOrCtx.data && typeof imgDataOrCtx.width === "number";

  if (isImageData) {
    data = imgDataOrCtx.data;
    imgWidth = imgDataOrCtx.width;
    imgHeight = imgDataOrCtx.height;
    if (
      startX < 0 ||
      startY < 0 ||
      startX + size > imgWidth ||
      startY + size > imgHeight
    ) {
      return 0; // Out of bounds
    }
  } else {
    const ctx = imgDataOrCtx;
    if (
      startX < 0 ||
      startY < 0 ||
      startX + size > ctx.canvas.width ||
      startY + size > ctx.canvas.height
    ) {
      return 0; // Out of bounds
    }
    const imgData = ctx.getImageData(startX, startY, size, size);
    data = imgData.data;
    imgWidth = imgData.width;
    imgHeight = imgData.height;
  }

  let darkPixelCount = 0;
  let totalPixelsInsideCircle = 0;

  // Scan pixels inside the circle boundary
  for (let r = 0; r < size; r++) {
    const py = startY + r;
    for (let c = 0; c < size; c++) {
      const px = startX + c;

      // Calculate distance from center of bubble
      const dx = c - radius;
      const dy = r - radius;

      if (dx * dx + dy * dy <= radius * radius) {
        totalPixelsInsideCircle++;

        let idx;
        if (isImageData) {
          idx = (py * imgWidth + px) * 4;
        } else {
          idx = (r * size + c) * 4;
        }

        const red = data[idx];
        const green = data[idx + 1];
        const blue = data[idx + 2];

        // Convert to grayscale
        const gray = 0.299 * red + 0.587 * green + 0.114 * blue;

        // If grayscale value is lower than threshold, it is dark (marked)
        if (gray < thresholdValue) {
          darkPixelCount++;
        }
      }
    }
  }

  return totalPixelsInsideCircle > 0
    ? darkPixelCount / totalPixelsInsideCircle
    : 0;
};

/**
 * Scans a row of bubbles and determines the selected option(s).
 * Options is an array of objects: { label: 'A', x: X_coord, y: Y_coord, r: Radius }
 */
export const scanQuestionRow = (
  imgDataOrCtx,
  bubbles,
  thresholdValue = 150,
) => {
  const results = bubbles.map((bubble) => {
    const fillRatio = analyzeBubbleFill(
      imgDataOrCtx,
      bubble.x,
      bubble.y,
      bubble.r,
      thresholdValue,
    );
    return {
      label: bubble.label,
      fillRatio: fillRatio,
    };
  });

  // Sort by fill ratio descending
  const sorted = [...results].sort((a, b) => b.fillRatio - a.fillRatio);

  const PRIMARY_FILL_THRESHOLD = 0.45; // Bubble is filled if > 45% pixels are dark (increased to ignore printed text)
  const AMBIGUOUS_MARGIN = 0.20; // If difference between 1st and 2nd option is smaller than this, it's multiple

  const best = sorted[0];
  const second = sorted[1];

  if (best.fillRatio < PRIMARY_FILL_THRESHOLD) {
    return {
      selected: "BLANK",
      ratios: results,
      confidence: 1.0 - best.fillRatio,
    };
  }

  // Check if multiple bubbles are filled AND they are competitive
  if (second && second.fillRatio >= PRIMARY_FILL_THRESHOLD) {
    if (best.fillRatio - second.fillRatio < AMBIGUOUS_MARGIN) {
      return {
        selected: "MULT",
        ratios: results,
        confidence: 0.0,
      };
    }
  }

  return {
    selected: best.label,
    ratios: results,
    confidence: best.fillRatio - (second ? second.fillRatio : 0),
  };
};

/**
 * Scans a registration number grid.
 * Grid is arranged in columns (digits). Each column contains digits 0-9.
 * colsConfig: Array of arrays of bubbles. Each sub-array represents a column (from left to right digit).
 */
export const scanRegistrationGrid = (
  imgDataOrCtx,
  colsConfig,
  thresholdValue = 150,
) => {
  let registrationNumber = "";
  let success = true;

  const FILL_THRESHOLD = 0.45;

  colsConfig.forEach((colBubbles) => {
    const results = colBubbles.map((bubble) => {
      const fillRatio = analyzeBubbleFill(
        imgDataOrCtx,
        bubble.x,
        bubble.y,
        bubble.r,
        thresholdValue,
      );
      return { label: bubble.label, fillRatio };
    });

    const sorted = [...results].sort((a, b) => b.fillRatio - a.fillRatio);
    const best = sorted[0];

    if (best && best.fillRatio >= FILL_THRESHOLD) {
      registrationNumber += best.label;
    } else {
      registrationNumber += "?";
      success = false;
    }
  });

  return {
    value: registrationNumber,
    success: success,
  };
};
