const DEFAULT_MAX_DIMENSION = 1800
const MIN_BOARD_SIZE = 9
const MAX_BOARD_SIZE = 25

let openCvPromise = null

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Không thể đọc ảnh.'))
    }
    image.src = url
  })
}

function loadOpenCv() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Canvas chỉ chạy trong trình duyệt.'))
  if (window.cv && typeof window.cv.Mat === 'function') return Promise.resolve(window.cv)
  if (openCvPromise) return openCvPromise

  openCvPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gomoku-opencv]')
    if (existing) {
      const wait = () => {
        if (window.cv && typeof window.cv.Mat === 'function') resolve(window.cv)
        else window.setTimeout(wait, 50)
      }
      wait()
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.dataset.gomokuOpencv = 'true'
    script.src = 'https://docs.opencv.org/4.x/opencv.js'
    script.onload = () => {
      const wait = () => {
        if (window.cv && typeof window.cv.Mat === 'function') resolve(window.cv)
        else window.setTimeout(wait, 50)
      }
      wait()
    }
    script.onerror = () => reject(new Error('Không tải được OpenCV.js.'))
    document.head.appendChild(script)
  })

  return openCvPromise
}

function prepareCanvas(image, maxDimension = DEFAULT_MAX_DIMENSION) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ Canvas 2D.')
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function smooth(values, radius) {
  if (radius <= 0) return values.slice()
  const out = new Array(values.length).fill(0)
  let sum = 0
  const windowSize = radius * 2 + 1
  for (let i = 0; i < values.length + radius; i++) {
    if (i < values.length) sum += values[i]
    const removeIndex = i - windowSize
    if (removeIndex >= 0) sum -= values[removeIndex]
    const outIndex = i - radius
    if (outIndex >= 0 && outIndex < values.length) out[outIndex] = sum / Math.min(windowSize, values.length - Math.max(0, outIndex - radius))
  }
  return out
}

function localPeaks(values, threshold, minDistance) {
  const candidates = []
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] < threshold) continue
    if (values[i] < values[i - 1] || values[i] < values[i + 1]) continue
    candidates.push({ index: i, value: values[i] })
  }
  candidates.sort((a, b) => b.value - a.value)
  const chosen = []
  for (const item of candidates) {
    if (chosen.every((p) => Math.abs(p.index - item.index) >= minDistance)) chosen.push(item)
  }
  return chosen.sort((a, b) => a.index - b.index).map((p) => p.index)
}

function projectionPeaks(gray, width, height) {
  const data = gray.data || gray
  const cols = new Float64Array(width)
  const rows = new Float64Array(height)
  for (let y = 1; y < height - 1; y++) {
    const prev = (y - 1) * width
    const row = y * width
    const next = (y + 1) * width
    for (let x = 1; x < width - 1; x++) {
      const current = data[row + x]
      const dx = Math.abs(current - data[row + x - 1]) + Math.abs(current - data[row + x + 1])
      const dy = Math.abs(current - data[prev + x]) + Math.abs(current - data[next + x])
      if (dx > 24) cols[x] += dx
      if (dy > 24) rows[y] += dy
    }
  }
  const smoothCols = smooth(Array.from(cols), Math.max(1, Math.round(width / 300)))
  const smoothRows = smooth(Array.from(rows), Math.max(1, Math.round(height / 300)))
  const maxCol = Math.max(...smoothCols)
  const maxRow = Math.max(...smoothRows)
  return {
    x: maxCol ? localPeaks(smoothCols, maxCol * 0.35, Math.max(5, Math.round(width / 90))) : [],
    y: maxRow ? localPeaks(smoothRows, maxRow * 0.35, Math.max(5, Math.round(height / 90))) : [],
  }
}

function fitGridLines(peaks, axisLength, count) {
  if (peaks.length < 2) return null
  const sorted = peaks.slice().sort((a, b) => a - b)
  const firstLimit = Math.max(1, Math.floor(sorted.length * 0.35))
  const lastStart = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.65))
  let best = null

  for (let a = 0; a < firstLimit; a++) {
    for (let b = Math.max(a + 1, lastStart); b < sorted.length; b++) {
      const start = sorted[a]
      const end = sorted[b]
      if (end - start < axisLength * 0.45) continue
      const step = (end - start) / (count - 1)
      if (step < axisLength / 40 || step > axisLength / 4) continue

      let hitCount = 0
      let residual = 0
      for (let k = 0; k < count; k++) {
        const expected = start + step * k
        let nearest = Infinity
        for (const p of sorted) nearest = Math.min(nearest, Math.abs(p - expected))
        const normalized = nearest / step
        if (normalized <= 0.24) hitCount++
        residual += Math.min(normalized, 1.5)
      }

      const coverage = hitCount / count
      const score = coverage * 20 - residual
      if (!best || score > best.score) best = { score, coverage, start, end, step }
    }
  }

  if (!best || best.coverage < 0.6) return null
  return Array.from({ length: count }, (_, i) => best.start + best.step * i)
}

function detectGrid(canvas, cv) {
  const rgba = cv.imread(canvas)
  const gray = new cv.Mat()
  const blur = new cv.Mat()
  const edges = new cv.Mat()
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT)
  cv.Canny(blur, edges, 35, 100)

  const { x, y } = projectionPeaks(edges, gray.cols, gray.rows)
  const candidatesX = x
  const candidatesY = y

  let best = null
  for (let boardSize = MIN_BOARD_SIZE; boardSize <= MAX_BOARD_SIZE; boardSize++) {
    const lineCount = boardSize + 1
    const linesX = fitGridLines(candidatesX, gray.cols, lineCount)
    const linesY = fitGridLines(candidatesY, gray.rows, lineCount)
    if (!linesX || !linesY) continue

    const stepX = linesX[1] - linesX[0]
    const stepY = linesY[1] - linesY[0]
    const ratio = Math.min(stepX, stepY) / Math.max(stepX, stepY)
    const coverage = Math.min(
      (gray.cols - linesX[linesX.length - 1] + linesX[0]) / gray.cols,
      (gray.rows - linesY[linesY.length - 1] + linesY[0]) / gray.rows
    )
    const score = ratio * 10 + (1 - Math.min(coverage * 8, 1)) * 2
    if (!best || score > best.score) best = { boardSize, linesX, linesY, score }
  }

  rgba.delete()
  gray.delete()
  blur.delete()
  edges.delete()
  return best
}

function classifyCell(ctx, linesX, linesY, row, col) {
  const x0 = linesX[col]
  const x1 = linesX[col + 1]
  const y0 = linesY[row]
  const y1 = linesY[row + 1]
  const padX = (x1 - x0) * 0.12
  const padY = (y1 - y0) * 0.12
  const sx = Math.max(0, Math.floor(x0 + padX))
  const sy = Math.max(0, Math.floor(y0 + padY))
  const ex = Math.min(ctx.canvas.width, Math.ceil(x1 - padX))
  const ey = Math.min(ctx.canvas.height, Math.ceil(y1 - padY))
  const width = ex - sx
  const height = ey - sy
  if (width <= 2 || height <= 2) return { type: 'empty', confidence: 0 }

  const image = ctx.getImageData(sx, sy, width, height)
  const data = image.data
  let red = 0
  let green = 0
  let gray = 0
  let darkNeutral = 0
  let samples = 0

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min
    const saturation = max === 0 ? 0 : delta / max
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b

    if (saturation > 0.09 && r > g * 1.08 && r > b * 1.04 && r - g > 10) red++
    if (saturation > 0.09 && g > r * 1.06 && g > b * 1.03 && g - r > 8) green++
    if (saturation < 0.16 && luminance >= 55 && luminance <= 210 && delta < 42) gray++
    if (luminance < 155 && saturation < 0.20) darkNeutral++
    samples++
  }

  const redRatio = red / samples
  const greenRatio = green / samples
  const grayRatio = gray / samples
  const darkNeutralRatio = darkNeutral / samples
  const stoneThreshold = Math.max(0.20, Math.min(0.55, 0.31 * (180 / Math.max(x1 - x0, 1))))

  if (grayRatio >= stoneThreshold && darkNeutralRatio >= 0.18 && redRatio < 0.02 && greenRatio < 0.02) {
    return { type: 'blocked', confidence: Math.min(1, grayRatio / stoneThreshold) }
  }
  if (redRatio >= 0.010 && redRatio >= greenRatio * 1.35) {
    return { type: 'black', confidence: Math.min(1, redRatio / 0.07) }
  }
  if (greenRatio >= 0.010 && greenRatio >= redRatio * 1.35) {
    return { type: 'white', confidence: Math.min(1, greenRatio / 0.07) }
  }
  return { type: 'empty', confidence: 1 - Math.min(1, Math.max(redRatio, greenRatio, grayRatio) * 8) }
}

function classifyByCanvas(canvas, grid) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const black = []
  const white = []
  const blocked = []
  let score = 0
  for (let y = 0; y < grid.boardSize; y++) {
    for (let x = 0; x < grid.boardSize; x++) {
      const result = classifyCell(ctx, grid.linesX, grid.linesY, y, x)
      score += result.confidence
      if (result.type === 'black') black.push([x, y])
      else if (result.type === 'white') white.push([x, y])
      else if (result.type === 'blocked') blocked.push([x, y])
    }
  }

  const total = black.length + white.length + blocked.length
  const balanced = 1 - Math.min(1, Math.abs(black.length - white.length) / Math.max(black.length + white.length, 1))
  return {
    boardSize: grid.boardSize,
    black,
    white,
    blocked,
    confidence: clamp((score / (grid.boardSize * grid.boardSize)) * 0.75 + balanced * 0.25, 0, 1),
  }
}

function validateResult(result) {
  const occupied = result.black.length + result.white.length + result.blocked.length
  const playable = result.boardSize * result.boardSize
  const balanced = Math.abs(result.black.length - result.white.length) <= 1
  const plausible = occupied <= playable * 0.75
  const enoughStones = result.black.length + result.white.length >= 3
  result.valid = balanced && plausible && enoughStones
  result.warning = result.valid ? '' : 'Kết quả nhận diện có độ tin cậy thấp. Hãy kiểm tra trước khi nhập.'
  return result
}

export async function detectGomokuBoard(file, options = {}) {
  if (!file) throw new Error('Chưa chọn ảnh.')
  const image = await loadImage(file)
  const canvas = prepareCanvas(image, options.maxDimension || DEFAULT_MAX_DIMENSION)

  let grid = null
  try {
    const cv = await loadOpenCv()
    grid = detectGrid(canvas, cv)
  } catch (error) {
    // Canvas fallback keeps image import usable if OpenCV cannot be downloaded.
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const gray = new Uint8ClampedArray(canvas.width * canvas.height)
    for (let i = 0, p = 0; i < imageData.data.length; i += 4, p++) {
      gray[p] = Math.round(0.299 * imageData.data[i] + 0.587 * imageData.data[i + 1] + 0.114 * imageData.data[i + 2])
    }
    const projection = projectionPeaks(gray, canvas.width, canvas.height)
    let best = null
    for (let boardSize = MIN_BOARD_SIZE; boardSize <= MAX_BOARD_SIZE; boardSize++) {
      const linesX = fitGridLines(projection.x, canvas.width, boardSize + 1)
      const linesY = fitGridLines(projection.y, canvas.height, boardSize + 1)
      if (!linesX || !linesY) continue
      const stepX = linesX[1] - linesX[0]
      const stepY = linesY[1] - linesY[0]
      const ratio = Math.min(stepX, stepY) / Math.max(stepX, stepY)
      if (!best || ratio > best.score) best = { boardSize, linesX, linesY, score: ratio }
    }
    grid = best
  }

  if (!grid) throw new Error('Không tìm thấy lưới bàn cờ trong ảnh.')
  const result = classifyByCanvas(canvas, grid)
  result.preview = canvas.toDataURL('image/jpeg', 0.88)
  result.engine = 'opencv-assisted'
  return validateResult(result)
}
