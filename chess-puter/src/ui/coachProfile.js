/**
 * 教练自己那份资料的编辑面板（字段与上限见 game/coachProfile.js）。
 *
 * 只做四件事：按选项表生成控件、打开时取一次服务端的那份摆回去、保存前本地
 * 拦一道、把照片的上传/移除接上。
 *
 * 🔴 保存是"整份覆盖"：每次把表单里所有字段一起发过去，缺的字段由服务端存成空。
 * 这么做是因为"没带这个 key"和"带了空串"在界面上是两件事，而在库里应该是一件事 ——
 * 局部更新要区分这两者，早晚会出"清了又回来"那种鬼故事。
 *
 * 照片的上传/移除不等【保存】：那两条各自是一次写（chess_coach_photo_save.php /
 * 一次整份 profile_save），写完拿服务端回的那份重摆。所以人按了【移除】就已经
 * 真移除了，不用记着再按一次保存；代价是移除时会把当前文本框里的内容一起存下去。
 *
 * 谁能打开这里在服务器判（chess_player_can_teach）。这里的 disabled 只是少让人
 * 点一次错 —— 那个入口按钮只对批准的教练显示，见 main.js 里的 coachApp 那一态。
 */

import { call, upload } from '../net/auth.js';
import { prepareCoachImage } from '../net/coachImage.js';
import { COACH_OPTIONS } from '../game/coachPref.js';
import {
  COACH_CERTIFICATES_MAX,
  COACH_HONORS_MAX,
  COACH_IMAGE_BYTES_MAX,
  COACH_PHOTOS_MAX,
  COACH_PROFILE_GROUPS,
  COACH_PROFILE_RULES,
  COACH_PROFILE_TITLES,
  COACH_TAGLINE_MAX,
  COACH_TITLES,
  coachPhotoUrl,
  validateCoachProfile,
} from '../game/coachProfile.js';

const $ = (id) => document.getElementById(id);

/** 会亮红框的那些栏：四组多选 + 五个自由填写的 + 三类图片。 */
const SECTIONS = [...COACH_PROFILE_GROUPS, 'title', 'elo', 'years', 'tagline', 'honors', 'language', 'timezone', 'avatar', 'photos', 'certificates'];

/** 这四处用 chips 多选，其余（语言/时区）用 select —— 时区九项，摊开太长。 */
const MULTI = COACH_PROFILE_GROUPS;

/** 单选项（select）：[元素 id, 选项表, 那句"不填"的说法, 标题取自哪一栏]。 */
const SELECTS = [
  ['cp-title', COACH_TITLES, '没有称号就空着', 'title'],
  ['cp-language', COACH_OPTIONS.language, '都行就选"中英都行"', 'language'],
  ['cp-timezone', COACH_OPTIONS.timezone, '不填按你账号里那个时区', 'timezone'],
];

function choiceInput(group, [key, label]) {
  const wrap = document.createElement('label');
  wrap.className = 'pref-choice';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.name = `cp-${group}`;
  box.value = key;

  const text = document.createElement('span');
  text.textContent = label;

  wrap.append(box, text);
  return wrap;
}

/** 一组多选 → chips。教练那一侧叫 levels，选项表在学员那一侧叫 level。 */
function buildChoices(container, group) {
  const options = COACH_OPTIONS[prefSide(group)];
  container.append(...options.map((option) => choiceInput(group, option)));
}

function prefSide(group) {
  return group === 'levels' ? 'level' : group;
}

function buildSelect(container, id, options, blankText, group) {
  const select = document.createElement('select');
  select.id = id;
  select.name = id;
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = blankText;
  select.append(blank, ...options.map(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    return opt;
  }));
  container.append(select);
  // 标题也从 COACH_PROFILE_TITLES 取：报错时要点名这一栏，用的必须是同一句话。
  const legend = document.getElementById(`${id}-legend`);
  if (legend) legend.textContent = COACH_PROFILE_TITLES[group];
  return select;
}

function chosen(group) {
  return [...document.querySelectorAll(`input[name="cp-${group}"]:checked`)].map((i) => i.value);
}

function setChosen(group, keys) {
  const wanted = new Set(Array.isArray(keys) ? keys : String(keys ?? '').split(',').filter(Boolean));
  for (const box of document.querySelectorAll(`input[name="cp-${group}"]`)) {
    box.checked = wanted.has(box.value);
  }
}

/** legend 的措辞和报错时点名用的是同一句话（COACH_PROFILE_TITLES），不另印一份。 */
function legendOf(group) {
  const name = document.createElement('span');
  name.className = 'pref-legend-text';
  name.textContent = COACH_PROFILE_TITLES[group];
  return name;
}

function hintOf(group) {
  const { max } = COACH_PROFILE_RULES[group];
  const hint = document.createElement('span');
  hint.className = 'pref-hint';
  // 上限就是这一组全部选项时不用报数字（"最多 4 项"面对四个选项是废话）
  hint.textContent = max >= COACH_OPTIONS[prefSide(group)].length ? '可不填' : `可不填，最多 ${max} 项`;
  return hint;
}

function counterOf(el, counter, max) {
  const n = [...el.value].length;
  counter.textContent = `${n} / ${max}`;
  counter.classList.toggle('over', n > max);
}

/**
 * @param {{
 *   showToast(text: string): void,
 *   player(): object|null,
 *   openAccount(which?: string): void,
 *   canTeach(): boolean,          // 教练申请那一态（approved / 管理员）
 *   onChanged(profile: object|null): void,  // 名录要重画，主页要跟着变
 * }} deps
 * @returns {{open(): Promise<void>, refresh(): Promise<any>, syncGate(): void, hasProfile(): boolean}}
 */
export function mountCoachProfile({ showToast, player, openAccount, canTeach, onChanged }) {
  // 控件先生成，再取引用 —— 和 ui/coachPref.js 同一个理由：反过来做的话
  // 那些 select 会是 null，而"打开面板就报错"只在真浏览器里看得见。
  for (const group of MULTI) {
    buildChoices($(`cp-${group}-choices`), group);
    $(`cp-${group}-legend`).replaceChildren(legendOf(group), hintOf(group));
  }
  for (const [id, options, blankText, group] of SELECTS) {
    buildSelect($(`${id}-box`), id, options, blankText, group);
  }
  // 自由填写那几栏的标题同样只有一处出处（COACH_PROFILE_TITLES）。
  for (const key of ['elo', 'years', 'tagline', 'honors', 'avatar', 'photos', 'certificates']) {
    const legend = $(`cp-${key}-legend`);
    if (legend) legend.textContent = COACH_PROFILE_TITLES[key];
  }

  const el = {
    trigger: $('coach-profile-btn'),
    dialog: $('coach-profile-dialog'),
    error: $('coach-profile-error'),
    title: $('cp-title'),
    elo: $('cp-elo'),
    years: $('cp-years'),
    tagline: $('cp-tagline'),
    taglineCount: $('cp-tagline-count'),
    honors: $('cp-honors'),
    honorsCount: $('cp-honors-count'),
    language: $('cp-language'),
    timezone: $('cp-timezone'),
    avatarBox: $('cp-avatar-box'),
    avatarFile: $('cp-avatar-file'),
    photoBox: $('cp-photos-box'),
    photoFile: $('cp-photo-file'),
    photoAdd: $('cp-photo-add'),
    photoHint: $('cp-photo-hint'),
    certificateBox: $('cp-certificates-box'),
    certificateFile: $('cp-certificate-file'),
    certificateAdd: $('cp-certificate-add'),
    certificateHint: $('cp-certificate-hint'),
    saveBtn: $('coach-profile-save-btn'),
    closeBtn: $('coach-profile-close-btn'),
  };

  /**
   * 服务端那份资料（null = 没取回来）。三列图片只从这里读，DOM 里不存名字。
   * hasFilled 用后端回的 filled：profile 永远是完整形状（没填也是一堆空值），
   * 拿它判"填没填过"会让按钮永远说"改"。
   */
  let profile = null;
  let hasFilled = false;
  let busy = false;

  function showError(text, field) {
    el.error.textContent = text;
    el.error.hidden = false;
    for (const section of SECTIONS) {
      $(`cp-${section}-group`)?.classList.toggle('invalid', section === field);
    }
    if (field) ($(`cp-${field}-box`) ?? $(`cp-${field}-group`))?.scrollIntoView({ block: 'nearest' });
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
    for (const section of SECTIONS) {
      $(`cp-${section}-group`)?.classList.remove('invalid');
    }
  }

  function paintCounters() {
    counterOf(el.tagline, el.taglineCount, COACH_TAGLINE_MAX);
    counterOf(el.honors, el.honorsCount, COACH_HONORS_MAX);
  }

  /** 头像、照片和证书那一坨。达到上限就把对应的添加按钮收掉。 */
  function paintPhotos() {
    const avatar = profile?.avatar ?? '';
    const photos = profile?.photos ?? [];
    const certificates = profile?.certificates ?? [];
    const who = player();
    const id = who?.id ?? '';

    el.avatarBox.replaceChildren();
    if (avatar) {
      el.avatarBox.append(image(el.avatarBox, coachPhotoUrl(id, avatar), '教练头像'), removeButton('avatar', null));
    } else {
      const none = document.createElement('span');
      none.className = 'coach-photo-empty';
      none.textContent = '还没有头像';
      el.avatarBox.append(none);
    }

    paintImageList(el.photoBox, photos, 'photos', '教练照片', '还没有照片');
    paintImageList(el.certificateBox, certificates, 'certificates', '证书图片', '还没有证书图片');
    el.photoAdd.hidden = photos.length >= COACH_PHOTOS_MAX;
    el.photoHint.textContent = photos.length >= COACH_PHOTOS_MAX
      ? `照片最多 ${COACH_PHOTOS_MAX} 张。要换先移除一张。`
      : `JPG / PNG / WebP，${COACH_PHOTOS_MAX} 张以内，每张两兆以内。`;
    el.certificateAdd.hidden = certificates.length >= COACH_CERTIFICATES_MAX;
    el.certificateHint.textContent = certificates.length >= COACH_CERTIFICATES_MAX
      ? `证书图片最多 ${COACH_CERTIFICATES_MAX} 张。要换先移除一张。`
      : `会公开在主页，${COACH_CERTIFICATES_MAX} 张以内，每张两兆以内。`;
  }

  function paintImageList(box, names, kind, alt, emptyText) {
    const id = player()?.id ?? '';
    box.replaceChildren();
    for (const name of names) {
      const cell = document.createElement('div');
      cell.className = 'coach-photo-cell';
      const fit = kind === 'certificates' ? 'coach-certificate-photo' : '';
      cell.append(image(cell, coachPhotoUrl(id, name), alt, fit), removeButton(kind, name));
      box.append(cell);
    }
    if (!names.length) {
      const none = document.createElement('span');
      none.className = 'coach-photo-empty';
      none.textContent = emptyText;
      box.append(none);
    }
  }

  function image(box, src, alt, fit = '') {
    const img = document.createElement('img');
    img.className = fit ? `coach-photo ${fit}` : 'coach-photo';
    img.src = src;
    img.alt = alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    // 图挂了（文件被删、网络断了）就把整个格子收掉：一个碎图标占在那儿，
    // 读起来像是资料本身坏了。
    img.addEventListener('error', () => img.closest('.coach-photo-cell, .coach-avatar-box')?.classList.add('broken'));
    box.append(img);
    return img;
  }

  function removeButton(kind, name) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost coach-photo-remove';
    btn.textContent = kind === 'avatar' ? '去掉头像' : '移除';
    btn.addEventListener('click', () => removeImage(kind, name));
    return btn;
  }

  function formState() {
    return {
      title: el.title.value,
      elo: el.elo.value,
      years: el.years.value,
      tagline: el.tagline.value,
      honors: el.honors.value,
      language: el.language.value,
      timezone: el.timezone.value,
      avatar: profile?.avatar ?? '',
      photos: profile?.photos ?? [],
      certificates: profile?.certificates ?? [],
      ...Object.fromEntries(MULTI.map((group) => [group, chosen(group)])),
    };
  }

  /** 面板摆成 profile 的样子（没填过就全空）。 */
  function fill() {
    const one = profile ?? {};
    el.title.value = one.title ?? '';
    el.elo.value = one.elo ?? '';
    el.years.value = one.years ?? '';
    el.tagline.value = one.tagline ?? '';
    el.honors.value = one.honors ?? '';
    el.language.value = one.language ?? '';
    el.timezone.value = one.timezone ?? '';
    for (const group of MULTI) setChosen(group, one[group]);
    paintCounters();
    paintPhotos();
  }

  function paintTrigger() {
    el.trigger.hidden = !(player() && canTeach());
    // 那句"填/改"挂在按钮里的 span 上（和偏好那颗同一个写法），不占一个 id。
    el.trigger.querySelector('.coach-profile-btn-label').textContent
      = hasFilled ? '改我的教练资料' : '填我的教练资料';
  }

  /** 服务端那份。没取到就把表单摆成空的，【保存】照旧能用（不拿一个没读到的值拦人）。 */
  async function load({ quiet = false } = {}) {
    if (!player()) {
      profile = null;
      hasFilled = false;
      paintTrigger();
      return { ok: false };
    }
    const reply = await call('chess_coach_profile_get.php', { method: 'GET' });
    if (!reply.ok) {
      if (!quiet) showError(reply.message ?? '这份资料没取回来，请再试一次。', null);
      return { ok: false, text: reply.message };
    }
    profile = reply.profile ?? null;
    hasFilled = reply.filled === true;
    paintTrigger();
    paintPhotos();
    return { ok: true, listed: reply.listed === true };
  }

  /**
   * 一次整份写。overrides 用来在"移除照片"那一路改掉图片列，
   * 其余调用都发当场读到的表单。
   */
  async function save(overrides) {
    if (busy) return;
    const checked = validateCoachProfile({ ...formState(), ...overrides });
    if (!checked.ok) {
      showError(checked.text, checked.field);
      return;
    }
    clearError();
    busy = true;
    el.saveBtn.disabled = true;
    const idle = el.saveBtn.textContent;
    el.saveBtn.textContent = '保存中…';

    const reply = await call('chess_coach_profile_save.php', { body: checked.payload });
    if (reply.ok) {
      // 用服务端回的那一份重摆：多选被后端按白名单顺序排过，照片名也是后端起的，
      // 留下发出去的形状迟早和库里不一样。
      profile = reply.profile ?? null;
      hasFilled = reply.filled === true;
      fill();
      paintTrigger();
      onChanged(profile);
      showToast('资料存好了，名录上就是这些。');
    } else {
      showError(reply.message ?? '没能存上，请再试一次。', reply.field ?? null);
    }

    busy = false;
    el.saveBtn.disabled = false;
    el.saveBtn.textContent = idle;
  }

  async function removeImage(kind, name) {
    if (kind === 'avatar') return save({ avatar: '' });
    const field = kind === 'certificates' ? 'certificates' : 'photos';
    return save({ [field]: (profile?.[field] ?? []).filter((one) => one !== name) });
  }

  async function sendImage(kind, file) {
    if (!file || busy) return;
    clearError();
    busy = true;
    const label = kind === 'certificates' ? '证书图片' : kind === 'avatar' ? '头像' : '照片';
    showToast(`${label}处理中…`);

    try {
      const prepared = await prepareCoachImage(file);
      if (!prepared.ok) {
        showError(prepared.text, kind);
        return;
      }
      if (prepared.file.size > COACH_IMAGE_BYTES_MAX) {
        showError(`这张图有 ${(prepared.file.size / 1048576).toFixed(1)} 兆，请压到 2 兆以内。`, kind);
        return;
      }
      showToast(prepared.compressed ? `${label}已自动压缩，正在上传…` : `${label}上传中…`);

      const form = new FormData();
      form.append('kind', kind);
      form.append('file', prepared.file);
      const reply = await upload('chess_coach_photo_save.php', form);

      if (reply.ok) {
        profile = reply.profile ?? profile;
        hasFilled = reply.filled === true;
        fill();
        paintTrigger();
        onChanged(profile);
        showToast(kind === 'avatar' ? '头像换好了。' : kind === 'certificates' ? '证书图片传上去了。' : '照片传上去了。');
      } else {
        showError(reply.message ?? '这张图没传上去，请再试一次。', reply.field ?? kind);
      }
    } finally {
      busy = false;
    }
  }

  async function open() {
    if (!player()) {
      openAccount('signin');
      showToast('先登录再填这份资料 —— 它是挂在账号上的。');
      return;
    }
    if (!canTeach()) {
      showToast('名录上的位置是给批过的教练留的 —— 先在课堂那一栏提交申请。');
      return;
    }
    clearError();
    el.saveBtn.disabled = true;
    el.dialog.showModal();
    const got = await load({ quiet: true });
    fill();
    el.saveBtn.disabled = false;
    if (!got.ok && profile === null) {
      showError(got.text ?? '这份资料没取回来，可以先填再保存。', null);
      el.closeBtn.focus();
      return;
    }
    el.title.focus();
  }

  el.trigger.addEventListener('click', open);
  el.saveBtn.addEventListener('click', () => save());
  el.closeBtn.addEventListener('click', () => el.dialog.close());
  el.avatarFile.addEventListener('change', () => {
    const file = el.avatarFile.files?.[0];
    el.avatarFile.value = '';
    sendImage('avatar', file);
  });
  el.photoFile.addEventListener('change', () => {
    const file = el.photoFile.files?.[0];
    el.photoFile.value = '';
    sendImage('photos', file);
  });
  el.certificateFile.addEventListener('change', () => {
    const file = el.certificateFile.files?.[0];
    el.certificateFile.value = '';
    sendImage('certificates', file);
  });
  el.tagline.addEventListener('input', () => {
    paintCounters();
    if (!el.error.hidden) clearError();
  });
  el.honors.addEventListener('input', () => {
    paintCounters();
    if (!el.error.hidden) clearError();
  });
  for (const group of MULTI) {
    $(`cp-${group}-choices`).addEventListener('change', () => {
      if (!el.error.hidden) clearError();
    });
  }
  for (const id of ['cp-title', 'cp-language', 'cp-timezone']) {
    $(id).addEventListener('change', () => {
      if (!el.error.hidden) clearError();
    });
  }
  for (const id of ['cp-elo', 'cp-years']) {
    $(id).addEventListener('input', () => {
      if (!el.error.hidden) clearError();
    });
  }

  return {
    open,
    /** 身份变了就问一次：这张表是挂在账号上的，不能留着上一个人的照片。 */
    refresh: () => load({ quiet: true }),
    /**
     * 教练那一态（申请通过 / 管理员）变了之后重画入口。没登录就把资料丢掉 ——
     * 否则退出登录后名录上还会亮着"改我的教练资料"。
     */
    syncGate: () => {
      if (!player()) {
        profile = null;
        hasFilled = false;
      }
      paintTrigger();
    },
  };
}
