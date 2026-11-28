/**
 * 推荐教练名录与公开主页（排序见 game/coachMatch.js，公开字段见 game/coachProfile.js）。
 *
 * 名录是公开端点，未登录也能看；个性化顺序只用当前账号自己的偏好。卡片不再整块
 * 做成按钮：头像、主页、约课与投诉都是平级控件，避免嵌套交互元素，也避免误触。
 *
 * 所有用户文字都走 textContent。公开主页只接收后台批准发表的投诉字段，不渲染
 * 投诉人身份；联系由平台转信，公开展示不出现教练的私人邮箱。
 */

import { call } from '../net/auth.js';
import {
  COACH_PROFILE_TITLES,
  coachBadges,
  coachEnrollmentRows,
  coachPhotoUrl,
  coachProfileRows,
  coachProfileTags,
} from '../game/coachProfile.js';
import { matchReasons, recommendedCoaches } from '../game/coachMatch.js';
import { complaintSeverityLabel, publicComplaints } from '../game/coachMarketplace.js';
import { coachImageTrigger } from './coachLightbox.js';
import { setUserText, userText } from '../i18n.js';

const $ = (id) => document.getElementById(id);

function text(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value ?? '';
  return node;
}

function button(label, className, controls) {
  const node = text('button', className, label);
  node.type = 'button';
  if (controls) {
    node.setAttribute('aria-haspopup', 'dialog');
    node.setAttribute('aria-controls', controls);
  }
  return node;
}

/** 有图是灯箱按钮，没图/图坏了是昵称首字；两种形态都不会套进另一个按钮。 */
function avatarOf(coach, openImage, host = null, big = false) {
  const name = coach?.nickname ?? '';
  const pic = coach?.profile?.avatar ?? '';
  const className = `coach-avatar${big ? ' big' : ''}`;
  const initial = [...name][0] ?? '棋';
  const fallback = () => {
    if (host) {
      host.className = className;
      setUserText(host, initial);
      return host;
    }
    return setUserText(text('span', className, initial), initial);
  };
  // 主页的头像容器只负责定位；有图时样式落在按钮本身，避免两层头像样式嵌套。
  if (host) {
    host.className = '';
    host.removeAttribute('data-i18n-skip');
  }
  if (!pic) return fallback();

  const trigger = coachImageTrigger({
    src: coachPhotoUrl(coach.player_id, pic, big ? 320 : 96),
    fullSrc: coachPhotoUrl(coach.player_id, pic),
    alt: '教练头像',
    openImage,
    className,
    imageClassName: 'coach-avatar-image',
    onError: (node) => {
      if (host) {
        node.remove();
        host.className = className;
        host.textContent = initial;
      } else {
        node.replaceWith(fallback());
      }
    },
  });
  if (host) {
    host.replaceChildren(trigger);
    return trigger;
  }
  return trigger;
}

/** 一行“为什么把你排在这儿”：只说真对上的事，不替教练写广告。 */
function whyOf(item) {
  const reasons = matchReasons(item.match).join(' · ');
  if (reasons) return text('p', 'coach-why', `和你的偏好：${reasons}`);
  const tags = coachProfileTags(item.coach).join(' · ');
  return tags ? text('p', 'coach-why quiet', tags) : null;
}

/**
 * @param {{
 *   player(): object|null,
 *   pref(): object|null,
 *   openProfile(): void,
 *   openEnrollment(coach: object): void,
 *   openComplaint(coach: object): void,
 *   complaints: {isStudent(): boolean},
 *   canTeach(): boolean,
 *   openImage(src: string, alt: string): void,
 * }} deps
 * @returns {{refresh(): Promise<any>, openHome(playerId: number): Promise<void>}}
 */
export function mountCoachDirectory({
  player,
  pref,
  openProfile,
  openEnrollment,
  openComplaint,
  complaints,
  canTeach,
  openImage,
}) {
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
    homeEnrollment: $('coach-home-enrollment'),
    homeHonorsLabel: $('coach-home-honors-label'),
    homeHonors: $('coach-home-honors'),
    homeCertificatesLabel: $('coach-home-certificates-label'),
    homeCertificates: $('coach-home-certificates'),
    homeRows: $('coach-home-rows'),
    homePhotos: $('coach-home-photos'),
    homePublicComplaints: $('coach-home-public-complaints'),
    homeComplaintsLabel: $('coach-home-complaints-label'),
    homeComplaintsNote: $('coach-home-complaints-note'),
    homeComplaints: $('coach-home-complaints'),
    homeState: $('coach-home-state'),
    homeClose: $('coach-home-close-btn'),
    homeEdit: $('coach-home-edit-btn'),
    homeEnroll: $('coach-home-enroll-btn'),
    homeComplaint: $('coach-home-complaint-btn'),
  };

  let rows = [];
  let homeCoach = null;
  let homeRequest = 0;
  let listPending = null;
  const LIST_TTL = 120000;
  const HOME_TTL = 300000;
  let listCachedAt = 0;
  const homeCache = new Map();
  const homePending = new Map();

  function say(textline) {
    el.state.textContent = textline ?? '';
    el.state.hidden = !textline;
  }

  function cardOf(item) {
    const coach = item.coach;
    const card = text('article', 'coach-item');
    const nameId = `coach-card-name-${coach.player_id}`;
    card.setAttribute('aria-labelledby', nameId);

    const head = text('div', 'coach-main');
    head.append(avatarOf(coach, openImage));
    const body = text('div', 'coach-body');
    const name = text('h3', 'coach-name', coach.nickname ? '' : '教练');
    if (coach.nickname) name.append(userText(coach.nickname));
    name.id = nameId;
    if (player()?.id === coach.player_id) name.append(text('span', 'coach-self', '这是我'));
    body.append(name);

    const badges = coachBadges(coach);
    if (badges.length) body.append(text('p', 'coach-line', badges.join(' · ')));
    const tagline = String(coach?.profile?.tagline ?? '').trim();
    if (tagline) body.append(setUserText(text('p', 'coach-tagline'), tagline));
    const why = whyOf(item);
    if (why) body.append(why);
    for (const warning of item.match?.warnings ?? []) {
      body.append(text('p', 'coach-budget-warning', `预算提醒：${warning}`));
    }
    head.append(body);
    card.append(head);

    const actions = text('div', 'coach-item-actions');
    const home = button('看主页', 'btn btn-ghost btn-sm', 'coach-home-dialog');
    home.addEventListener('click', () => openHome(coach.player_id));
    const enroll = button('约课', 'btn btn-primary btn-sm', 'coach-enroll-dialog');
    enroll.addEventListener('click', () => openEnrollment(coach));
    actions.append(home, enroll);
    // 只有已确认邮箱的学员看得到投诉入口；教练与访客不渲染这颗按钮。
    if (complaints.isStudent()) {
      const complaint = button('投诉', 'btn btn-ghost btn-sm', 'coach-complaint-dialog');
      complaint.addEventListener('click', () => openComplaint(coach));
      actions.append(complaint);
    }
    card.append(actions);
    return card;
  }

  function render() {
    const scored = recommendedCoaches(rows, pref());
    el.list.replaceChildren(...scored.map(cardOf));
    el.list.hidden = scored.length === 0;
    el.empty.hidden = scored.length !== 0;
    el.refresh.hidden = scored.length === 0;
  }

  function load({ force = false } = {}) {
    if (!force && Date.now() - listCachedAt < LIST_TTL && listCachedAt > 0) {
      render();
      return Promise.resolve({ ok: true, coaches: rows, cached: true });
    }
    if (listPending) return listPending;
    listPending = call('chess_coach_directory.php?n=12', { method: 'GET' })
      .then((reply) => {
        if (!reply.ok) {
          rows = [];
          el.list.replaceChildren();
          el.list.hidden = true;
          el.empty.hidden = true;
          el.refresh.hidden = false;
          say(reply.message ?? '教练名录这会儿没取回来。');
          return reply;
        }
        rows = Array.isArray(reply.coaches) ? reply.coaches : [];
        homeCache.clear();
        listCachedAt = Date.now();
        say('');
        render();
        return reply;
      })
      .finally(() => { listPending = null; });
    return listPending;
  }

  /** 切换教练时先清空上一页，慢网络下也不能把 A 的资料当成 B 的资料。 */
  function resetHome() {
    homeCoach = null;
    avatarOf(null, openImage, el.homeAvatar, true);
    el.homeName.removeAttribute('data-i18n-skip');
    el.homeName.textContent = '教练主页';
    for (const node of [
      el.homeBadges, el.homeTagline, el.homeRows, el.homeEnrollment, el.homeHonors,
      el.homeCertificates, el.homePhotos, el.homeComplaints,
    ]) node.replaceChildren();
    for (const node of [
      el.homeBadges, el.homeTagline, el.homeRows, el.homeHonorsLabel, el.homeHonors,
      el.homeCertificatesLabel, el.homeCertificates, el.homePhotos,
      el.homePublicComplaints, el.homeComplaintsLabel, el.homeComplaintsNote,
      el.homeComplaints, el.homeEdit, el.homeComplaint,
    ]) node.hidden = true;
    el.homeEnroll.disabled = true;
    el.homeState.textContent = '正在取……';
    el.homeState.hidden = false;
  }

  /** 主页整页取一次：名录卡片只有摘要，荣誉、照片与公开投诉在完整行里。 */
  async function openHome(playerId) {
    const ticket = ++homeRequest;
    const id = Number(playerId);
    resetHome();
    say('');
    if (!el.home.open) el.home.showModal();

    const cached = homeCache.get(id);
    if (cached && Date.now() - cached.at < HOME_TTL) {
      paintHome(cached.coach);
      return;
    }
    if (homePending.has(id)) {
      const waiting = homePending.get(id);
      if (waiting) paintHome(waiting);
      return;
    }
    const fromList = rows.find((one) => Number(one.player_id) === id);
    if (fromList?.profile) paintHome(fromList);

    const pending = call(`chess_coach_get.php?c=${encodeURIComponent(playerId)}`, { method: 'GET' })
      .then((reply) => {
        const coach = reply.ok ? reply.coach ?? null : null;
        if (coach) {
          if (homeCache.size >= 50) homeCache.delete(homeCache.keys().next().value);
          homeCache.set(id, { coach, at: Date.now() });
        }
        return { reply, coach };
      })
      .finally(() => homePending.delete(id));
    homePending.set(id, fromList ?? null);
    const { reply, coach } = await pending;
    if (ticket !== homeRequest || !el.home.open) return;
    if (!reply.ok) {
      el.homeState.textContent = reply.message ?? '这一页没取回来。';
      return;
    }
    if (!coach) {
      el.homeState.textContent = '这位教练还没进名录。';
      return;
    }
    paintHome(coach);
  }

  function homePhoto(coach, name, at, certificate = false) {
    const imageClass = certificate ? 'coach-home-photo coach-home-certificate' : 'coach-home-photo';
    return coachImageTrigger({
      src: coachPhotoUrl(coach.player_id, name, certificate ? 960 : 640),
      fullSrc: coachPhotoUrl(coach.player_id, name),
      alt: certificate ? '教练证书图片' : '教练照片',
      openImage,
      className: 'coach-home-photo-trigger',
      imageClassName: imageClass,
    });
  }

  function paintPublicComplaints(coach) {
    const list = publicComplaints(coach);
    el.homeComplaints.replaceChildren(...list.map((one) => {
      const item = text('article', 'coach-public-complaint');
      const head = text('h3', 'coach-public-complaint-head');
      head.append(document.createTextNode(`平台已核实 · ${complaintSeverityLabel(one.severity)}`));
      const at = typeof one.published_at === 'string' ? one.published_at.slice(0, 10) : '';
      if (at) head.append(document.createTextNode(` · ${at}`));
      item.append(head, setUserText(text('p', 'coach-public-complaint-text'), one.public_text));
      return item;
    }));
    const empty = list.length === 0;
    el.homePublicComplaints.hidden = empty;
    el.homeComplaints.hidden = empty;
    el.homeComplaintsLabel.hidden = empty;
    el.homeComplaintsNote.hidden = empty;
  }

  function paintHome(coach) {
    homeCoach = coach;
    avatarOf(coach, openImage, el.homeAvatar, true);
    if (coach.nickname) setUserText(el.homeName, coach.nickname);
    else {
      el.homeName.removeAttribute('data-i18n-skip');
      el.homeName.textContent = '教练';
    }
    const badges = coachBadges(coach);
    el.homeBadges.textContent = badges.join(' · ');
    el.homeBadges.hidden = badges.length === 0;

    const tagline = String(coach.profile?.tagline ?? '').trim();
    setUserText(el.homeTagline, tagline);
    el.homeTagline.hidden = !tagline;

    const honors = String(coach.profile?.honors ?? '').trim();
    el.homeHonorsLabel.textContent = COACH_PROFILE_TITLES.honors;
    setUserText(el.homeHonors, honors);
    el.homeHonorsLabel.hidden = !honors;
    el.homeHonors.hidden = !honors;

    const certificates = coach.profile?.certificates ?? [];
    el.homeCertificates.replaceChildren(...certificates.map((name, at) => homePhoto(coach, name, at, true)));
    el.homeCertificatesLabel.hidden = certificates.length === 0;
    el.homeCertificates.hidden = certificates.length === 0;

    const rowsHome = coachProfileRows(coach);
    const userRowLabels = new Set([
      COACH_PROFILE_TITLES.goals_note,
      COACH_PROFILE_TITLES.custom_slots,
      COACH_PROFILE_TITLES.teaching_focus,
    ]);
    el.homeRows.replaceChildren(...rowsHome.map((row) => {
      const line = text('p', 'coach-home-row');
      const value = text('span', null, row.text);
      if (userRowLabels.has(row.label)) setUserText(value, row.text);
      line.append(text('span', 'coach-home-label', row.label), value);
      return line;
    }));
    el.homeRows.hidden = rowsHome.length === 0;

    el.homeEnrollment.replaceChildren(...coachEnrollmentRows(coach).map((row) => {
      const section = text('section', 'coach-enrollment-row');
      const value = text('p', 'coach-enrollment-text', row.text || '暂未填写，可在预约邮件中询问。');
      if (row.text && row.key !== 'hourly_rate_cny') setUserText(value, row.text);
      section.append(text('h3', 'coach-enrollment-title', row.label), value);
      return section;
    }));

    const photos = coach.profile?.photos ?? [];
    el.homePhotos.replaceChildren(...photos.map((name, at) => homePhoto(coach, name, at)));
    el.homePhotos.hidden = photos.length === 0;
    paintPublicComplaints(coach);

    const note = coach.has_profile ? '' : '这位教练还没填公开资料。';
    el.homeState.textContent = note;
    el.homeState.hidden = !note;
    el.homeEnroll.disabled = false;
    el.homeEdit.hidden = player()?.id !== coach.player_id || canTeach() !== true;
    el.homeComplaint.hidden = !complaints.isStudent();
  }

  el.refresh.addEventListener('click', () => load({ force: true }));
  el.homeClose.addEventListener('click', () => el.home.close());
  el.home.addEventListener('close', () => {
    homeRequest += 1;
    homeCoach = null;
  });
  el.homeEdit.addEventListener('click', () => {
    el.home.close();
    openProfile();
  });
  el.homeEnroll.addEventListener('click', () => {
    const coach = homeCoach;
    el.home.close();
    if (coach) openEnrollment(coach);
  });
  el.homeComplaint.addEventListener('click', () => {
    const coach = homeCoach;
    el.home.close();
    if (coach) openComplaint(coach);
  });

  // 首屏就取一次：公开名录，没登录也该看见有谁在教。
  load();

  return {
    refresh: (options) => load(options),
    rerender: render,
    openHome,
    /** 身份或教练资格变化时只重画门禁，不把公开名录再取一遍。 */
    syncGate: () => {
      render();
      if (homeCoach && el.home.open) paintHome(homeCoach);
    },
  };
}
