import { useEffect, useState } from "react";
import "./Customize.css";

export default function Customize() {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hearthstudio/v1/get_order_board.php")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSeasons(data.seasons);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="customize-container">
        Loading commission board...
      </div>
    );
  }

  if (!seasons.length) {
    return (
      <div className="customize-container">
        <h2>No commission data available</h2>
      </div>
    );
  }

  return (
    <div className="customize-container">
      <h1 className="customize-title">Studio Commission Board</h1>

      {seasons.map((season) => {
        // ===== 计算季度总订单数 =====
        const totalOrders = season.statuses.reduce(
          (sum, status) => sum + status.orders.length,
          0
        );

        // ===== 计算公开订单数 =====
        const publicOrders = season.statuses.reduce(
          (sum, status) =>
            sum +
            status.orders.filter((o) => o.is_public === 1).length,
          0
        );

        return (
          <div key={season.id} className="season-section">
            {/* ===================== */}
            {/* 🎯 季度摘要 */}
            {/* ===================== */}
            <div className="season-header">
              {/* 如果 name 已经包含年份，就不要再拼 year */}
              <h2>{season.name}</h2>
            </div>

            <div className="season-summary">
              Total Orders: {totalOrders}
              <br />
              Public Showcase: {publicOrders}
            </div>

            {/* ===================== */}
            {/* 📦 按状态分区 */}
            {/* ===================== */}
            {season.statuses.map((status) => {
              // 根据 slug 选择状态样式
              let statusClass = "status-awaiting";

              if (status.slug === "production") {
                statusClass = "status-production";
              }

              if (status.slug === "completed") {
                statusClass = "status-completed";
              }

              if (status.slug === "shipped") {
                statusClass = "status-shipped";
              }

              return (
                <div key={status.status_id} className="status-block">
                  <div className="status-title">
                    {status.status_label} ({status.orders.length})
                  </div>

                  <div className={statusClass}>
                    <div className="order-grid">
                      {status.orders.map((order) => (
                        <div
                          key={order.id}
                          className={`order-card ${
                            order.is_public ? "public" : "private"
                          }`}
                        >
                          {order.is_public ? (
                            <span>Order #{order.id}</span>
                          ) : (
                            <span className="order-lock">🔒</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="customize-footer-space" />
    </div>
  );
}