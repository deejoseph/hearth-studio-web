import { COACH_IMAGE_BYTES_MAX } from '../game/coachProfile.js';

export const COACH_IMAGE_SIDE_TARGET = 1600;
const JPEG_QUALITY = 0.85;

export function coachImagePlan(width, height, bytes) {
  if (![width, height, bytes].every(Number.isFinite) || width < 1 || height < 1 || bytes < 1) {
    return { ok: false, text: '这张图读不出来，请换一张。' };
  }
  const longSide = Math.max(width, height);
  const compress = bytes > COACH_IMAGE_BYTES_MAX || longSide > COACH_IMAGE_SIDE_TARGET;
  const scale = compress ? Math.min(1, COACH_IMAGE_SIDE_TARGET / longSide) : 1;
  return {
    ok: true,
    compress,
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeImage(file) {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function browserCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function jpegFile(blob, name) {
  const base = String(name).replace(/\.[^.]+$/, '') || 'coach-image';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

/** 超过两兆或长边超过 1600 才转 JPEG；透明区域铺白底，小图原样返回。 */
export async function prepareCoachImage(file, {
  decode = decodeImage,
  makeCanvas = browserCanvas,
  makeFile = jpegFile,
} = {}) {
  if (!file) return { ok: false, text: '没有选中图片。' };

  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    return { ok: false, text: '这张图读不出来，请换一张。' };
  }

  try {
    const plan = coachImagePlan(decoded.width, decoded.height, file.size);
    if (!plan.ok) return plan;
    if (!plan.compress) return { ...plan, file, compressed: false };

    const canvas = makeCanvas(plan.width, plan.height);
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, text: '这张图没法压缩，请换一张。' };
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, plan.width, plan.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(decoded.source, 0, 0, plan.width, plan.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('canvas encoding failed'));
      }, 'image/jpeg', JPEG_QUALITY);
    });
    if (blob.size < 1) return { ok: false, text: '压缩后的图片是空的，请换一张。' };
    return { ...plan, file: makeFile(blob, file.name), compressed: true };
  } catch {
    return { ok: false, text: '自动压缩失败，请换一张图片再试。' };
  } finally {
    decoded.close?.();
  }
}
