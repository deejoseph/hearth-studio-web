/**
 * 推荐教练那一块的名录与主页（见 game/coachMatch.js 的排法、game/coachProfile.js 的字段）。
 *
 * 只做三件事：取一次名录、按这个人填的偏好排序、点开看某一位的主页。
 *
 * 名录是公开端点（chess_coach_directory.php），不登录也取，所以未登录的人也能
 * 看见有谁在教；排序用的是他自己填的偏好，没填就按"资料全不全"排（见 rankCoaches）。
 *
 * 🔴 这里不出现邮箱、也不出现申请时写给管理员看的那段介绍：名录行里就没有这两样
 * （coach_directory_entry），而联系走的是站内课堂。界面上那句承诺要一直成立。
 *
 * 渲染全部走 textContent：教练名字、简介、荣誉都是人写的字符串，
 * 拼 innerHTML 等于把主页变成别人的脚本。图片地址是服务端起的名字，见 coachPhotoUrl。
 */

import { call } from '../net/auth.js';
import {
  COACH_PROFILE_TITLES,
  coachBadges,
  coachPhotoUrl,
  coachProfileRows,
  coachProfileTags,
} from '../game/coachProfile.js';
import { matchReasons, rankCoaches } from '../game/coachMatch.js';

const $ = (id) => document.getElementById(id);

function text(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value ?? '';
  return node;
}

/** 头像：有图放图，没图用昵称第一个字占位（一个灰圈比一个碎图标好读）。 */
function avatarOf(coach, wrap = text('span', 'coach-avatar')) {
  wrap.replaceChildren();
  const name = coach?.nickname ?? '';
  const pic = coach?.profile?.avatar ?? '';
  if (pic) {
    const img = document.createElement('img');
    img.src = coachPhotoUrl(coach.player_id, pic);
    img.alt = `${name} 的头像`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      img.remove();
      wrap.textContent = [...name][0] ?? '棋';
    });
    wrap.append(img);
    return wrap;
  }
  wrap.textContent = [...name][0] ?? '棋';
  return wrap;
}

/** 一行"为什么把你排在这儿"：只说真对上的事，不替教练写广告。 */
function whyOf(item) {
  const reasons = matchReasons(item.match).join(' · ');
  // <p> 塞进 <button> 是不合法的嵌套，这里整张卡片就是一个按钮，一律用 span。
  if (reasons) return text('span', 'coach-why', `和你的偏好：${reasons}`);
  const tags = coachProfileTags(item.coach).join(' · ');
  // 没填偏好、或者一样都没对上，就退而说这位教练自己标的那两样
  return tags ? text('span', 'coach-why quiet', tags) : null;
}

/**
 * @param {{
 *   player(): object|null,
 *   pref(): object|null,          // 这个人填的教练偏好（game/coachPref.js 的形状）
 *   openProfile(): void,          // 批准教练的"填我的资料"入口
 * }} deps
 * @returns {{refresh(): Promise<any>, openHome(playerId: number): Promise<void>}}
 */
export function mountCoachDirectory({ player, pref, openProfile }) {
  const el = {
    list: $('coach-list'),
    empty: $('coach-empty'),
    state: $('coach-state'),
    refresh: $('coach-refresh-btn'),
    home: $('coach-home-dialog'),
    homeAvatar: $('coach-home-avatar'),
    homeName: $('coach-home-name'),
    homeBadges: $('coach-home-badges'),
    homeTagline: $('coach-home-tagline'),
    homeHonorsLabel: $('coach-home-honors-label'),
    homeHonors: $('coach-home-honors'),
    homeCertificatesLabel: $('coach-home-certificates-label'),
    homeCertificates: $('coach-home-certificates'),
    homeRows: $('coach-home-rows'),
    homePhotos: $('coach-home-photos'),
    homeState: $('coach-home-state'),
    homeClose: $('coach-home-close-btn'),
    homeEdit: $('coach-home-edit-btn'),
  };

  let rows = [];
  let busy = false;

  function say(textline) {
    el.state.textContent = textline ?? '';
    el.state.hidden = !textline;
  }

  function cardOf(item) {
    const coach = item.coach;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'coach-item';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-controls', 'coach-home-dialog');

    const head = text('span', 'coach-main');
    head.append(avatarOf(coach));
    const body = text('span', 'coach-body');
    const name = text('span', 'coach-name');
    name.append(text('span', null, coach.nickname || '教练'));
    if (player()?.id === coach.player_id) {
      name.append(text('span', 'coach-self', '这是我'));
    }
    body.append(name);
    // 徽章和简介分两行，不像以前那样用"·"接成一串：这一列只有 236 像素宽，
    // 接成一串时夹在中间截断的正好是最要紧的等级分数字。
    const badges = coachBadges(coach);
    if (badges.length) body.append(text('span', 'coach-line', badges.join(' · ')));
    const tagline = String(coach?.profile?.tagline ?? '').trim();
    if (tagline) body.append(text('span', 'coach-tagline', tagline));
    const why = whyOf(item);
    if (why) body.append(why);
    // "看主页"独占最后一行，不跟正文抢横向空间（整张卡本来就能点，这句只是给个提示）。
    body.append(text('span', 'coach-go', '看主页 ›'));
    head.append(body);
    btn.append(head);
    btn.addEventListener('click', () => openHome(coach.player_id));
    return btn;
  }

  function render() {
    const scored = rankCoaches(rows, pref());
    el.list.replaceChildren(...scored.map(cardOf));
    el.list.hidden = scored.length === 0;
    el.empty.hidden = scored.length !== 0;
    el.refresh.hidden = scored.length === 0;
  }

  async function load() {
    const reply = await call('chess_coach_directory.php?n=12', { method: 'GET' });
    if (!reply.ok) {
      rows = [];
      el.list.replaceChildren();
      el.list.hidden = true;
      // 取不到不等于"没人入驻"：那句话要分开说，否则人以为整站空了。
      el.empty.hidden = true;
      el.refresh.hidden = false;
      say(reply.message ?? '教练名录这会儿没取回来。');
      return reply;
    }
    rows = Array.isArray(reply.coaches) ? reply.coaches : [];
    say('');
    render();
    return reply;
  }

  /** 主页整页取一次：名录那一行只有卡片要的东西，荣誉和照片列表在完整行里才有。 */
  async function openHome(playerId) {
    if (busy) return;
    busy = true;
    say('');
    el.homeState.textContent = '正在取……';
    el.homeState.hidden = false;
    el.home.showModal();

    const reply = await call(`chess_coach_get.php?c=${encodeURIComponent(playerId)}`, { method: 'GET' });
    if (!reply.ok) {
      el.homeState.textContent = reply.message ?? '这一页没取回来。';
      busy = false;
      return;
    }
    const coach = reply.coach ?? null;
    if (!coach) {
      el.homeState.textContent = '这位教练还没进名录。';
      busy = false;
      return;
    }
    paintHome(coach);
    busy = false;
  }

  function paintHome(coach) {
    avatarOf(coach, el.homeAvatar);
    el.homeName.textContent = coach.nickname || '教练';
    const badges = coachBadges(coach);
    el.homeBadges.textContent = badges.join(' · ');
    el.homeBadges.hidden = badges.length === 0;

    const tagline = String(coach.profile?.tagline ?? '').trim();
    el.homeTagline.textContent = tagline;
    el.homeTagline.hidden = !tagline;

    const honors = String(coach.profile?.honors ?? '').trim();
    el.homeHonorsLabel.textContent = COACH_PROFILE_TITLES.honors;
    el.homeHonors.textContent = honors;
    el.homeHonorsLabel.hidden = !honors;
    el.homeHonors.hidden = !honors;

    const certificates = coach.profile?.certificates ?? [];
    el.homeCertificatesLabel.textContent = COACH_PROFILE_TITLES.certificates;
    el.homeCertificates.replaceChildren(...certificates.map((name, at) => {
      const img = document.createElement('img');
      img.className = 'coach-home-photo coach-home-certificate';
      img.src = coachPhotoUrl(coach.player_id, name);
      img.alt = `${el.homeName.textContent} 的证书图片 ${at + 1}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.remove());
      return img;
    }));
    el.homeCertificatesLabel.hidden = certificates.length === 0;
    el.homeCertificates.hidden = certificates.length === 0;

    const rowsHome = coachProfileRows(coach);
    el.homeRows.replaceChildren(...rowsHome.map((row) => {
      const line = text('p', 'coach-home-row');
      line.append(text('span', 'coach-home-label', row.label), text('span', null, row.text));
      return line;
    }));
    el.homeRows.hidden = rowsHome.length === 0;

    const photos = coach.profile?.photos ?? [];
    el.homePhotos.replaceChildren(...photos.map((name, at) => {
      const img = document.createElement('img');
      img.className = 'coach-home-photo';
      img.src = coachPhotoUrl(coach.player_id, name);
      img.alt = `${el.homeName.textContent} 的照片 ${at + 1}`;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => img.remove());
      return img;
    }));
    el.homePhotos.hidden = photos.length === 0;

    const note = coach.has_profile ? '' : '这位教练还没填公开资料。';
    el.homeState.textContent = note;
    el.homeState.hidden = !note;
    // 只有本人会看到【改我的资料】：别人点进去只会换来一句 teacher_only。
    el.homeEdit.hidden = player()?.id !== coach.player_id;
  }

  el.refresh.addEventListener('click', load);
  el.homeClose.addEventListener('click', () => el.home.close());
  el.homeEdit.addEventListener('click', () => {
    el.home.close();
    openProfile();
  });

  /** 首屏就取一次：名录是公开数据，没登录也该看见有谁在教。 */
  load();

  return { refresh: load, openHome };
}
