import { describe, expect, it, vi } from 'vitest';
import { COACH_IMAGE_BYTES_MAX } from '../src/game/coachProfile.js';
import {
  COACH_IMAGE_SIDE_TARGET,
  coachImagePlan,
  prepareCoachImage,
} from '../src/net/coachImage.js';

const inputFile = (size = 1024, name = '证书.png') =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });

const decoded = (width, height, close = vi.fn()) => ({
  source: { width, height },
  width,
  height,
  close,
});

const canvasWith = (blob = new Blob(['jpeg'], { type: 'image/jpeg' }), context = {}) => {
  const paint = {
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    ...context,
  };
  return {
    canvas: {
      width: 0,
      height: 0,
      getContext: vi.fn(() => (context === null ? null : paint)),
      toBlob: vi.fn((done, type, quality) => done(blob)),
    },
    context: paint,
  };
};

describe('上传前先决定要不要压缩', () => {
  it('恰好两兆、恰好 1600 的长边都不动', () => {
    expect(coachImagePlan(1600, 900, COACH_IMAGE_BYTES_MAX)).toEqual({
      ok: true,
      compress: false,
      width: 1600,
      height: 900,
    });
  });

  it('只超字节也压缩，但尺寸不放大', () => {
    expect(coachImagePlan(800, 600, COACH_IMAGE_BYTES_MAX + 1)).toEqual({
      ok: true,
      compress: true,
      width: 800,
      height: 600,
    });
  });

  it.each([
    [[3200, 1800], [1600, 900]],
    [[2000, 4000], [800, 1600]],
    [[4001, 1], [1600, 1]],
  ])('%s 等比缩到长边 1600', ([width, height], [wantWidth, wantHeight]) => {
    expect(coachImagePlan(width, height, 1024)).toEqual({
      ok: true,
      compress: true,
      width: wantWidth,
      height: wantHeight,
    });
  });

  it.each([[0, 100, 10], [100, -1, 10], [100, 100, 0], [NaN, 100, 10], [100, 100, Infinity]])(
    '读不出的尺寸或字节数直接拒：%s',
    (width, height, bytes) => {
      expect(coachImagePlan(width, height, bytes)).toEqual({
        ok: false,
        text: '这张图读不出来，请换一张。',
      });
    },
  );
});

describe('图片处理', () => {
  it('小图原样返回，不创建画布，并释放解码结果', async () => {
    const file = inputFile();
    const close = vi.fn();
    const makeCanvas = vi.fn(() => { throw new Error('小图不该建画布'); });
    const makeFile = vi.fn(() => { throw new Error('小图不该转码'); });

    const result = await prepareCoachImage(file, {
      decode: vi.fn(async () => decoded(800, 600, close)),
      makeCanvas,
      makeFile,
    });

    expect(result).toMatchObject({ ok: true, compressed: false, width: 800, height: 600 });
    expect(result.file).toBe(file);
    expect(makeCanvas).not.toHaveBeenCalled();
    expect(makeFile).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('大图铺白底后按 85% 质量转 JPEG，文件名跟着换扩展名', async () => {
    const file = inputFile(COACH_IMAGE_BYTES_MAX + 1, '荣誉.PNG');
    const source = { width: 3200, height: 1800 };
    const close = vi.fn();
    const { canvas, context } = canvasWith();
    const makeCanvas = vi.fn((width, height) => {
      canvas.width = width;
      canvas.height = height;
      return canvas;
    });

    const result = await prepareCoachImage(file, {
      decode: vi.fn(async () => ({ source, width: 3200, height: 1800, close })),
      makeCanvas,
    });

    expect(makeCanvas).toHaveBeenCalledWith(1600, 900);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(900);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1600, 900);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 1600, 900);
    expect(context.fillRect.mock.invocationCallOrder[0])
      .toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    expect(result).toMatchObject({ ok: true, compressed: true, width: 1600, height: 900 });
    expect(result.file.name).toBe('荣誉.jpg');
    expect(result.file.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalledOnce();
  });

  it('解码失败就说换一张，不尝试上传原文件', async () => {
    const makeCanvas = vi.fn();
    const result = await prepareCoachImage(inputFile(), {
      decode: vi.fn(async () => { throw new Error('broken'); }),
      makeCanvas,
    });
    expect(result).toEqual({ ok: false, text: '这张图读不出来，请换一张。' });
    expect(makeCanvas).not.toHaveBeenCalled();
  });

  it('画布编码失败不静默退回原图，并释放解码结果', async () => {
    const close = vi.fn();
    const { canvas } = canvasWith(null);
    const result = await prepareCoachImage(inputFile(COACH_IMAGE_BYTES_MAX + 1), {
      decode: vi.fn(async () => decoded(800, 600, close)),
      makeCanvas: () => canvas,
    });
    expect(result).toEqual({ ok: false, text: '自动压缩失败，请换一张图片再试。' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('拿不到 2D 上下文时明确失败', async () => {
    const close = vi.fn();
    const { canvas } = canvasWith(undefined, null);
    const result = await prepareCoachImage(inputFile(COACH_IMAGE_BYTES_MAX + 1), {
      decode: vi.fn(async () => decoded(800, 600, close)),
      makeCanvas: () => canvas,
    });
    expect(result).toEqual({ ok: false, text: '这张图没法压缩，请换一张。' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('没有选中文件时不去解码', async () => {
    const decode = vi.fn();
    expect(await prepareCoachImage(null, { decode }))
      .toEqual({ ok: false, text: '没有选中图片。' });
    expect(decode).not.toHaveBeenCalled();
  });
});
