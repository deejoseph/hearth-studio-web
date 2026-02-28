import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import "./OrderDetail.css";

const BASE_URL = "https://ichessgeek.com";

export default function OrderDetail() {
  const { id } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState({});

  const fetchOrderDetail = async () => {
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(
        `/api/hearthstudio/v1/get_order_detail.php?id=${id}`
      );

      if (!res.ok) throw new Error("Network response was not ok");

      const data = await res.json();

      if (data && data.success && data.order_info) {
        setOrderData(data);

        const initialCollapse = {};
        data.timeline.forEach((stage) => {
          initialCollapse[stage.status_id] =
            stage.is_current === 1 ? false : true;
        });

        setCollapsedStages(initialCollapse);
      } else {
        setError(true);
      }
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [id]);

  const handleSendMessage = async (statusId, orderId) => {
    if (!newMessage.trim()) return;

    setSending(true);

    try {
      const res = await fetch(
        "/api/hearthstudio/v1/create_round.php",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: orderId,
            status_id: statusId,
            message: newMessage
          })
        }
      );

      const data = await res.json();

      if (data.success) {
        setNewMessage("");
        await fetchOrderDetail();
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleImageUpload = async (e, statusId, orderId) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      alert("Only JPG, PNG, WEBP allowed");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Max file size is 5MB");
      return;
    }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("order_id", orderId);
    formData.append("status_id", statusId);

    setUploading(true);

    try {
      const res = await fetch(
        "/api/hearthstudio/v1/upload_image.php",
        {
          method: "POST",
          body: formData
        }
      );

      const data = await res.json();

      if (data.success) {
        await fetchOrderDetail();
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="order-detail-container">
        <div className="skeleton-header"></div>
        <div className="skeleton-image"></div>
        <div className="skeleton-line"></div>
        <div className="skeleton-line"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-detail-container">
        <h2>Something went wrong.</h2>
        <p>Please try again later.</p>
      </div>
    );
  }

  const order = orderData?.order_info || null;
  const timeline = orderData?.timeline || [];

  if (!order) {
    return (
      <div className="order-detail-container">
        <h2>Order not found.</h2>
      </div>
    );
  }

  const currentStage = timeline.find(
    (stage) => stage.is_current === 1
  );

  return (
    <div className="order-detail-container">
      <div className="order-header">
        <h1>Order #{order.order_number || "-"}</h1>
        <p>Created: {order.created_at || "-"}</p>
        <p>Total: ${order.total_price || "0.00"}</p>

        {currentStage && (
          <p className="current-status">
            Current Status: {currentStage.label}
          </p>
        )}

        {order.cover_image_url && (
          <img
            src={
              order.cover_image_url.startsWith("http")
                ? order.cover_image_url
                : `${BASE_URL}${order.cover_image_url}`
            }
            alt="Cover"
            className="order-cover"
          />
        )}
      </div>

      <div className="timeline-section">
        {timeline.map((stage) => {
          const isActive = stage.is_current === 1;
          const isCompleted = stage.is_completed === 1;
          const isCollapsed =
            collapsedStages[stage.status_id];

          return (
            <div
              key={stage.status_id}
              className={`timeline-stage ${
                isCompleted ? "completed" : ""
              } ${isActive ? "active" : ""}`}
            >
              <div className="timeline-header">
                <div className="timeline-dot"></div>
                <h2>{stage.label}</h2>

                <button
                  className="collapse-btn"
                  onClick={() =>
                    setCollapsedStages((prev) => ({
                      ...prev,
                      [stage.status_id]:
                        !prev[stage.status_id]
                    }))
                  }
                >
                  {isCollapsed ? "Expand" : "Collapse"}
                </button>
              </div>

              {!isCollapsed && (
                <>
                  {/* 原 timeline 阶段图片展示保持不变 */}
                  {Array.isArray(stage.images) &&
                    stage.images.length > 0 && (
                      <div className="timeline-images">
                        {stage.images.map((img, index) => {
                          const imagePath =
                            img.customer_image ||
                            img.studio_image;

                          if (!imagePath) return null;

                          const fullUrl =
                            imagePath.startsWith("http")
                              ? imagePath
                              : `${BASE_URL}${imagePath}`;

                          return (
                            <img
                              key={index}
                              src={fullUrl}
                              alt="progress"
                              className="timeline-image"
                            />
                          );
                        })}
                      </div>
                    )}

                  {/* 🔥 只增强这里 */}
                  {stage.messages?.length > 0 && (
                    <div className="timeline-messages">
                      {stage.messages.map(
                        (msg, index) => {
                          const customerImgUrl =
                            msg.customer_image
                              ? msg.customer_image.startsWith("http")
                                ? msg.customer_image
                                : `${BASE_URL}${msg.customer_image}`
                              : null;

                          const studioImgUrl =
                            msg.studio_image
                              ? msg.studio_image.startsWith("http")
                                ? msg.studio_image
                                : `${BASE_URL}${msg.studio_image}`
                              : null;

                          return (
                            <div
                              key={index}
                              className="message-block"
                            >
                              {(msg.customer_message ||
                                customerImgUrl) && (
                                <div className="message customer">
                                  <strong>Client:</strong>

                                  {msg.customer_message && (
                                    <p>
                                      {msg.customer_message}
                                    </p>
                                  )}

                                  {customerImgUrl && (
                                    <img
                                      src={customerImgUrl}
                                      alt="customer upload"
                                      className="chat-image"
                                    />
                                  )}
                                </div>
                              )}

                              {(msg.studio_reply ||
                                studioImgUrl) && (
                                <div className="message studio">
                                  <strong>Studio:</strong>

                                  {msg.studio_reply && (
                                    <p>
                                      {msg.studio_reply}
                                    </p>
                                  )}

                                  {studioImgUrl && (
                                    <img
                                      src={studioImgUrl}
                                      alt="studio upload"
                                      className="chat-image"
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}

                  {isActive && (
                    <div className="image-upload-area">
                      <label className="upload-label">
                        Upload Image:
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          handleImageUpload(
                            e,
                            stage.status_id,
                            order.id
                          )
                        }
                        disabled={uploading}
                      />
                      {uploading && <p>Uploading...</p>}
                    </div>
                  )}

                  {isActive && (
                    <div className="message-input-area">
                      <textarea
                        value={newMessage}
                        onChange={(e) =>
                          setNewMessage(e.target.value)
                        }
                        placeholder="Write your message..."
                        rows={3}
                      />
                      <button
                        onClick={() =>
                          handleSendMessage(
                            stage.status_id,
                            order.id
                          )
                        }
                        disabled={sending}
                      >
                        {sending
                          ? "Sending..."
                          : "Send Message"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}