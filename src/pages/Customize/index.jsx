import { useEffect, useState } from "react";
import "./Customize.css";
import studioHero from "../../assets/images/studio-hero.jpg";
import studioHero2 from "../../assets/images/studio-hero-2.jpg";
import studioHero3 from "../../assets/images/studio-hero3.jpg";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getOrderBoardByQuarterOffset } from "../../api/orderService";

export default function Customize() {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quarterOffset, setQuarterOffset] = useState(0);
  const [pagerNotice, setPagerNotice] = useState("");
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let alive = true;

    const loadBoard = async () => {
      try {
        let viewerUserId = user?.id || 0;
        if (!viewerUserId) {
          try {
            const raw = localStorage.getItem("user");
            const parsed = raw ? JSON.parse(raw) : null;
            viewerUserId = parsed?.id || 0;
          } catch {
            viewerUserId = 0;
          }
        }

        const data = await getOrderBoardByQuarterOffset(viewerUserId, quarterOffset);
        if (alive && data?.success) {
          setBoard(data);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    loadBoard();

    return () => {
      alive = false;
    };
  }, [user?.id, quarterOffset]);

  useEffect(() => {
    if (!board?.pagination) return;
    const returnedOffset = Number(board.pagination.offset ?? 0);
    if (quarterOffset > returnedOffset) {
      setPagerNotice("You are already at the latest available quarter.");
    } else if (quarterOffset < returnedOffset) {
      setPagerNotice("You are already at the earliest available quarter.");
    } else {
      setPagerNotice("");
    }
  }, [board?.pagination, quarterOffset]);

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
  const slotsLeft = currentSeason.total_slots - currentSeason.used_slots;

  const isFull = slotsLeft <= 0;
  const quarterViewOffset = quarterOffset;
  const isCurrentQuarter = quarterViewOffset === 0;
  const nextSeasonInfo = board.pagination?.next_season || null;
  const canCarryToNextQuarter =
    Boolean(nextSeasonInfo) && Number(nextSeasonInfo.slots_left) > 0;
  const nextQuarterAlsoFull =
    Boolean(nextSeasonInfo) && Number(nextSeasonInfo.slots_left) <= 0;

  const handlePrevQuarter = () => {
    if (loading) return;
    setPagerNotice("");
    setQuarterOffset((prev) => prev - 1);
  };

  const handleNextQuarter = () => {
    if (loading) return;
    setPagerNotice("");
    setQuarterOffset((prev) => prev + 1);
  };

  return (
    <div className="customize-container">
      <div className="studio-hero">
        <img
          src={isCurrentQuarter ? studioHero : (quarterViewOffset > 0 ? studioHero3 : studioHero2)}
          alt="Season Hero"
        />
      </div>

      <h1 className="customize-title">
        Studio Commission Board
      </h1>

      <div className="quarter-pager">
        <button
          className="quarter-nav-btn"
          onClick={handlePrevQuarter}
          disabled={loading}
        >
          &larr; Previous Quarter
        </button>

        <div className="quarter-pager-center">
          <div className="quarter-pager-title">{currentSeason.name}</div>
          <div className="quarter-pager-tip">
            Default shows current quarter. You can flip left or right to view other quarters.
          </div>
        </div>

        <button
          className="quarter-nav-btn"
          onClick={handleNextQuarter}
          disabled={loading}
        >
          Next Quarter &rarr;
        </button>
      </div>

      {pagerNotice && (
        <div className="quarter-pager-notice">{pagerNotice}</div>
      )}

      <div className="booking-policy-note">
        We only accept custom reservations for the current quarter and the next quarter.
        Urgent orders are prioritized in the current quarter, while non-urgent orders can be scheduled into the next quarter.
        If you need a date adjustment, please contact the administrator.
      </div>

      <div className="booking-status-wrapper">
        {!isFull ? (
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
        ) : isCurrentQuarter && canCarryToNextQuarter ? (
          <div className="booking-status available">
            <div className="booking-title">
              This Quarter Is Full, Still Accepting Next Quarter
            </div>
            <div className="booking-sub">
              New commissions will be scheduled into {" "}
              {nextSeasonInfo?.name || board.pagination?.next_name || "the next quarter"}
            </div>
            <div className="booking-production">
              Next quarter slots left: {nextSeasonInfo?.slots_left} / {nextSeasonInfo?.total_slots}
            </div>
          </div>
        ) : isCurrentQuarter && nextQuarterAlsoFull ? (
          <div className="booking-status closed">
            <div className="booking-title">
              This Quarter And Next Quarter Are Fully Booked
            </div>
            <div className="booking-sub">
              We are not accepting new commissions right now.
            </div>
          </div>
        ) : (
          <div className="booking-status closed">
            <div className="booking-title">
              This Season Is Fully Booked
            </div>
            <div className="booking-sub">
              New commissions will be scheduled into {" "}
              {board.pagination?.next_name || "the next quarter"}
            </div>
          </div>
        )}
      </div>

      {board.seasons.map((season) => (
        <div key={season.id}>
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

                        const isPrivate = !Boolean(order.is_public);
                        const canView = Boolean(order.can_view);
                        const cardClass = canView
                          ? (isPrivate ? "private-own" : "public")
                          : "private";

                        const displayName =
                          typeof order.customer_name === "string"
                            ? order.customer_name.trim()
                            : "";

                        return (
                          <div
                            key={order.id}
                            className={`order-card ${cardClass}`}
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

                            {isPrivate && (
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
