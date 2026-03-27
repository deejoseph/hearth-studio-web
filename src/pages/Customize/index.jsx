import { useEffect, useState } from "react";
import "./Customize.css";
import studioHero from "../../assets/images/studio-hero.jpg";
import studioHero2 from "../../assets/images/studio-hero-2.jpg";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrderBoardWithViewer } from "../../api/orderService";

export default function Customize() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const loadBoard = async () => {
      try {
        const data = await getOrderBoardWithViewer(user?.id);
        if (data?.success) {
          setBoard(data);
        }
      } finally {
        setLoading(false);
      }
    };

    loadBoard();
  }, [user?.id]);

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
          src={studioHero}
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
                src={studioHero2}
                alt="Next Season"
              />
            </div>
          )}

          <div className="season-section">

            <div className="season-header">
              <h2>{season.name}</h2>
              <div className="season-meta">
                {season.start_date} &rarr; {season.end_date}
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

                        const canView = Boolean(order.can_view);

                        const displayName =
                          typeof order.customer_name === "string"
                            ? order.customer_name.trim()
                            : "";

                        return (
                          <div
                            key={order.id}
                            className={`order-card ${
                              canView ? "public" : "private"
                            }`}
                            onClick={() => {
                              if (canView) {
                                navigate(`/order/${order.id}`);
                              }
                            }}
                            style={{ cursor: canView ? "pointer" : "default" }}
                            >
                            <img
                              src={productImage}
                              alt="product"
                              className="order-thumb"
                            />

                            {!canView && (
                              <div className="order-lock-badge">
                                &#128274; Private
                              </div>
                            )}

                            <div className="order-footer">
                              <div className="order-number">
                                Order #{order.id}
                              </div>

                              {canView && displayName && (
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
