/**
 * Document scanner core (CamScanner-style), framework-agnostic.
 *
 * Pipeline:
 *   1. detectDocument()  – find the 4 corners of the page in a photo
 *   2. warpPerspective() – flatten / straighten the page to a rectangle
 *   3. enhanceDocument() – remove shadows, whiten paper and make text crisp
 *                          while keeping the original colours (no photocopy look)
 *
 * Works on plain RGBA buffers so it can run in the browser (ImageData) and in
 * Node (tests) alike. Keep this file free of DOM / Node APIs.
 */

export type RGBAImage = { data: Uint8ClampedArray; width: number; height: number };
export type Point = { x: number; y: number };
/** Corners ordered: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];
export type EnhanceMode = 'color' | 'grayscale' | 'original';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function luminance(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/**
 * Separable box blur on a single-channel float buffer. Mutates and returns `a`;
 * pass a copy if the input must be preserved. Several passes ≈ gaussian.
 */
function boxBlur(a: Float32Array, w: number, h: number, r: number, passes = 1): Float32Array {
  if (r < 1) return a;
  const b = new Float32Array(a.length);
  const win = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    // horizontal a -> b
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += a[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        b[row + x] = acc / win;
        const out = row + Math.max(0, x - r);
        const inn = row + Math.min(w - 1, x + r + 1);
        acc += a[inn] - a[out];
      }
    }
    // vertical b -> a
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += b[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / win;
        const out = Math.max(0, y - r) * w + x;
        const inn = Math.min(h - 1, y + r + 1) * w + x;
        acc += b[inn] - b[out];
      }
    }
  }
  return a;
}

/** Downscale RGBA to grayscale float buffer by area averaging. */
function downscaleGray(img: RGBAImage, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = new Float32Array(w * h);
  const cnt = new Float32Array(w * h);
  const sx = w / img.width;
  const sy = h / img.height;
  // Sample with stride to keep it fast on big photos (still ~4+ samples per cell).
  const step = Math.max(1, Math.floor(1 / scale / 2));
  for (let y = 0; y < img.height; y += step) {
    const ty = Math.min(h - 1, Math.floor(y * sy));
    for (let x = 0; x < img.width; x += step) {
      const tx = Math.min(w - 1, Math.floor(x * sx));
      const j = ty * w + tx;
      out[j] += luminance(img.data, (y * img.width + x) * 4);
      cnt[j]++;
    }
  }
  for (let j = 0; j < out.length; j++) out[j] = cnt[j] ? out[j] / cnt[j] : 0;
  return { gray: out, w, h, scale: w / img.width };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function cross(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Order 4 points as TL, TR, BR, BL. */
export function orderQuad(pts: Point[]): Quad {
  const c = {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
  const sorted = [...pts].sort(
    (a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x)
  ); // clockwise in screen coords starting around the left
  // rotate so that the first is the top-left (min x+y)
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  }
  const r = [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]);
  return [r[0], r[1], r[2], r[3]];
}

export function fullImageQuad(w: number, h: number): Quad {
  return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
}

export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < 1e-6) return false;
    const s = Math.sign(c);
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 1. Detection (line-based, like CamScanner)
// ---------------------------------------------------------------------------

export type DetectDebug = (name: string, buf: Uint8Array | Float32Array, w: number, h: number) => void;

/** Grayscale max / min filter with a square window (separable). */
function rankFilter(src: Float32Array, w: number, h: number, r: number, isMax: boolean): Float32Array {
  const pick = isMax ? Math.max : Math.min;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = src[y * w + x];
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, src[y * w + k]);
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Line in normal form: x·cosθ + y·sinθ = ρ. `frame` marks the photo border. */
type Line = { theta: number; rho: number; votes: number; frame: boolean };

function intersect(a: Line, b: Line): Point | null {
  const c1 = Math.cos(a.theta), s1 = Math.sin(a.theta);
  const c2 = Math.cos(b.theta), s2 = Math.sin(b.theta);
  const det = c1 * s2 - s1 * c2;
  if (Math.abs(det) < 1e-6) return null;
  return { x: (a.rho * s2 - s1 * b.rho) / det, y: (c1 * b.rho - a.rho * c2) / det };
}

/** Hough transform restricted to each pixel's gradient direction; returns strongest distinct lines. */
function houghLines(mag: Float32Array, gx: Float32Array, gy: Float32Array, w: number, h: number, thr: number, maxLines: number): Line[] {
  const T = 180;
  const diag = Math.ceil(Math.hypot(w, h));
  const R = 2 * diag + 1;
  const acc = new Float32Array(T * R);
  const cos = new Float32Array(T), sin = new Float32Array(T);
  for (let t = 0; t < T; t++) { cos[t] = Math.cos((t * Math.PI) / T); sin[t] = Math.sin((t * Math.PI) / T); }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const m = mag[p];
      if (m < thr) continue;
      let ang = Math.atan2(gy[p], gx[p]);
      if (ang < 0) ang += Math.PI;
      const t0 = Math.round((ang / Math.PI) * T);
      for (let dt = -4; dt <= 4; dt++) {
        const t = (t0 + dt + T) % T;
        const rho = Math.round(x * cos[t] + y * sin[t]) + diag;
        acc[t * R + rho] += m;
      }
    }
  }
  const lines: Line[] = [];
  const used = new Uint8Array(T * R);
  for (let n = 0; n < maxLines * 4 && lines.length < maxLines; n++) {
    let best = 0, bi = -1;
    for (let i = 0; i < acc.length; i++) if (!used[i] && acc[i] > best) { best = acc[i]; bi = i; }
    if (bi < 0 || best <= 0) break;
    const t = Math.floor(bi / R), r = bi % R;
    // suppress the neighbourhood (θ wraps around with ρ sign flip; small window is enough)
    for (let dt = -8; dt <= 8; dt++) {
      const tt = t + dt;
      const wrap = tt < 0 || tt >= T;
      const ti = (tt + T) % T;
      const rc = wrap ? 2 * diag - r : r;
      for (let dr = -10; dr <= 10; dr++) {
        const rr = rc + dr;
        if (rr >= 0 && rr < R) used[ti * R + rr] = 1;
      }
    }
    lines.push({ theta: (t * Math.PI) / T, rho: r - diag, votes: best, frame: false });
  }
  return lines;
}

/**
 * Locate a document page in a photo. Returns corners in source-image pixels,
 * or null if nothing convincing was found (caller should fall back to full image).
 */
export function detectDocument(img: RGBAImage, debug?: DetectDebug): Quad | null {
  const { gray, w, h, scale } = downscaleGray(img, 420);
  // Morphological closing erases printed text so only the *paper shape* remains.
  const textR = Math.max(4, Math.round(Math.max(w, h) / 40));
  const closed = rankFilter(rankFilter(gray, w, h, textR, true), w, h, textR, false);
  // "Ink" map (black-hat): dark marks on lighter paper = printed content.
  const ink = new Float32Array(w * h);
  for (let p = 0; p < ink.length; p++) ink[p] = Math.max(0, closed[p] - gray[p]);
  boxBlur(ink, w, h, 1, 1);
  const field = boxBlur(closed, w, h, 1, 2);
  debug?.('closed', field, w, h);
  debug?.('ink', ink, w, h);

  // Gradients
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h), mag = new Float32Array(w * h);
  let maxMag = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const X = field[p - w + 1] + 2 * field[p + 1] + field[p + w + 1] - field[p - w - 1] - 2 * field[p - 1] - field[p + w - 1];
      const Y = field[p + w - 1] + 2 * field[p + w] + field[p + w + 1] - field[p - w - 1] - 2 * field[p - w] - field[p - w + 1];
      gx[p] = X; gy[p] = Y;
      const m = Math.hypot(X, Y);
      mag[p] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  if (maxMag < 8) return null;
  const thr = Math.max(maxMag * 0.1, 6);
  debug?.('edges', mag.map((m) => (m >= thr ? 255 : 0)), w, h);

  // Keep the strongest lines of *each* orientation so dense horizontal structure
  // (text bands, table rulings) can't crowd out the page's vertical borders.
  const detected = houghLines(mag, gx, gy, w, h, thr, 40);
  const horiz: Line[] = [], vert: Line[] = [];
  for (const l of detected) {
    const bucket = Math.abs(Math.sin(l.theta)) > Math.abs(Math.cos(l.theta)) ? horiz : vert;
    if (bucket.length < 10) bucket.push(l);
  }
  // Photo borders are valid sides when the page extends beyond the frame.
  horiz.push({ theta: Math.PI / 2, rho: 0.5, votes: 0, frame: true }, { theta: Math.PI / 2, rho: h - 1.5, votes: 0, frame: true });
  vert.push({ theta: 0, rho: 0.5, votes: 0, frame: true }, { theta: 0, rho: w - 1.5, votes: 0, frame: true });
  const posH = (l: Line) => (l.rho - (w / 2) * Math.cos(l.theta)) / Math.sin(l.theta); // y at centre column
  const posV = (l: Line) => (l.rho - (h / 2) * Math.sin(l.theta)) / Math.cos(l.theta); // x at centre row

  // Side support: fraction of samples on an edge whose inside is brighter than outside,
  // discounted when printed content lies *outside* the side (a real page border never
  // cuts through text – this rejects shading bands and table rulings inside the page).
  const INK_T = 6;

  // A photo border is a plausible side only when content touches it (page cut by the frame).
  const frameSupport = (a: Point, b: Point, c: Point): number => {
    const len = dist(a, b);
    const n = Math.max(8, Math.round(len / 4));
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((c.x - mx) * nx + (c.y - my) * ny < 0) { nx = -nx; ny = -ny; }
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      for (let d = 1; d <= 3 * textR; d += 2) {
        const px = Math.round(x + nx * d), py = Math.round(y + ny * d);
        if (px >= 0 && py >= 0 && px < w && py < h && ink[py * w + px] > INK_T) { hits++; break; }
      }
    }
    return 0.2 + 0.6 * Math.min(1, (hits / n) * 2.5);
  };
  const sideSupport = (a: Point, b: Point, c: Point): number => {
    const len = dist(a, b);
    const n = Math.max(8, Math.round(len / 3));
    let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if ((c.x - mx) * nx + (c.y - my) * ny < 0) { nx = -nx; ny = -ny; } // normal points inside
    const off = textR + 2;
    let ok = 0, inkOut = 0, inkSamples = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      for (let d = 2; d <= 4 * textR; d += 2) {
        const px = Math.round(x - nx * d), py = Math.round(y - ny * d);
        if (px < 0 || py < 0 || px >= w || py >= h) break;
        inkSamples++;
        if (ink[py * w + px] > INK_T) inkOut++;
      }
      const xi = Math.round(x + nx * off), yi = Math.round(y + ny * off);
      const xo = Math.round(x - nx * off), yo = Math.round(y - ny * off);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h || xo < 0 || yo < 0 || xo >= w || yo >= h) continue;
      let m = 0;
      for (let d = -2; d <= 2; d++) {
        const px = Math.round(x + nx * d), py = Math.round(y + ny * d);
        if (px >= 0 && py >= 0 && px < w && py < h) m = Math.max(m, mag[py * w + px]);
      }
      if (m >= thr * 0.8 && field[yi * w + xi] - field[yo * w + xo] > 2) ok++;
    }
    const inkFrac = inkSamples ? inkOut / inkSamples : 0;
    return (ok / n) * Math.max(0, 1 - inkFrac * 6);
  };

  const imgArea = w * h;
  let best: { quad: Quad; score: number } | null = null;
  for (let i = 0; i < horiz.length; i++) {
    for (let j = 0; j < horiz.length; j++) {
      if (i === j) continue;
      const top = horiz[i], bottom = horiz[j];
      if (posH(top) >= posH(bottom) - h * 0.15) continue;
      for (let k = 0; k < vert.length; k++) {
        for (let l = 0; l < vert.length; l++) {
          if (k === l) continue;
          const left = vert[k], right = vert[l];
          if (posV(left) >= posV(right) - w * 0.15) continue;
          const sides = [top, right, bottom, left];
          const frameCount = sides.filter((s) => s.frame).length;
          if (frameCount > 2) continue;
          const tl = intersect(top, left), tr = intersect(top, right);
          const br = intersect(bottom, right), bl = intersect(bottom, left);
          if (!tl || !tr || !br || !bl) continue;
          const quad: Quad = [tl, tr, br, bl];
          const margin = 0.04 * Math.max(w, h);
          if (quad.some((p) => p.x < -margin || p.y < -margin || p.x > w + margin || p.y > h + margin)) continue;
          if (!isConvexQuad(quad)) continue;
          const area = polygonArea(quad);
          if (area < imgArea * 0.1) continue;
          const c = { x: (tl.x + tr.x + br.x + bl.x) / 4, y: (tl.y + tr.y + br.y + bl.y) / 4 };
          let supp = 0, total = 0;
          for (let s = 0; s < 4; s++) {
            const a = quad[s], b = quad[(s + 1) % 4];
            const len = dist(a, b);
            total += len;
            supp += (sides[s].frame ? frameSupport(a, b, c) : sideSupport(a, b, c)) * len;
          }
          const score = supp / total + 0.3 * (area / imgArea);
          if (!best || score > best.score) best = { quad, score };
        }
      }
    }
  }

  if (!best || best.score < 0.45) return null;
  const inv = 1 / scale;
  const q = orderQuad(best.quad.map((p) => ({
    x: Math.min(img.width, Math.max(0, p.x * inv)),
    y: Math.min(img.height, Math.max(0, p.y * inv)),
  })));
  return isConvexQuad(q) ? q : null;
}

// ---------------------------------------------------------------------------
// 2. Perspective warp
// ---------------------------------------------------------------------------

/** Solve the homography H mapping dst rectangle points to src points (8 unknowns). */
function homography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
    h[r] = s / (A[r][r] || 1e-12);
  }
  return [...h, 1];
}

/** Output size of the flattened page, capped to `maxSide` pixels on its long edge. */
export function quadOutputSize(q: Quad, maxSide = 2400) {
  let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * s));
  h = Math.max(1, Math.round(h * s));
  return { width: w, height: h };
}

export function warpPerspective(src: RGBAImage, q: Quad, maxSide = 2400): RGBAImage {
  const { width: W, height: H } = quadOutputSize(q, maxSide);
  const Hm = homography(
    [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }],
    q
  );
  const out = new Uint8ClampedArray(W * H * 4);
  const sw = src.width, sh = src.height, sd = src.data;
  for (let y = 0; y < H; y++) {
    const yy = y + 0.5;
    for (let x = 0; x < W; x++) {
      const xx = x + 0.5;
      const den = Hm[6] * xx + Hm[7] * yy + Hm[8];
      let u = (Hm[0] * xx + Hm[1] * yy + Hm[2]) / den - 0.5;
      let v = (Hm[3] * xx + Hm[4] * yy + Hm[5]) / den - 0.5;
      if (u < 0) u = 0; else if (u > sw - 1) u = sw - 1;
      if (v < 0) v = 0; else if (v > sh - 1) v = sh - 1;
      const x0 = u | 0, y0 = v | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
        const bot = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}

/** Rotate an image 90° clockwise (turns = 1) or counter-clockwise (turns = -1). */
export function rotate90(img: RGBAImage, turns: 1 | -1): RGBAImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = turns === 1 ? h - 1 - y : y;
      const ny = turns === 1 ? x : w - 1 - x;
      const si = (y * w + x) * 4, di = (ny * h + nx) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = 255;
    }
  }
  return { data: out, width: h, height: w };
}

// ---------------------------------------------------------------------------
// 3. Enhancement ("Magic colour")
// ---------------------------------------------------------------------------

/**
 * Estimate the paper/background colour field at low resolution.
 * Text and small marks are removed with a max filter, then the field is smoothed.
 */
function estimateBackground(img: RGBAImage) {
  const { width: W, height: H, data } = img;
  const block = Math.max(4, Math.round(Math.max(W, H) / 180));
  const gw = Math.ceil(W / block), gh = Math.ceil(H / block);
  const ch = [new Float32Array(gw * gh), new Float32Array(gw * gh), new Float32Array(gw * gh)];
  // Per block: mean of the brightest quarter of sampled pixels (≈ paper under that block).
  const samples: number[] = [];
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      samples.length = 0;
      const x0 = bx * block, y0 = by * block;
      const x1 = Math.min(W, x0 + block), y1 = Math.min(H, y0 + block);
      const step = Math.max(1, Math.floor(block / 6));
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) samples.push((y * W + x) * 4);
      }
      samples.sort((a, b) => luminance(data, b) - luminance(data, a));
      const n = Math.max(1, Math.floor(samples.length / 4));
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < n; k++) { r += data[samples[k]]; g += data[samples[k] + 1]; b += data[samples[k] + 2]; }
      const j = by * gw + bx;
      ch[0][j] = r / n; ch[1][j] = g / n; ch[2][j] = b / n;
    }
  }
  // Max filter (removes dense text / table lines), then smooth.
  const maxR = 2;
  const filtered = ch.map((c) => {
    const o = new Float32Array(c.length);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        let m = 0;
        for (let dy = -maxR; dy <= maxR; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -maxR; dx <= maxR; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= gw) continue;
            const v = c[yy * gw + xx];
            if (v > m) m = v;
          }
        }
        o[y * gw + x] = m;
      }
    }
    return boxBlur(o, gw, gh, 2, 3);
  });

  // Global paper colour = bright percentile of the field.
  const lum = new Float32Array(gw * gh);
  for (let j = 0; j < lum.length; j++) lum[j] = 0.299 * filtered[0][j] + 0.587 * filtered[1][j] + 0.114 * filtered[2][j];
  const sortedIdx = Array.from(lum.keys()).sort((a, b) => lum[b] - lum[a]);
  const top = sortedIdx.slice(0, Math.max(1, Math.floor(sortedIdx.length * 0.1)));
  const paper = [0, 1, 2].map((c) => top.reduce((s, j) => s + filtered[c][j], 0) / top.length);
  const paperLum = 0.299 * paper[0] + 0.587 * paper[1] + 0.114 * paper[2];

  // Protect large coloured areas (logos, stamps, coloured headers): shadows change
  // brightness but not hue, so cells whose chroma departs from the paper's are
  // pulled back towards the paper colour instead of being "whitened away".
  for (let j = 0; j < lum.length; j++) {
    const l = Math.max(1, lum[j]);
    let chromaDiff = 0;
    for (let c = 0; c < 3; c++) {
      chromaDiff = Math.max(chromaDiff, Math.abs(filtered[c][j] / l - paper[c] / paperLum));
    }
    const ratio = Math.max(0.35, Math.min(1, l / paperLum)); // shadow depth
    const t = Math.min(1, Math.max(0, (chromaDiff - 0.08) / 0.12)); // 0 = shadow, 1 = colour region
    for (let c = 0; c < 3; c++) {
      const shadowBg = paper[c] * ratio;
      filtered[c][j] = filtered[c][j] * (1 - t) + shadowBg * t;
    }
  }
  return { field: filtered, gw, gh, block };
}

/**
 * CamScanner-like enhancement.
 *  - 'color':     shadow removal + white paper + crisp, dark text, colours preserved
 *  - 'grayscale': same, desaturated
 *  - 'original':  untouched copy
 */
export function enhanceDocument(img: RGBAImage, mode: EnhanceMode = 'color'): RGBAImage {
  const { width: W, height: H, data } = img;
  if (mode === 'original') return { data: new Uint8ClampedArray(data), width: W, height: H };

  const { field, gw, gh, block } = estimateBackground(img);
  const n = W * H;

  // Step 1: divide by background (illumination flattening) -> paper ≈ 255
  const norm = new Float32Array(n * 3);
  for (let y = 0; y < H; y++) {
    // bilinear interpolation in the background grid (cell centres)
    const gy = Math.min(gh - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const y0 = Math.floor(gy), y1 = Math.min(gh - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < W; x++) {
      const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) / block - 0.5));
      const x0 = Math.floor(gx), x1 = Math.min(gw - 1, x0 + 1), fx = gx - x0;
      const p = y * W + x, i = p * 4;
      for (let c = 0; c < 3; c++) {
        const f = field[c];
        const a = f[y0 * gw + x0] + (f[y0 * gw + x1] - f[y0 * gw + x0]) * fx;
        const b = f[y1 * gw + x0] + (f[y1 * gw + x1] - f[y1 * gw + x0]) * fx;
        const bg = Math.max(24, a + (b - a) * fy);
        norm[p * 3 + c] = Math.min(255, (data[i + c] / bg) * 255);
      }
    }
  }

  // Step 2: unsharp mask on luminance (crisper glyph edges)
  const lum = new Float32Array(n);
  for (let p = 0; p < n; p++) lum[p] = 0.299 * norm[p * 3] + 0.587 * norm[p * 3 + 1] + 0.114 * norm[p * 3 + 2];
  const radius = Math.max(1, Math.round(Math.max(W, H) / 1400));
  const blur = boxBlur(Float32Array.from(lum), W, H, radius, 2);
  // Local minimum: used to slightly thicken thin / faded strokes (thermal & dot-matrix print).
  const lumMin = rankFilter(lum, W, H, 1, false);

  // Step 3: smooth tone curve – clean white paper and deep ink, while keeping the
  // anti-aliased grey edge of each glyph (a hard threshold is what looks like a photocopy).
  const BLACK = 18; // ink at or below this becomes pure black
  const WHITE = 244; // paper at or above this becomes pure white
  const GAMMA = 1.35; // >1 deepens mid-tones -> bolder text
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - BLACK) / (WHITE - BLACK)));
    lut[v] = Math.round(255 * Math.pow(t, GAMMA));
  }
  const SHARP = 1.0;
  const BOLD = 0.35;
  const SAT = 1.25;

  const out = new Uint8ClampedArray(n * 4);
  for (let p = 0; p < n; p++) {
    const detail = (lum[p] - blur[p]) * SHARP - (lum[p] - lumMin[p]) * BOLD;
    let r = clamp255(norm[p * 3] + detail);
    let g = clamp255(norm[p * 3 + 1] + detail);
    let b = clamp255(norm[p * 3 + 2] + detail);
    r = lut[r | 0]; g = lut[g | 0]; b = lut[b | 0];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const o = p * 4;
    if (mode === 'grayscale') {
      out[o] = out[o + 1] = out[o + 2] = l;
    } else {
      out[o] = clamp255(l + (r - l) * SAT);
      out[o + 1] = clamp255(l + (g - l) * SAT);
      out[o + 2] = clamp255(l + (b - l) * SAT);
    }
    out[o + 3] = 255;
  }
  return { data: out, width: W, height: H };
}
