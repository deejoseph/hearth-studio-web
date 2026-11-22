import { useState, useEffect, useCallback, useRef } from "react";
import "./Guestbook.css";

const AUTH_URL = "/api/v1/guestbook_admin_auth.php";
const MSG_URL = "/api/v1/guestbook.php?per_page=50";
const REPLY_URL = "/api/v1/guestbook_reply.php";
const REPLY_DELETE_URL = "/api/v1/guestbook_reply_delete.php";
const PASSWORD_URL = "/api/v1/guestbook_admin_password.php";

// 服务器在海外，链路会整条挂住；不超时就一直停在"提交中…"，看着像坏了
const NET_TIMEOUT_MS = 20000;

async function apiPost(url, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function netError(err) {
  return err && err.name === "AbortError"
    ? "连接超时，服务器在海外，请稍后重试"
    : "网络错误，请稍后重试";
}

function ReplyList({ replies, onDelete, busyReplyId }) {
  if (!replies || replies.length === 0) return null;
  return (
    <div className="gb-replies">
      {replies.map((reply) => (
        <div key={reply.id} className="gb-reply">
          <div className="gb-reply-head">
            <span className="gb-reply-badge">回复</span>
            <span className="gb-reply-name">{reply.author}</span>
            <span className="gb-reply-date">{formatDate(reply.timestamp)}</span>
            {onDelete && (
              <button
                type="button"
                className="gba-reply-delete"
                disabled={busyReplyId === reply.id}
                onClick={() => onDelete(reply)}
              >
                {busyReplyId === reply.id ? "删除中…" : "删除"}
              </button>
            )}
          </div>
          <p className="gb-reply-content">{reply.content}</p>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GuestbookAdmin() {
  const [authState, setAuthState] = useState("loading");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [busyReplyId, setBusyReplyId] = useState(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadedRef = useRef(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
    try {
      const res = await fetch(MSG_URL, { signal: ctrl.signal });
      const data = await res.json();
      setMessages(data.messages || []);
      setTotal(data.total || 0);
      loadedRef.current = true;
    } catch (err) {
      setError(netError(err));
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 留言列表是公开数据，不等登录结果，和会话检查并行发
    fetchMessages();
    (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
      try {
        const res = await fetch(AUTH_URL, { signal: ctrl.signal });
        const data = await res.json();
        if (data.authenticated) {
          setAdminName(data.name || "");
          setAuthState("authed");
        } else {
          setAuthState("anon");
        }
      } catch (err) {
        setError(netError(err));
        setAuthState("anon");
      } finally {
        clearTimeout(timer);
      }
    })();
  }, [fetchMessages]);

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
      if (!loadedRef.current) fetchMessages();
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
      setMessages([]);
      loadedRef.current = false;
      setDrafts({});
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setNotice("");
    }
  };

  const handleReply = async (messageId) => {
    const content = (drafts[messageId] || "").trim();
    if (!content) return;

    setError("");
    setNotice("");
    setBusyId(messageId);
    try {
      const res = await apiPost(REPLY_URL, { message_id: messageId, content });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "回复失败");
        return;
      }
      setDrafts((prev) => ({ ...prev, [messageId]: "" }));
      setNotice(`已回复 #${messageId}`);
      await fetchMessages();
    } catch (err) {
      setError(netError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteReply = async (reply) => {
    const preview = (reply.content || "").slice(0, 60);
    if (!window.confirm(`删除这条回复？删掉后无法找回。\n\n「${preview}」`)) return;

    setError("");
    setNotice("");
    setBusyReplyId(reply.id);
    try {
      const res = await apiPost(REPLY_DELETE_URL, { reply_id: reply.id });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "删除失败");
        return;
      }
      setNotice(`已删除回复 #${reply.id}`);
      await fetchMessages();
    } catch (err) {
      setError(netError(err));
    } finally {
      setBusyReplyId(null);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (newPassword.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    setPwdBusy(true);
    try {
      const res = await apiPost(PASSWORD_URL, { old_password: oldPassword, new_password: newPassword });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "修改失败");
        return;
      }
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("密码已更新，下次登录请用新密码");
    } catch (err) {
      setError(netError(err));
    } finally {
      setPwdBusy(false);
    }
  };

  return (
    <div className="guestbook">
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          <a href="/guestbook" className="fh-nav-link fh-nav-back">← 返回留言板</a>
          <a href="/guestbook-admin" className="fh-nav-link active">管理</a>
        </div>
      </nav>

      <main className="gb-main">
        <div className="gb-hero">
          <span className="gb-hero-tag">GUESTBOOK ADMIN</span>
          <h1>留言板管理</h1>
          <p className="gb-hero-subtitle">
            回复会以官方身份显示在对应留言下方，所有访客都能看到。
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
              使用 ichessgeek 的管理账号登录。同一 IP 连续 5 次失败会锁定 15 分钟。
            </p>
            <form className="gb-form" onSubmit={handleLogin}>
              <div className="gb-field">
                <label htmlFor="gba-email">管理员邮箱</label>
                <input
                  id="gba-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="登录用邮箱，不是留言者昵称"
                  required
                  autoComplete="username"
                />
              </div>
              <div className="gb-field">
                <label htmlFor="gba-password">密码</label>
                <input
                  id="gba-password"
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

            <section className="gb-messages">
              <h2 className="gb-section-title">
                全部留言
                {total > 0 && <span className="gb-count-badge">{total}</span>}
              </h2>
              {loading ? (
                <div className="gb-empty">
                  <span className="gb-empty-icon">⏳</span>
                  <p>加载中…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="gb-empty">
                  <span className="gb-empty-icon">📭</span>
                  <p>还没有留言</p>
                </div>
              ) : (
                <>
                  {total > messages.length && (
                    <p className="gba-hint">
                      仅显示最近 {messages.length} 条，共 {total} 条。
                    </p>
                  )}
                  <div className="gb-list">
                    {messages.map((msg) => (
                      <div key={msg.id} className="gb-card">
                        <div className="gb-card-body">
                          <div className="gb-card-header">
                            <span className="gb-card-name">
                              #{msg.id} · {msg.name}
                            </span>
                            <span className="gb-card-date">{formatDate(msg.timestamp)}</span>
                          </div>
                          <p className="gb-card-content">{msg.content}</p>
                          <ReplyList
                            replies={msg.replies}
                            onDelete={handleDeleteReply}
                            busyReplyId={busyReplyId}
                          />
                          <div className="gba-reply-box">
                            <div className="gb-field">
                              <label htmlFor={`gba-reply-${msg.id}`}>
                                回复 {msg.name}
                                {msg.replies && msg.replies.length > 0
                                  ? `（已有 ${msg.replies.length} 条回复）`
                                  : "（尚未回复）"}
                              </label>
                              <textarea
                                id={`gba-reply-${msg.id}`}
                                rows={3}
                                maxLength={2000}
                                value={drafts[msg.id] || ""}
                                onChange={(e) =>
                                  setDrafts((prev) => ({ ...prev, [msg.id]: e.target.value }))
                                }
                                placeholder="写下回复，提交后对所有访客可见"
                              />
                            </div>
                            <div className="gba-reply-actions">
                              <button
                                type="button"
                                className="gba-reply-submit"
                                disabled={busyId === msg.id || !(drafts[msg.id] || "").trim()}
                                onClick={() => handleReply(msg.id)}
                              >
                                {busyId === msg.id ? "提交中…" : "提交回复"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <details className="gba-pwd-box">
              <summary className="gba-pwd-summary">修改密码</summary>
              <form className="gb-form" onSubmit={handleChangePassword}>
                <p className="gba-hint">
                  改完立即生效，本次登录可以继续用，但下次登录要用新密码。请记牢：这个后台没有自助找回。
                </p>
                <div className="gb-field">
                  <label htmlFor="gba-old-pwd">原密码</label>
                  <input
                    id="gba-old-pwd"
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <div className="gb-field">
                  <label htmlFor="gba-new-pwd">新密码</label>
                  <input
                    id="gba-new-pwd"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <p className="gba-hint">至少 8 位。</p>
                </div>
                <div className="gb-field">
                  <label htmlFor="gba-confirm-pwd">再输入一次新密码</label>
                  <input
                    id="gba-confirm-pwd"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <div className="gb-form-actions">
                  <button type="submit" className="gb-submit" disabled={pwdBusy}>
                    {pwdBusy ? "提交中…" : "确认修改"}
                  </button>
                </div>
              </form>
            </details>
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
