/** 教练图片共用的原生 <dialog> 灯箱；Esc 与关闭按钮都走浏览器原生焦点管理。 */

const $ = (id) => document.getElementById(id);

export function mountCoachLightbox() {
  const dialog = $('coach-lightbox-dialog');
  const image = $('coach-lightbox-image');
  const caption = $('coach-lightbox-caption');
  const close = $('coach-lightbox-close-btn');
  let returnFocus = null;

  function openImage(src, alt = '教练图片') {
    if (!src || !dialog || !image) return;
    returnFocus = document.activeElement;
    image.src = src;
    image.alt = alt;
    caption.textContent = alt;
    if (!dialog.open) dialog.showModal();
  }

  close.addEventListener('click', () => dialog.close());
  // 原生 dialog 的 Esc 会触发 cancel 并自动关闭，这里不拦截；点背景再给一个出口。
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    image.alt = '';
    caption.textContent = '';
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  });

  return { openImage };
}

/** 图片本身是可聚焦按钮；外层卡片按钮不再包它，避免嵌套交互元素。 */
export function coachImageTrigger({ src, alt, openImage, className = '', imageClassName = '', onError }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `coach-lightbox-trigger${className ? ` ${className}` : ''}`;
  button.setAttribute('aria-label', `查看大图：${alt}`);
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'coach-lightbox-dialog');

  const image = document.createElement('img');
  image.className = imageClassName;
  image.src = src;
  image.alt = alt;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.addEventListener('error', () => {
    if (onError) onError(button, image);
    else button.remove();
  });
  button.addEventListener('click', () => openImage(src, alt));
  button.append(image);
  return button;
}
