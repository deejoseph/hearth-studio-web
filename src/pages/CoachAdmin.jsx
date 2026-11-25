import { useState, useEffect, useCallback, useRef } from "react";
import "./Guestbook.css";

const AUTH_URL = "/api/v1/guestbook_admin_auth.php";
const APPS_URL = "/api/v1/coach_admin_apps.php";
const DECIDE_URL = "/api/v1/coach_admin_decide.php";

// 服务器在海外，链路会整条挂住；不超时就一直停在"提交中…"，看着像坏了
const NET_TIMEOUT_MS = 20000;

const FILTERS = [
  { key: "", label: "全部" },
  { key: "pending", label: "待审" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已驳回" },
];

const STATUS_TEXT = {
  pending: "待审",
  approved: "已通过",
  rejected: "已驳回",
};

function netError(err) {
  return err && err.name === "AbortError"
    ? "连接超时，服务器在海外，请稍后重试"
    : "网络错误，请稍后重试";
}

async function apiFetch(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function apiPost(url, payload) {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

/** 三个动作合成两个按钮：待审是"批准/驳回"，已通过是"撤销资格"，已驳回是"改为批准"。 */
function actionsFor(status) {
  if (status === "approved") {
    return [{ decision: "rejected", label: "撤销资格", danger: true }];
  }
  if (status === "rejected") {
    return [{ decision: "approved", label: "改为批准", danger: false }];
  }
  return [
    { decision: "approved", label: "批准", danger: false },
    { decision: "rejected", label: "驳回", danger: true },
  ];
}

/** counts 里没有"全部"这一项：那一栏是三个状态相加，别显示成 (0)。 */
function countFor(counts, key) {
  if (!counts) return null;
  if (key === "") {
    return (counts.pending || 0) + (counts.approved || 0) + (counts.rejected || 0);
  }
  return counts[key] ?? null;
}

function AppRow({ app, busy, onDecide }) {
  return (
    <div className="coa-card">
      <div className="coa-head">
        <span className={`coa-badge coa-badge-${app.status}`}>
          {STATUS_TEXT[app.status] || app.status}
        </span>
        <span className="coa-name">
          #{app.player_id} · {app.nickname || "（没有昵称）"}
        </span>
        <a className="coa-mail" href={`mailto:${app.email}`}>
          {app.email}
        </a>
        <span className="coa-date">
          注册 {formatDate(app.joined_at)}
          {app.decided_at ? ` · 答复于 ${formatDate(app.decided_at)}` : ""}
        </span>
      </div>
      <p className="coa-meta">
        邮箱{app.verified ? "已确认" : "未确认"}
        {" · "}等级 {app.rating}
        {" · "}
        {app.has_pref ? "填过「想找什么样的教练」" : "没填偏好"}
      </p>
      <p className="coa-intro">{app.intro}</p>
      <div className="coa-actions">
        {actionsFor(app.status).map((action) => (
          <button
            key={action.decision}
            type="button"
            className={action.danger ? "coa-btn coa-btn-danger" : "coa-btn"}
            disabled={busy}
            onClick={() => onDecide(app, action)}
          >
            {busy ? "提交中…" : action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CoachAdmin() {
  const [authState, setAuthState] = useState("loading");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [apps, setApps] = useState([]);
  const [counts, setCounts] = useState(null);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadedRef = useRef(false);

  const fetchApps = useCallback(async (status) => {
    setLoading(true);
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    try {
      const res = await apiFetch(`${APPS_URL}${query}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || "读取失败");
        if (res.status === 401) setAuthState("anon");
        return;
      }
      setApps(data.apps || []);
      setCounts(data.counts || null);
      setError("");
      loadedRef.current = true;
    } catch (err) {
      setError(netError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(AUTH_URL);
        const data = await res.json();
        if (data.authenticated) {
          setAdminName(data.name || "");
          setAuthState("authed");
          fetchApps("pending");
        } else {
          setAuthState("anon");
        }
      } catch (err) {
        setError(netError(err));
        setAuthState("anon");
      }
    })();
  }, [fetchApps]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoginBusy(true);
    try {
      const res = await apiPost(AUTH_URL, { action: "login", email: email.trim(), password });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
        return;
      }
      setAdminName(data.name || "");
      setPassword("");
      setAuthState("authed");
      fetchApps(filter);
    } catch (err) {
      setError(netError(err));
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiPost(AUTH_URL, { action: "logout" });
    } finally {
      setAuthState("anon");
      setApps([]);
      setCounts(null);
      loadedRef.current = false;
      setError("");
      setNotice("");
    }
  };

  const changeFilter = (next) => {
    setFilter(next);
    setNotice("");
    fetchApps(next);
  };

  const handleDecide = async (app, action) => {
    const verb = action.decision === "approved" ? "批准" : "驳回";
    // 撤销和普通驳回走的是同一个决定，但后果不同：撤销会让他当下就开不了课堂。
    const extra = app.status === "approved" ? "，他会立刻开不了课堂。" : "";
    if (!window.confirm(`${verb} ${app.nickname || app.email} 的教练申请？${extra}`)) return;

    setError("");
    setNotice("");
    setBusyId(app.player_id);
    try {
      const res = await apiPost(DECIDE_URL, { player_id: app.player_id, decision: action.decision });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || "这一步没生效");
        return;
      }
      setNotice(`${verb}了 #${app.player_id}，现在状态是 ${STATUS_TEXT[data.status] || data.status}。`);
      await fetchApps(filter);
    } catch (err) {
      setError(netError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="guestbook">
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          {/* 这一页不进导航，平时是直接输地址进来的 —— 所以"返回"回首页，
              旁边那两条是两个后台之间的互跳。 */}
          <a href="/" className="fh-nav-link fh-nav-back">← 返回首页</a>
          <a href="/coach-admin" className="fh-nav-link active">教练审核</a>
          <a href="/guestbook-admin" className="fh-nav-link">留言板管理</a>
        </div>
      </nav>

      <main className="gb-main">
        <div className="gb-hero">
          <span className="gb-hero-tag">COACH ADMIN</span>
          <h1>教练申请审核</h1>
          <p className="gb-hero-subtitle">
            批准之后这个人才能开课堂；撤销是立刻生效的。这里只看到申请写的那一段话。
          </p>
        </div>

        {authState === "loading" && (
          <div className="gb-empty">
            <span className="gb-empty-icon">⏳</span>
            <p>检查登录状态…</p>
          </div>
        )}

        {authState === "anon" && (
          <section className="gb-form-section">
            <h2 className="gb-section-title">管理员登录</h2>
            <p className="gba-hint">
              和留言板管理用的是同一个账号。同一 IP 连续 5 次失败会锁定 15 分钟。
            </p>
            <form className="gb-form" onSubmit={handleLogin}>
              <div className="gb-field">
                <label htmlFor="coa-email">管理员邮箱</label>
                <input
                  id="coa-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
              <div className="gb-field">
                <label htmlFor="coa-password">密码</label>
                <input
                  id="coa-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="gb-form-actions">
                <button type="submit" className="gb-submit" disabled={loginBusy}>
                  {loginBusy ? "登录中…" : "登录"}
                </button>
                {error && <span className="gb-error">{error}</span>}
              </div>
            </form>
          </section>
        )}

        {authState === "authed" && (
          <>
            <div className="gba-status">
              <span>已登录：{adminName || "管理员"}</span>
              <button type="button" className="gba-logout" onClick={handleLogout}>
                退出登录
              </button>
            </div>
            {notice && <p className="gb-success">{notice}</p>}
            {error && <p className="gb-error">{error}</p>}

            <div className="coa-filters">
              {FILTERS.map((item) => (
                <button
                  key={item.key || "all"}
                  type="button"
                  className={filter === item.key ? "coa-tab coa-tab-on" : "coa-tab"}
                  disabled={loading}
                  onClick={() => changeFilter(item.key)}
                >
                  {item.label}
                  {countFor(counts, item.key) !== null ? ` (${countFor(counts, item.key)})` : ""}
                </button>
              ))}
              <button type="button" className="gba-logout coa-refresh" onClick={() => fetchApps(filter)}>
                刷新
              </button>
            </div>

            {counts && (
              <p className="coa-summary">
                注册 {counts.players} 人，其中 {counts.verified} 人确认过邮箱；
                {counts.prefs} 人填过「想找什么样的教练」，{counts.approved} 人有开课堂的资格。
              </p>
            )}

            <section className="gb-messages">
              <h2 className="gb-section-title">
                {FILTERS.find((item) => item.key === filter)?.label}申请
                {apps.length > 0 && <span className="gb-count-badge">{apps.length}</span>}
              </h2>
              {loading ? (
                <div className="gb-empty">
                  <span className="gb-empty-icon">⏳</span>
                  <p>加载中…</p>
                </div>
              ) : apps.length === 0 ? (
                <div className="gb-empty">
                  <span className="gb-empty-icon">📭</span>
                  <p>{filter === "pending" ? "没有待审的申请。" : "这一类还没有记录。"}</p>
                </div>
              ) : (
                <div className="gb-list">
                  {apps.map((app) => (
                    <AppRow
                      key={app.player_id}
                      app={app}
                      busy={busyId === app.player_id}
                      onDecide={handleDecide}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="gb-footer">
        <div className="gb-footer-inner">
          <p className="gb-footer-copy">
            &copy; {new Date().getFullYear()} ichessgeek.com
          </p>
        </div>
      </footer>
    </div>
  );
}
