const toFinite = (value: string, label: string): number => {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Некорректное значение ${label} в TFW`);
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Некорректное значение ${label} в TFW`);
  }
  return parsed;
};

const EPS = 1e-12;

export type TfwParams = {
  // A
  pixelSizeX: number;
  // D
  rotationY: number;
  // B
  rotationX: number;
  // E
  pixelSizeY: number;
  // C (центр верхнего левого пикселя)
  topLeftX: number;
  // F (центр верхнего левого пикселя)
  topLeftY: number;
};

export const parseTfw = (content: string): TfwParams => {
  const lines = content.split(/\r?\n/).map((line) => line.trim());

  // Разрешаем только пустые хвостовые строки (CRLF/newline в конце файла).
  while (lines.length > 0 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }

  if (lines.length !== 6) {
    throw new Error('TFW должен содержать ровно 6 строк (A, D, B, E, C, F).');
  }

  const [rawA, rawD, rawB, rawE, rawC, rawF] = lines;
  const a = toFinite(rawA, 'A');
  const d = toFinite(rawD, 'D');
  const b = toFinite(rawB, 'B');
  const e = toFinite(rawE, 'E');
  const c = toFinite(rawC, 'C');
  const f = toFinite(rawF, 'F');

  if (Math.abs(a) < EPS) {
    throw new Error('Некорректное значение A в TFW: размер пикселя X не может быть 0.');
  }
  if (Math.abs(e) < EPS) {
    throw new Error('Некорректное значение E в TFW: размер пикселя Y не может быть 0.');
  }

  return {
    pixelSizeX: a,
    rotationY: d,
    rotationX: b,
    pixelSizeY: e,
    topLeftX: c,
    topLeftY: f,
  };
};

export const computeBoundsFromTfw = (
  params: TfwParams,
  width: number,
  height: number,
): { north: number; south: number; east: number; west: number } => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Некорректные размеры изображения для TFW');
  }
  if (Math.abs(params.rotationX) > 1e-9 || Math.abs(params.rotationY) > 1e-9) {
    throw new Error('Поворот в TFW не поддерживается в MVP');
  }

  // Для world file C/F задают центр верхнего левого пикселя.
  const west = params.topLeftX - params.pixelSizeX / 2;
  const north = params.topLeftY - params.pixelSizeY / 2;
  const east = west + params.pixelSizeX * width;
  const south = north + params.pixelSizeY * height;

  return {
    north: Math.max(north, south),
    south: Math.min(north, south),
    east: Math.max(east, west),
    west: Math.min(east, west),
  };
};
