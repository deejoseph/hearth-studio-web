import { useState, useEffect, useCallback } from "react";
import "./Guestbook.css";

const API_URL = "/api/v1/guestbook.php";

function getInitial(name) {
  return name.charAt(0).toUpperCase();
}

function getAvatarColor(name) {
  const colors = [
    "rgba(79, 209, 197, 0.2)",
    "rgba(246, 173, 85, 0.2)",
    "rgba(159, 122, 234, 0.2)",
    "rgba(237, 100, 166, 0.2)",
    "rgba(104, 211, 145, 0.2)",
    "rgba(99, 179, 237, 0.2)",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getAvatarTextColor(name) {
  const colors = [
    "#4fd1c5",
    "#f6ad55",
    "#9f7aea",
    "#ed64a6",
    "#68d391",
    "#63b3ed",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function Guestbook() {
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(API_URL);
      const data = await res.json();
      setMessages(data.messages || []);
      setTotal(data.total || 0);
    } catch {
      setError("加载留言失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;

    try {
      setSubmitting(true);
      setError("");
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), content: content.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "提交失败");
        return;
      }

      setName("");
      setContent("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
      fetchMessages();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="guestbook">
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          <a href="/" className="fh-nav-link fh-nav-back">← 返回</a>
          <a href="/education" className="fh-nav-link">教育</a>
          <a href="/tech" className="fh-nav-link">技术</a>
          <a href="/business" className="fh-nav-link">小生意</a>
          <a href="/guestbook" className="fh-nav-link active">留言板</a>
        </div>
      </nav>

      <main className="gb-main">
        <div className="gb-hero">
          <span className="gb-hero-tag">GUESTBOOK</span>
          <h1>留言板</h1>
          <p className="gb-hero-subtitle">
            这里是一个开放的空间。无论你是对学习路线有疑问、对技术方向有想法、
            对小生意有灵感，还是只是想打个招呼——都欢迎在这里留下你的声音。
          </p>
        </div>

        <div className="gb-intro">
          <p>
            Eddie 会定期查看每一条留言。如果你的问题需要更深入的交流，
            他会在回复中建议你预约一次课，面对面聊会更高效。
          </p>
        </div>

        <section className="gb-form-section">
          <h2 className="gb-section-title">写下你的留言</h2>
          <form className="gb-form" onSubmit={handleSubmit}>
            <div className="gb-field">
              <label htmlFor="gb-name">昵称</label>
              <input
                id="gb-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的名字"
                required
                maxLength={100}
              />
            </div>
            <div className="gb-field">
              <label htmlFor="gb-content">
                留言
                <span className="gb-char-count">{content.length} / 2000</span>
              </label>
              <textarea
                id="gb-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="说点什么..."
                rows={4}
                required
                maxLength={2000}
              />
            </div>
            <div className="gb-form-actions">
              <button type="submit" className="gb-submit" disabled={submitting}>
                {submitting ? "提交中..." : "提交留言"}
              </button>
              {submitted && <span className="gb-success">留言已提交！</span>}
              {error && <span className="gb-error">{error}</span>}
            </div>
          </form>
        </section>

        <section className="gb-messages">
          <h2 className="gb-section-title">
            所有留言
            {total > 0 && <span className="gb-count-badge">{total}</span>}
          </h2>
          {loading ? (
            <div className="gb-empty">
              <span className="gb-empty-icon">⏳</span>
              <p>加载中...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="gb-empty">
              <span className="gb-empty-icon">💬</span>
              <p>还没有留言，来做第一个吧！</p>
            </div>
          ) : (
            <div className="gb-list">
              {messages.map((msg) => (
                <div key={msg.id} className="gb-card">
                  <div
                    className="gb-card-avatar"
                    style={{
                      background: getAvatarColor(msg.name),
                      color: getAvatarTextColor(msg.name),
                    }}
                  >
                    {getInitial(msg.name)}
                  </div>
                  <div className="gb-card-body">
                    <div className="gb-card-header">
                      <span className="gb-card-name">{msg.name}</span>
                      <span className="gb-card-date">{formatDate(msg.timestamp)}</span>
                    </div>
                    <p className="gb-card-content">{msg.content}</p>
                    {msg.replies && msg.replies.length > 0 && (
                      <div className="gb-replies">
                        {msg.replies.map((reply) => (
                          <div key={reply.id} className="gb-reply">
                            <div className="gb-reply-head">
                              <span className="gb-reply-badge">回复</span>
                              <span className="gb-reply-name">{reply.author}</span>
                              <span className="gb-reply-date">{formatDate(reply.timestamp)}</span>
                            </div>
                            <p className="gb-reply-content">{reply.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="gb-footer">
        <div className="gb-footer-inner">
          <p className="gb-footer-copy">
            &copy; {new Date().getFullYear()} ichessgeek.com
          </p>
          <div className="gb-footer-contact">
            <a href="mailto:edward_dee@ichessgeek.com" className="gb-footer-email">edward_dee@ichessgeek.com</a>
            <span className="gb-footer-email-sep">|</span>
            <a href="mailto:admin@ichessgeek.com" className="gb-footer-email">admin@ichessgeek.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
