import { useEffect, useState } from "react";
import "./Customize.css";

export default function Customize() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hearthstudio/v1/get_order_board.php")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setBoard(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="customize-container">
        Loading commission board...
      </div>
    );
  }

  if (!board || !board.seasons?.length) {
    return (
      <div className="customize-container">
        No commission data available
      </div>
    );
  }

  const currentSeason = board.seasons[0];
  const slotsLeft =
    currentSeason.total_slots - currentSeason.used_slots;

  const isFull = slotsLeft <= 0;

  return (
    <div className="customize-container">

      {/* ======================= */}
      {/* Studio Hero */}
      {/* ======================= */}
      <div className="studio-hero">
        <img
          src="src/assets/images/studio-hero.jpg"
          alt="Studio atmosphere"
        />
      </div>

      <h1 className="customize-title">
        Studio Commission Board
      </h1>

      {/* ======================= */}
      {/* Booking Status */}
      {/* ======================= */}
      <div className="booking-status-wrapper">
        {isFull ? (
          <div className="booking-status closed">
            <div className="booking-title">
              This Season Is Fully Booked
            </div>
            <div className="booking-sub">
              New commissions will be scheduled into{" "}
              {board.seasons[1]?.name}
            </div>
          </div>
        ) : (
          <div className="booking-status available">
            <div className="booking-title">
              Now Accepting Commissions
            </div>
            <div className="booking-sub">
              {slotsLeft} of {currentSeason.total_slots} slots remaining
            </div>
            <div className="booking-production">
              Production Cycle: {currentSeason.production_cycle}
            </div>
          </div>
        )}
      </div>

      {/* ======================= */}
      {/* Seasons */}
      {/* ======================= */}
      {board.seasons.map((season) => (
        <div key={season.id} className="season-section">

          <div className="season-header">
            <h2>{season.name}</h2>
            <div className="season-meta">
              {season.start_date} → {season.end_date}
              {season.order_deadline && (
                <span>
                  Order Deadline: {season.order_deadline}
                </span>
              )}
              <span>
                Production: {season.production_cycle}
              </span>
            </div>
          </div>

          <div className="season-summary">
            Total Orders: {season.used_slots} / {season.total_slots}
          </div>

          {season.statuses?.map((status) => {

            const highlightDeposit =
              status.status_code === "awaiting_deposit";

            const highlightBalance =
              status.status_code === "awaiting_balance";

            const isProduction =
              status.status_code === "in_production";

            return (
              <div
                key={status.status_id}
                className="status-block"
              >

                {/* Status Title */}
                <div className="status-title">
                  {status.status_label} ({status.orders.length})
                </div>

                <div className="status-description">
                  {status.status_description}
                </div>

                {/* Deposit Alert */}
                {highlightDeposit && (
                  <div className="payment-alert deposit">
                    <strong>Deposit Required</strong> — 
                    Production will begin once payment is confirmed.
                  </div>
                )}

                {/* Final Payment Alert */}
                {highlightBalance && (
                  <div className="payment-alert final">
                    <strong>Final Payment Required</strong> — 
                    Shipping will proceed after balance is received.
                  </div>
                )}

                <div
                  className={
                    isProduction
                      ? "status-production"
                      : "status-default"
                  }
                >
                  <div className="order-grid">

                    {status.orders.map((order) => {

                      const productImage =
                        order.product_image ||
                        "/images/default-product.jpg";

                      const customerName =
                        order.customer_name ||
                        "Private Client";

                      const progress =
                        order.progress_percentage ?? 45;

                      const latestUpdate =
                        order.latest_update ||
                        "Studio update will appear here.";

                      return (
                        <div
                          key={order.id}
                          className={`order-card ${
                            order.is_public
                              ? "public"
                              : "private"
                          }`}
                        >
                          {order.is_public ? (
                            <>
                              {/* Product Thumbnail */}
                              <img
                                src={productImage}
                                alt="product"
                                className="order-thumb"
                              />

                              <div className="order-info">
                                Order #{order.id}
                              </div>

                              {/* Hover Username */}
                              <div className="order-hover-name">
                                {customerName}
                              </div>

                              {/* Production Enhanced UI */}
                              {isProduction && (
                                <div className="production-area">
                                  <div className="progress-bar">
                                    <div
                                      className="progress-bar-inner"
                                      style={{
                                        width: `${progress}%`,
                                      }}
                                    />
                                  </div>

                                  <div className="production-note">
                                    {latestUpdate}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="order-private">
                              🔒 Private Order
                            </div>
                          )}
                        </div>
                      );
                    })}

                  </div>
                </div>

              </div>
            );
          })}

        </div>
      ))}

      <div className="customize-footer-space" />
    </div>
  );
}