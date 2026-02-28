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

      <div className="studio-hero">
        <img
          src="src/assets/images/studio-hero.jpg"
          alt="Current Season"
        />
      </div>

      <h1 className="customize-title">
        Studio Commission Board
      </h1>

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

      {board.seasons.map((season, index) => (
        <div key={season.id}>

          {index === 1 && (
            <div className="studio-hero next-season-hero">
              <img
                src="src/assets/images/studio-hero-2.jpg"
                alt="Next Season"
              />
            </div>
          )}

          <div className="season-section">

            <div className="season-header">
              <h2>{season.name}</h2>
              <div className="season-meta">
                {season.start_date} → {season.end_date}
                <span>
                  Production: {season.production_cycle}
                </span>
              </div>
            </div>

            <div className="season-summary">
              Total Orders: {season.used_slots} / {season.total_slots}
            </div>

            {season.statuses?.map((status) => {

              const orders = status.orders || [];

              return (
                <div
                  key={status.status_id}
                  className="status-block"
                >

                  <div className="status-title">
                    {status.status_label} ({orders.length})
                  </div>

                  <div className="status-description">
                    {status.status_description}
                  </div>

                  <div className="status-default">
                    <div className="order-grid">

                      {orders.map((order) => {

                        const productImage =
                          order.product_image ||
                          "/images/default-product.jpg";

                        const isPublic = Boolean(order.is_public);

                        const displayName =
                          typeof order.customer_name === "string"
                            ? order.customer_name.trim()
                            : "";

                        return (
                          <div
                            key={order.id}
                            className={`order-card ${
                              isPublic ? "public" : "private"
                            }`}
                          >
                            <img
                              src={productImage}
                              alt="product"
                              className="order-thumb"
                            />

                            {!isPublic && (
                              <div className="order-lock-badge">
                                🔒 Private
                              </div>
                            )}

                            <div className="order-footer">
                              <div className="order-number">
                                Order #{order.id}
                              </div>

                              {isPublic && displayName && (
                                <div className="order-name">
                                  {displayName}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                    </div>
                  </div>

                </div>
              );
            })}

          </div>
        </div>
      ))}

      <div className="customize-footer-space" />
    </div>
  );
}