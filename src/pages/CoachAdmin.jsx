import { useState, useEffect, useCallback, useRef } from "react";
import "./Guestbook.css";
import {
  getCoachAdminSession,
  loginCoachAdmin,
  logoutCoachAdmin,
  getCoachApplications,
  decideCoachApplication,
  getCoachComplaints,
  decideCoachComplaint,
  restoreCoachQualification,
} from "../api/coachAdmin.js";

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

const COMPLAINT_FILTERS = [
  { key: "", label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "upheld", label: "已支持" },
  { key: "rejected", label: "已驳回" },
];

const COMPLAINT_STATUS_TEXT = {
  pending: "待处理",
  upheld: "已支持",
  rejected: "已驳回",
};

const SEVERITY_TEXT = {
  normal: "一般",
  severe: "严重",
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

function errorText(err) {
  if (err && err.name === "AbortError") {
    return "连接超时，服务器在海外，请稍后重试";
  }
  return (err && err.message) || "网络错误，请稍后重试";
}

function normalizedAdminText(value) {
  return String(value || "").replace(/[\u3000\s]+/g, " ").trim();
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timestamp(value) {
  const d = new Date(String(value || "").replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** 待处理始终排在前；其余按提交时间从新到旧。 */
function sortComplaints(rows) {
  return [...rows].sort((a, b) => {
    const pendingOrder = Number(b.status === "pending") - Number(a.status === "pending");
    return pendingOrder || timestamp(b.created_at) - timestamp(a.created_at) || Number(b.id) - Number(a.id);
  });
}

function draftFor(complaint, draft) {
  return {
    publicText: draft?.publicText ?? String(complaint.public_text || ""),
    severity: draft?.severity ?? String(complaint.severity || "normal"),
    revoke: draft?.revoke ?? false,
    restoreReason: draft?.restoreReason ?? "",
  };
}

function coachIsRevoked(complaint, revokedCoachIds) {
  const explicit = complaint.revoked ?? complaint.coach_revoked ?? complaint.qualification_revoked;
  if (typeof explicit === "boolean") return explicit;
  return revokedCoachIds.has(String(complaint.coach_id));
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

function ComplaintRow({ complaint, draft, busy, queueBusy, revoked, restored, onDraftChange, onDecide, onRestore }) {
  const value = draftFor(complaint, draft);
  const pending = complaint.status === "pending";
  const shownSeverity = pending ? value.severity : complaint.severity;
  const severe = pending && value.severity === "severe";
  const publicTextId = `coa-complaint-text-${complaint.id}`;
  const reasonId = `coa-restore-reason-${complaint.id}`;
  const severityOptions = ["normal", "severe"];
  const publicLength = [...normalizedAdminText(value.publicText)].length;
  if (!severityOptions.includes(value.severity)) severityOptions.push(value.severity);
  const updateDraft = (patch) => onDraftChange({ ...value, ...patch });

  return (
    <article
      className={`coa-card coa-complaint${revoked ? " coa-complaint-revoked" : ""}`}
      aria-labelledby={`coa-complaint-coach-${complaint.id}`}
    >
      <header className="coa-complaint-head">
        <div className="coa-complaint-title">
          <span className={`coa-badge coa-badge-${complaint.status}`}>
            {COMPLAINT_STATUS_TEXT[complaint.status] || complaint.status}
          </span>
          <span className={`coa-severity${severe ? " coa-severity-severe" : ""}`}>
            严重程度：{SEVERITY_TEXT[shownSeverity] || shownSeverity || "未标注"}
          </span>
          <h3 id={`coa-complaint-coach-${complaint.id}`} className="coa-name">
            {complaint.coach_name || `教练 #${complaint.coach_id}`}
          </h3>
        </div>
        <div className="coa-complaint-meta">
          <span>申诉 #{complaint.id}</span>
          <time dateTime={complaint.created_at || undefined}>
            {complaint.created_at ? `提交于 ${formatDateTime(complaint.created_at)}` : "提交时间未知"}
          </time>
          {complaint.decided_at && <span>处理于 {formatDateTime(complaint.decided_at)}</span>}
        </div>
      </header>

      {revoked && (
        <p className="coa-revoked" role="status">
          课堂资格已撤销 · 该教练目前不能开课堂
        </p>
      )}
      {restored && !revoked && (
        <p className="coa-restored" role="status">
          课堂资格已恢复 · 该教练可以重新开课堂
        </p>
      )}

      <div className="coa-anonymous">
        <p className="coa-anonymous-label">匿名投诉</p>
        <blockquote className="coa-complaint-text">{complaint.text}</blockquote>
      </div>

      {pending ? (
        <div className="coa-decision">
          <div className="gb-field">
            <label htmlFor={publicTextId}>
              公开回复措辞
              <span className="gb-char-count">{publicLength} / 3000</span>
            </label>
            <textarea
              id={publicTextId}
              rows={3}
              maxLength={3000}
              value={value.publicText}
              disabled={queueBusy}
              aria-describedby={`${publicTextId}-hint`}
              onChange={(event) => updateDraft({ publicText: event.target.value })}
              placeholder="写明核实后的结论；不要包含或推测投诉人身份"
            />
            <p id={`${publicTextId}-hint`} className="gba-hint">
              支持投诉后，这段文字会公开。驳回时不会公开投诉内容。
            </p>
          </div>

          <div className="coa-decision-grid">
            <div className="gb-field">
              <label htmlFor={`coa-complaint-severity-${complaint.id}`}>严重程度</label>
              <select
                id={`coa-complaint-severity-${complaint.id}`}
                value={value.severity}
                disabled={queueBusy}
                onChange={(event) =>
                  updateDraft({
                    severity: event.target.value,
                    revoke: event.target.value === "severe" ? value.revoke : false,
                  })
                }
              >
                {severityOptions.map((severity) => (
                  <option key={severity} value={severity}>
                    {SEVERITY_TEXT[severity] || severity}
                  </option>
                ))}
              </select>
            </div>

            {severe && (
              <div className="coa-revoke-check">
                <label>
                  <input
                    type="checkbox"
                    checked={value.revoke}
                    disabled={queueBusy}
                    aria-describedby={`coa-revoke-hint-${complaint.id}`}
                    onChange={(event) => updateDraft({ revoke: event.target.checked })}
                  />
                  我确认：支持这条投诉，同时撤销该教练的课堂资格
                </label>
                <p id={`coa-revoke-hint-${complaint.id}`} className="gba-hint">
                  是否撤销由管理员单独判断；撤销立即生效，恢复资格必须填写理由。
                </p>
              </div>
            )}
          </div>

          <div className="coa-actions">
            <button
              type="button"
              className="coa-btn"
              disabled={queueBusy || publicLength < 20 || publicLength > 3000}
              onClick={() => onDecide(complaint, "uphold")}
            >
              {busy ? "提交中…" : "支持投诉"}
            </button>
            <button
              type="button"
              className="coa-btn coa-btn-danger"
              disabled={queueBusy}
              onClick={() => onDecide(complaint, "reject")}
            >
              {busy ? "提交中…" : "驳回投诉"}
            </button>
          </div>
          {severe && (
            <p className="gba-hint">严重投诉可以支持而不撤销；需要撤销时请勾选上面的确认项。</p>
          )}
        </div>
      ) : (
        <div className="coa-decision-result">
          {complaint.status === "upheld" ? (
            <>
              <h4>公开答复</h4>
              <p>{complaint.public_text || "未填写公开答复"}</p>
              {complaint.published_at && <span>公开于 {formatDateTime(complaint.published_at)}</span>}
            </>
          ) : (
            <p>已驳回，投诉内容不会公开，也不会改变教练资格。</p>
          )}
        </div>
      )}

      {revoked && (
        <form
          className="coa-restore"
          onSubmit={(event) => {
            event.preventDefault();
            onRestore(complaint, value.restoreReason);
          }}
        >
          <h4>恢复课堂资格</h4>
          <p className="gba-hint">恢复立即生效；理由会留在管理记录中，请说明核实依据。</p>
          <div className="gb-field">
            <label htmlFor={reasonId}>恢复理由</label>
            <textarea
              id={reasonId}
              rows={2}
              maxLength={1000}
              required
              value={value.restoreReason}
              disabled={queueBusy}
              onChange={(event) => updateDraft({ restoreReason: event.target.value })}
              placeholder="例如：已核实为误诉，或教练已完成整改"
            />
          </div>
          <button
            type="submit"
            className="coa-btn"
            disabled={queueBusy || !value.restoreReason.trim()}
          >
            {busy ? "提交中…" : "恢复课堂资格"}
          </button>
        </form>
      )}
    </article>
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
  const [complaints, setComplaints] = useState([]);
  const [complaintFilter, setComplaintFilter] = useState("");
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintsLoaded, setComplaintsLoaded] = useState(false);
  const [complaintError, setComplaintError] = useState("");
  const [complaintNotice, setComplaintNotice] = useState("");
  const [complaintDrafts, setComplaintDrafts] = useState({});
  const [complaintBusyId, setComplaintBusyId] = useState(null);
  const [revokedCoachIds, setRevokedCoachIds] = useState(() => new Set());
  const sessionRef = useRef(0);
  const appsRequest = useRef(0);
  const complaintsRequest = useRef(0);
  const appsMutation = useRef(0);
  const complaintsMutation = useRef(0);
  const appsAbort = useRef(null);
  const complaintsAbort = useRef(null);

  const cancelRequests = useCallback(() => {
    sessionRef.current += 1;
    appsRequest.current += 1;
    complaintsRequest.current += 1;
    appsMutation.current += 1;
    complaintsMutation.current += 1;
    appsAbort.current?.abort();
    complaintsAbort.current?.abort();
    appsAbort.current = null;
    complaintsAbort.current = null;
    setLoading(false);
    setComplaintsLoading(false);
    setBusyId(null);
    setComplaintBusyId(null);
  }, []);

  const clearSession = useCallback(() => {
    setAuthState("anon");
    setAdminName("");
    setPassword("");
    setApps([]);
    setCounts(null);
    setComplaints([]);
    setComplaintsLoaded(false);
    setComplaintDrafts({});
    setComplaintNotice("");
    setComplaintError("");
    setRevokedCoachIds(new Set());
    setError("");
    setNotice("");
  }, []);

  const expireSession = useCallback((message) => {
    cancelRequests();
    clearSession();
    setError(message);
  }, [cancelRequests, clearSession]);

  const fetchApps = useCallback(async (status) => {
    appsAbort.current?.abort();
    const controller = new AbortController();
    appsAbort.current = controller;
    const ticket = ++appsRequest.current;
    const generation = sessionRef.current;
    const current = () => ticket === appsRequest.current && generation === sessionRef.current;
    setLoading(true);
    try {
      const data = await getCoachApplications(status, { signal: controller.signal });
      if (!current()) return null;
      setApps(Array.isArray(data?.apps) ? data.apps : []);
      setCounts(data?.counts || null);
      setError("");
      return { ok: true };
    } catch (err) {
      if (!current() || err.name === "AbortError") return null;
      if (err.status === 401) {
        expireSession("登录状态已失效，请重新登录");
      } else {
        setError(errorText(err));
      }
      return { ok: false };
    } finally {
      if (current()) {
        setLoading(false);
        appsAbort.current = null;
      }
    }
  }, [expireSession]);

  const fetchComplaints = useCallback(async () => {
    complaintsAbort.current?.abort();
    const controller = new AbortController();
    complaintsAbort.current = controller;
    const ticket = ++complaintsRequest.current;
    const generation = sessionRef.current;
    const current = () => ticket === complaintsRequest.current && generation === sessionRef.current;
    setComplaintsLoading(true);
    try {
      const data = await getCoachComplaints({ signal: controller.signal });
      if (!current()) return null;
      setComplaints(Array.isArray(data?.complaints) ? data.complaints : []);
      setComplaintsLoaded(true);
      setComplaintError("");
      return { ok: true };
    } catch (err) {
      if (!current() || err.name === "AbortError") return null;
      if (err.status === 401) {
        expireSession("登录状态已失效，请重新登录");
      } else {
        setComplaintError(errorText(err));
      }
      return { ok: false };
    } finally {
      if (current()) {
        setComplaintsLoading(false);
        complaintsAbort.current = null;
      }
    }
  }, [expireSession]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const data = await getCoachAdminSession({ signal: controller.signal });
        if (cancelled) return;
        if (data?.authenticated) {
          setAdminName(data.name || "");
          setAuthState("authed");
          fetchApps("pending");
          fetchComplaints();
        } else {
          setAuthState("anon");
        }
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        setError(err.status === 401 ? "登录状态已失效，请重新登录" : errorText(err));
        setAuthState("anon");
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      appsAbort.current?.abort();
      complaintsAbort.current?.abort();
      sessionRef.current += 1;
      appsRequest.current += 1;
      complaintsRequest.current += 1;
      appsMutation.current += 1;
      complaintsMutation.current += 1;
    };
  }, [fetchApps, fetchComplaints]);

  const handleLogin = async (e) => {
    e.preventDefault();
    cancelRequests();
    const generation = sessionRef.current;
    setError("");
    setNotice("");
    setComplaintError("");
    setComplaintNotice("");
    setLoginBusy(true);
    try {
      const data = await loginCoachAdmin(email.trim(), password);
      if (generation !== sessionRef.current) return;
      setAdminName(data?.name || "");
      setPassword("");
      setComplaints([]);
      setComplaintsLoaded(false);
      setComplaintDrafts({});
      setRevokedCoachIds(new Set());
      setAuthState("authed");
      fetchApps(filter);
      fetchComplaints();
    } catch (err) {
      if (generation === sessionRef.current) setError(errorText(err));
    } finally {
      if (generation === sessionRef.current) setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    cancelRequests();
    const generation = sessionRef.current;
    try {
      await logoutCoachAdmin();
      if (generation !== sessionRef.current) return;
      clearSession();
    } catch (err) {
      if (generation !== sessionRef.current) return;
      setError(`退出失败：${errorText(err)}`);
      fetchApps(filter);
      fetchComplaints();
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
    const generation = sessionRef.current;
    const ticket = ++appsMutation.current;
    try {
      const data = await decideCoachApplication(app.player_id, action.decision);
      if (generation !== sessionRef.current || ticket !== appsMutation.current) return;
      const status = data?.status || action.decision;
      const message = `${verb}了 #${app.player_id}，现在状态是 ${STATUS_TEXT[status] || status}。`;
      setNotice(message);
      const refreshed = await fetchApps(filter);
      if (refreshed?.ok === false) setNotice(`${message} 列表刷新失败，请点刷新重试。`);
    } catch (err) {
      if (generation !== sessionRef.current || ticket !== appsMutation.current) return;
      if (err.status === 401) {
        expireSession("登录状态已失效，请重新登录");
      } else {
        setError(errorText(err));
      }
    } finally {
      if (ticket === appsMutation.current) setBusyId(null);
    }
  };

  const handleComplaintDraftChange = (complaint, nextDraft) => {
    setComplaintDrafts((prev) => ({ ...prev, [complaint.id]: nextDraft }));
  };

  const changeComplaintFilter = (next) => {
    setComplaintFilter(next);
  };

  const handleComplaintDecide = async (complaint, action) => {
    const draft = draftFor(complaint, complaintDrafts[complaint.id]);
    const publicText = normalizedAdminText(draft.publicText);
    const publicLength = [...publicText].length;
    const publicPreview = [...publicText].slice(0, 120).join("");
    const severe = action === "uphold" && draft.severity === "severe";
    const revoke = severe && draft.revoke;
    const coachName = complaint.coach_name || `教练 #${complaint.coach_id}`;
    if (action === "uphold" && publicLength < 20) {
      setComplaintError("公开回复至少写 20 个字，说明核实后的结论");
      return;
    }
    if (action === "uphold" && publicLength > 3000) {
      setComplaintError("公开回复请缩到 3000 个字以内");
      return;
    }

    let confirmation;
    if (action === "reject") {
      confirmation = `确认驳回针对 ${coachName} 的投诉 #${complaint.id}？\n\n投诉不会公开，也不会改变教练资格。`;
    } else if (revoke) {
      confirmation = `确认支持针对 ${coachName} 的严重投诉 #${complaint.id}，并立即撤销其课堂资格？\n\n公开回复：${publicPreview}${publicLength > 120 ? "…" : ""}\n\n撤销后该教练不能开课堂；恢复必须填写理由。`;
    } else {
      confirmation = `确认支持针对 ${coachName} 的投诉 #${complaint.id}？\n\n公开回复：${publicPreview}${publicLength > 120 ? "…" : ""}\n\n本次不会撤销教练资格。`;
    }
    if (!window.confirm(confirmation)) return;

    setComplaintError("");
    setComplaintNotice("");
    setComplaintBusyId(`decide:${complaint.id}`);
    const generation = sessionRef.current;
    const ticket = ++complaintsMutation.current;
    try {
      const data = await decideCoachComplaint({
        complaintId: complaint.id,
        action,
        ...(action === "uphold"
          ? { publicText, severity: draft.severity, revoke }
          : {}),
      });
      if (generation !== sessionRef.current || ticket !== complaintsMutation.current) return;
      const updated = data?.complaint ?? data ?? {};
      const revoked = data?.revoked === true || updated.revoked === true;
      setComplaints((prev) =>
        prev.map((item) =>
          item.id === complaint.id
            ? {
                ...item,
                status: updated.status || (action === "uphold" ? "upheld" : "rejected"),
                severity: action === "uphold" ? draft.severity : item.severity,
                public_text: action === "uphold" ? publicText : item.public_text,
                decided_at: updated.decided_at || new Date().toISOString(),
                published_at: updated.published_at || item.published_at,
                revoked,
                standing_status: revoked ? "revoked" : item.standing_status,
                restored_at: revoked ? null : item.restored_at,
              }
            : item
        )
      );
      if (revoked) {
        const coachKey = String(complaint.coach_id);
        setRevokedCoachIds((prev) => new Set(prev).add(coachKey));
      }
      const message = revoke
        ? `已支持 #${complaint.id} 的投诉，并立即撤销了 ${coachName} 的课堂资格。`
        : action === "uphold"
          ? `已支持 #${complaint.id} 的投诉，公开回复已保存。`
          : `已驳回 #${complaint.id} 的投诉。`;
      setComplaintNotice(message);
      const refreshed = await fetchComplaints();
      if (refreshed?.ok === false && generation === sessionRef.current) {
        setComplaintNotice(`${message} 列表刷新失败，请点刷新重试。`);
      }
      if (revoked && generation === sessionRef.current) {
        const appsRefreshed = await fetchApps(filter);
        if (appsRefreshed?.ok === false && generation === sessionRef.current) {
          setComplaintNotice(`${message} 申请列表也刷新失败，请点刷新重试。`);
        }
      }
    } catch (err) {
      if (generation !== sessionRef.current || ticket !== complaintsMutation.current) return;
      if (err.status === 401) {
        expireSession("登录状态已失效，请重新登录");
      } else {
        setComplaintError(errorText(err));
      }
    } finally {
      if (ticket === complaintsMutation.current) setComplaintBusyId(null);
    }
  };

  const handleRestore = async (complaint, rawReason) => {
    const reason = normalizedAdminText(rawReason);
    const coachName = complaint.coach_name || `教练 #${complaint.coach_id}`;
    if (!reason) {
      setComplaintError("恢复课堂资格前，请填写恢复理由");
      return;
    }
    if (!window.confirm(`确认恢复 ${coachName} 的课堂资格？\n\n恢复理由：${reason}\n\n恢复会立即生效。`)) return;

    setComplaintError("");
    setComplaintNotice("");
    setComplaintBusyId(`restore:${complaint.coach_id}`);
    const generation = sessionRef.current;
    const ticket = ++complaintsMutation.current;
    try {
      const data = await restoreCoachQualification({ coachId: complaint.coach_id, reason });
      if (generation !== sessionRef.current || ticket !== complaintsMutation.current) return;
      const coachKey = String(complaint.coach_id);
      setRevokedCoachIds((prev) => {
        const next = new Set(prev);
        next.delete(coachKey);
        return next;
      });
      setComplaints((prev) =>
        prev.map((item) =>
          String(item.coach_id) === coachKey
            ? {
                ...item,
                revoked: false,
                standing_status: "revoked",
                restored_at: data?.standing?.restored_at || new Date().toISOString(),
              }
            : item
        )
      );
      setComplaintDrafts((prev) => ({
        ...prev,
        [complaint.id]: draftFor(complaint, { ...prev[complaint.id], restoreReason: "" }),
      }));
      const message = `已恢复 ${coachName} 的课堂资格，恢复理由已记录。`;
      setComplaintNotice(message);
      const complaintsRefreshed = await fetchComplaints();
      if (complaintsRefreshed?.ok === false && generation === sessionRef.current) {
        setComplaintNotice(`${message} 投诉列表刷新失败，请点刷新重试。`);
      }
      if (generation === sessionRef.current) {
        const appsRefreshed = await fetchApps(filter);
        if (appsRefreshed?.ok === false && generation === sessionRef.current) {
          setComplaintNotice(`${message} 申请列表也刷新失败，请点刷新重试。`);
        }
      }
    } catch (err) {
      if (generation !== sessionRef.current || ticket !== complaintsMutation.current) return;
      if (err.status === 401) {
        expireSession("登录状态已失效，请重新登录");
      } else {
        setComplaintError(errorText(err));
      }
    } finally {
      if (ticket === complaintsMutation.current) setComplaintBusyId(null);
    }
  };

  const sortedComplaints = sortComplaints(complaints);
  const visibleComplaints = sortedComplaints.filter(
    (complaint) => !complaintFilter || complaint.status === complaintFilter
  );
  const queueBusy = complaintBusyId !== null;

  return (
    <div className="guestbook">
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          {/* 这一页不进导航，平时是直接输地址进来的 —— 所以"返回"回首页，
              旁边那两条是两个后台之间的互跳。 */}
          <a href="/" className="fh-nav-link fh-nav-back">← 返回首页</a>
          <a href="/coach-admin" className="fh-nav-link active">教练管理</a>
          <a href="/guestbook-admin" className="fh-nav-link">留言板管理</a>
        </div>
      </nav>

      <main className="gb-main">
        <div className="gb-hero">
          <span className="gb-hero-tag">COACH ADMIN</span>
          <h1>教练管理</h1>
          <p className="gb-hero-subtitle">
            处理匿名投诉和教练申请。支持投诉时可单独决定是否撤销课堂资格；恢复必须填写理由。
          </p>
        </div>

        {authState === "loading" && (
          <div className="gb-empty" role="status" aria-live="polite">
            <span className="gb-empty-icon" aria-hidden="true">⏳</span>
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
                {error && <span className="gb-error" role="alert">{error}</span>}
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
            {notice && <p className="gb-success" role="status">{notice}</p>}
            {error && <p className="gb-error" role="alert">{error}</p>}

            <section
              className="gb-messages coa-complaints"
              aria-labelledby="coa-complaints-title"
              aria-busy={complaintsLoading}
            >
              <h2 id="coa-complaints-title" className="gb-section-title">
                匿名投诉
                {complaints.length > 0 && <span className="gb-count-badge">{complaints.length}</span>}
              </h2>
              <p className="gba-hint">
                待处理投诉优先排列。投诉按匿名方式展示，请勿在公开回复中写入或推测投诉人身份。
              </p>
              {complaintNotice && <p className="gb-success" role="status">{complaintNotice}</p>}
              {complaintError && <p className="gb-error" role="alert">{complaintError}</p>}

              <div className="coa-filters" role="group" aria-label="投诉状态筛选">
                {COMPLAINT_FILTERS.map((item) => {
                  const count = complaints.filter(
                    (complaint) => !item.key || complaint.status === item.key
                  ).length;
                  return (
                    <button
                      key={item.key || "all"}
                      type="button"
                      className={complaintFilter === item.key ? "coa-tab coa-tab-on" : "coa-tab"}
                      aria-pressed={complaintFilter === item.key}
                      disabled={complaintsLoading}
                      onClick={() => changeComplaintFilter(item.key)}
                    >
                      {item.label} ({count})
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="gba-logout coa-refresh"
                  aria-label="刷新投诉队列"
                  disabled={complaintsLoading || queueBusy}
                  onClick={() => fetchComplaints()}
                >
                  刷新
                </button>
              </div>

              {complaintsLoading ? (
                <div className="gb-empty" role="status" aria-live="polite">
                  <span className="gb-empty-icon" aria-hidden="true">⏳</span>
                  <p>加载投诉中…</p>
                </div>
              ) : complaintError && !complaintsLoaded ? (
                <div className="gb-empty">
                  <span className="gb-empty-icon" aria-hidden="true">!</span>
                  <p>暂时无法读取投诉。</p>
                  <button type="button" className="coa-btn coa-retry" onClick={() => fetchComplaints()}>
                    重试
                  </button>
                </div>
              ) : visibleComplaints.length === 0 ? (
                <div className="gb-empty">
                  <span className="gb-empty-icon" aria-hidden="true">📭</span>
                  <p>
                    {complaintFilter === "pending"
                      ? "没有待处理的投诉。"
                      : complaintFilter
                        ? "这个状态还没有投诉。"
                        : "还没有匿名投诉。"}
                  </p>
                </div>
              ) : (
                <div className="gb-list">
                  {visibleComplaints.map((complaint) => (
                    <ComplaintRow
                      key={complaint.id}
                      complaint={complaint}
                      draft={complaintDrafts[complaint.id]}
                      busy={
                        complaintBusyId === `decide:${complaint.id}` ||
                        complaintBusyId === `restore:${complaint.coach_id}`
                      }
                      queueBusy={queueBusy}
                      revoked={coachIsRevoked(complaint, revokedCoachIds)}
                      restored={
                        Boolean(complaint.restored_at)
                        && !coachIsRevoked(complaint, revokedCoachIds)
                      }
                      onDraftChange={(nextDraft) => handleComplaintDraftChange(complaint, nextDraft)}
                      onDecide={handleComplaintDecide}
                      onRestore={handleRestore}
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="coa-filters" role="group" aria-label="教练申请状态筛选">
              {FILTERS.map((item) => (
                <button
                  key={item.key || "all"}
                  type="button"
                  className={filter === item.key ? "coa-tab coa-tab-on" : "coa-tab"}
                  aria-pressed={filter === item.key}
                  disabled={loading}
                  onClick={() => changeFilter(item.key)}
                >
                  {item.label}
                  {countFor(counts, item.key) !== null ? ` (${countFor(counts, item.key)})` : ""}
                </button>
              ))}
              <button
                type="button"
                className="gba-logout coa-refresh"
                aria-label="刷新教练申请"
                disabled={loading}
                onClick={() => fetchApps(filter)}
              >
                刷新
              </button>
            </div>

            {counts && (
              <p className="coa-summary">
                注册 {counts.players} 人，其中 {counts.verified} 人确认过邮箱；
                {counts.prefs} 人填过「想找什么样的教练」，{counts.approved} 人有开课堂的资格。
              </p>
            )}

            <section className="gb-messages" aria-labelledby="coa-apps-title">
              <h2 id="coa-apps-title" className="gb-section-title">
                教练申请 · {FILTERS.find((item) => item.key === filter)?.label}
                {apps.length > 0 && <span className="gb-count-badge">{apps.length}</span>}
              </h2>
              {loading ? (
                <div className="gb-empty" role="status" aria-live="polite">
                  <span className="gb-empty-icon" aria-hidden="true">⏳</span>
                  <p>加载中…</p>
                </div>
              ) : apps.length === 0 ? (
                <div className="gb-empty">
                  <span className="gb-empty-icon" aria-hidden="true">📭</span>
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
