import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import "./OrderDetail.css";

const BASE_URL = "https://www.ichessgeek.com";

export default function OrderDetail() {
  const { id } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState({});

  // ⭐ 专业灯箱
  const [lightbox, setLightbox] = useState({
    open: false,
    images: [],
    index: 0
  });

  const fetchOrderDetail = async () => {
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(
        `/api/hearthstudio/v1/get_order_detail.php?id=${id}`
      );
      if (!res.ok) throw new Error("Network error");

      const data = await res.json();

      if (data.success && data.order_info) {
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

  const fullUrl = (path) =>
    path?.startsWith("http") ? path : `${BASE_URL}${path}`;

  const openLightbox = (images, index) => {
    setLightbox({
      open: true,
      images,
      index
    });
  };

  const closeLightbox = () => {
    setLightbox({ open: false, images: [], index: 0 });
  };

  const prevImage = () => {
    setLightbox((prev) => ({
      ...prev,
      index:
        prev.index === 0
          ? prev.images.length - 1
          : prev.index - 1
    }));
  };

  const nextImage = () => {
    setLightbox((prev) => ({
      ...prev,
      index:
        prev.index === prev.images.length - 1
          ? 0
          : prev.index + 1
    }));
  };

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
      alert("Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleImageUpload = async (e, statusId, orderId) => {
    const file = e.target.files[0];
    if (!file) return;

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

  if (loading)
    return <div className="order-detail-container">Loading...</div>;
  if (error)
    return (
      <div className="order-detail-container">
        Error loading order.
      </div>
    );

  const order = orderData?.order_info;
  const timeline = orderData?.timeline || [];
  const currentStage = timeline.find(
    (s) => s.is_current === 1
  );

  return (
    <div className="order-detail-container">
      {/* Header */}
      <div className="order-header">
        <h1>Order #{order.order_number}</h1>
        <p>Created: {order.created_at}</p>
        <p>Total: ${order.total_price}</p>

        {currentStage && (
          <p className="current-status">
            Current Status: {currentStage.label}
          </p>
        )}

        {order.cover_image_url && (
          <div className="product-image-wrapper">
            <img
              src={fullUrl(order.cover_image_url)}
              alt="Product"
              className="product-image"
              onClick={() =>
                openLightbox(
                  [fullUrl(order.cover_image_url)],
                  0
                )
              }
            />
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="timeline-section">
        {timeline.map((stage) => {
          const isActive = stage.is_current === 1;
          const isCollapsed =
            collapsedStages[stage.status_id];

          const customerImages =
            stage.images
              ?.filter((img) => img.customer_image)
              .map((img) =>
                fullUrl(img.customer_image)
              ) || [];

          const studioImages =
            stage.images
              ?.filter((img) => img.studio_image)
              .map((img) =>
                fullUrl(img.studio_image)
              ) || [];

          return (
            <div
              key={stage.status_id}
              className="timeline-stage"
            >
              <div className="timeline-header">
                <h2>{stage.label}</h2>
                <button
                  onClick={() =>
                    setCollapsedStages((prev) => ({
                      ...prev,
                      [stage.status_id]:
                        !prev[stage.status_id]
                    }))
                  }
                >
                  {isCollapsed
                    ? "Expand"
                    : "Collapse"}
                </button>
              </div>

              {!isCollapsed && (
                <>
                  {/* 图片区 */}
                  <div className="image-section">

                    {/* 客户图片区 */}
                    <div className="image-block">
                      <h3>Client Uploads</h3>

                      <div className="image-grid">
                        {customerImages.map(
                          (img, index) => (
                            <img
                              key={index}
                              src={img}
                              alt=""
                              className="thumb"
                              onClick={() =>
                                openLightbox(
                                  customerImages,
                                  index
                                )
                              }
                            />
                          )
                        )}
                      </div>

                      {isActive && (
                        <div className="upload-button">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleImageUpload(
                                e,
                                stage.status_id,
                                order.id
                              )
                            }
                          />
                        </div>
                      )}
                    </div>

                    {/* Studio图片区 */}
                    {studioImages.length > 0 && (
                      <div className="image-block studio">
                        <h3>Studio Updates</h3>
                        <div className="image-grid">
                          {studioImages.map(
                            (img, index) => (
                              <img
                                key={index}
                                src={img}
                                alt=""
                                className="thumb"
                                onClick={() =>
                                  openLightbox(
                                    studioImages,
                                    index
                                  )
                                }
                              />
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 消息区 */}
                  <div className="timeline-messages">
                    {stage.messages?.map(
                      (msg) => (
                        <div
                          key={msg.id}
                          className="message-block"
                        >
                          {msg.customer_message && (
                            <div className="message customer">
                              {msg.customer_message}
                            </div>
                          )}
                          {msg.studio_reply && (
                            <div className="message studio">
                              {msg.studio_reply}
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>

                  {/* 输入区 */}
                  {isActive && (
                    <div className="message-input-area">
                      <textarea
                        value={newMessage}
                        onChange={(e) =>
                          setNewMessage(
                            e.target.value
                          )
                        }
                        placeholder="Write your message..."
                      />
                      <button
                        onClick={() =>
                          handleSendMessage(
                            stage.status_id,
                            order.id
                          )
                        }
                      >
                        Send
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ⭐ 专业灯箱 */}
      {lightbox.open && (
        <div
          className="lightbox-overlay"
          onClick={closeLightbox}
        >
          <button
            className="lightbox-prev"
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
          >
            ‹
          </button>

          <img
            src={lightbox.images[lightbox.index]}
            className="lightbox-image"
            alt=""
          />

          <button
            className="lightbox-next"
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}