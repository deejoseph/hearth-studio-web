import { useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import "./OrderDetail.css";
import {
  createRound,
  getOrderDetail
} from "../../api/orderService";
import { uploadImage } from "../../api/uploadService";

const BASE_URL = "https://www.ichessgeek.com/HearthStudio";

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

  const lastChangeRef = useRef("");

  const calcSignature = (data) => {
    if (!data) return "";
    let maxTs = 0;
    let msgCount = 0;
    let imgCount = 0;
    const safeTime = (v) => {
      if (!v) return 0;
      const t = Date.parse(v);
      return Number.isNaN(t) ? 0 : t;
    };

    (data.timeline || []).forEach((stage) => {
      (stage.messages || []).forEach((msg) => {
        msgCount += 1;
        maxTs = Math.max(
          maxTs,
          safeTime(msg.customer_message_at),
          safeTime(msg.studio_reply_at)
        );
      });
      (stage.images || []).forEach((img) => {
        imgCount += 1;
        maxTs = Math.max(
          maxTs,
          safeTime(img.created_at)
        );
      });
    });

    const statusId = data.order_info?.status_id || "";
    return `${statusId}|${maxTs}|${msgCount}|${imgCount}`;
  };

  const fetchOrderDetail = async (opts = {}) => {
    setLoading(true);
    setError(false);

    try {
      const data = await getOrderDetail(id);

      if (data.success && data.order_info) {
        setOrderData(data);
        if (!opts.skipLastChange) {
          lastChangeRef.current = calcSignature(data);
        }

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

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await getOrderDetail(id);
        if (data?.success) {
          const nextSignature = calcSignature(data);
          if (nextSignature !== lastChangeRef.current) {
            setOrderData(data);
            lastChangeRef.current = nextSignature;
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 6000);

    return () => clearInterval(interval);
  }, [id]);

  const fullUrl = (path) => {
  if (!path) return "";

  // 如果已经是完整URL
  if (path.startsWith("http")) return path;

  // 如果已经带 /HearthStudio，直接拼域名
  if (path.startsWith("/HearthStudio")) {
    return `https://www.ichessgeek.com${path}`;
  }

  // 其他情况走标准 BASE_URL
  return `${BASE_URL}${path}`;
};

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
      const data = await createRound({
        order_id: orderId,
        status_id: statusId,
        message: newMessage
      });

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
      const data = await uploadImage(formData);

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

        {/* ===== 顶部产品 & Pattern 区域 ===== */}
<div className="top-preview-section">

  {/* 主产品图 */}
  <div className="preview-box">
    <h3>Final Product</h3>

    {order.cover_image_url ? (
      <img
        src={fullUrl(order.cover_image_url)}
        alt="Product"
        className="preview-img"
        onClick={() =>
          openLightbox(
            [fullUrl(order.cover_image_url)],
            0
          )
        }
      />
    ) : (
      <div className="empty-box">No image</div>
    )}
  </div>

  {/* Present Pattern */}
  <div className="preview-box">
    <h3>Present Pattern</h3>

    {order.pattern_image ? (
      <img
        src={fullUrl(order.pattern_image)}
        alt="Pattern"
        className="preview-img"
        onClick={() =>
          openLightbox(
            [fullUrl(order.pattern_image)],
            0
          )
        }
      />
    ) : (
      <div className="empty-box">
        No pattern selected
      </div>
    )}
  </div>

  {/* Customer Reference（只读） */}
  <div className="preview-box">
    <h3>Customer Upload</h3>

    {order.customer_reference_image ? (
      <img
        src={fullUrl(order.customer_reference_image)}
        alt="Reference"
        className="preview-img"
        onClick={() =>
          openLightbox(
            [fullUrl(order.customer_reference_image)],
            0
          )
        }
      />
    ) : (
      <div className="empty-box">
        No reference image
      </div>
    )}
  </div>
</div>

{/* ===== 预设按钮区 ===== */}
<div className="top-action-buttons">
  <button className="btn-payment disabled">
    Pay Now
  </button>

  <button className="btn-share disabled">
    Share
  </button>
</div>
      </div>

      {/* Timeline */}
      <div className="timeline-section">
        {timeline.map((stage) => {
  const isActive = stage.is_current === 1;
  const isCollapsed = collapsedStages[stage.status_id];

  const customerImages =
    stage.images
      ?.filter((img) => img.customer_image)
      .map((img) => fullUrl(img.customer_image)) || [];

  const studioImages =
    stage.images
      ?.filter((img) => img.studio_image)
      .map((img) => fullUrl(img.studio_image)) || [];

  return (
    <div key={stage.status_id} className="timeline-stage">
      <div className="timeline-header">
        <h2>{stage.label}</h2>

        <button
          onClick={() =>
            setCollapsedStages((prev) => ({
              ...prev,
              [stage.status_id]: !prev[stage.status_id]
            }))
          }
        >
          {isCollapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {/* ===== 图片区 ===== */}
          <div className="image-section">

            {/* 客户图片 */}
            <div className="image-block">
              <h3>Client Uploads</h3>

              <div className="image-grid">
                {customerImages.map((img, index) => (
                  <img
                    key={index}
                    src={img}
                    alt=""
                    className="thumb"
                    onClick={() =>
                      openLightbox(customerImages, index)
                    }
                  />
                ))}
              </div>

              {/* 只有当前阶段可上传 */}
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

            {/* Studio 图片 */}
            {studioImages.length > 0 && (
              <div className="image-block studio">
                <h3>Studio Updates</h3>
                <div className="image-grid">
                  {studioImages.map((img, index) => (
                    <img
                      key={index}
                      src={img}
                      alt=""
                      className="thumb"
                      onClick={() =>
                        openLightbox(studioImages, index)
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ===== 消息区 ===== */}
          <div className="timeline-messages">
            {stage.messages?.map((msg) => (
              <div key={msg.id} className="message-block">
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
            ))}
          </div>

          {/* ===== 阶段冻结提示 ===== */}
          {!isActive && (
            <div className="stage-locked">
              This stage has been completed.
              Communication is now closed.
            </div>
          )}

          {/* ===== 输入区（仅当前阶段）===== */}
          {isActive && (
            <div className="message-input-area">
              <textarea
                value={newMessage}
                onChange={(e) =>
                  setNewMessage(e.target.value)
                }
                placeholder="Write your message..."
              />
              <button
                disabled={sending}
                onClick={() =>
                  handleSendMessage(
                    stage.status_id,
                    order.id
                  )
                }
              >
                {sending ? "Sending..." : "Send"}
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
