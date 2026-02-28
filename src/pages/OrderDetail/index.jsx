import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";


export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/hearthstudio/v1/get_order.php?id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOrder(data.order);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="order-detail-container">
        Loading order...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="order-detail-container">
        Order not found.
      </div>
    );
  }

  return (
    <div className="order-detail-container">
      <h1>Order #{order.id}</h1>

      <div className="order-section">
        <h3>Status</h3>
        <p>{order.status}</p>
      </div>

      <div className="order-section">
        <h3>Shipping Address</h3>
        <p>{order.address || "Not provided"}</p>
      </div>

      <div className="order-section">
        <h3>Base Inscription</h3>
        <p>{order.base_inscription || "None"}</p>
      </div>

      <div className="order-section">
        <h3>Customer Notes</h3>
        <p>{order.custom_notes || "None"}</p>
      </div>

      {order.cover_image_url && (
        <div className="order-section">
          <h3>Cover Image</h3>
          <img
            src={order.cover_image_url}
            alt="cover"
            className="order-cover-image"
          />
        </div>
      )}
    </div>
  );
}