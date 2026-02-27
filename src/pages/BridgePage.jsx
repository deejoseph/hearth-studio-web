import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./BridgePage.css";

const BridgePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const productData = location.state;

  if (!productData) {
    return <div className="bridge-page">No product selected.</div>;
  }

  const { productId, productName, price, imageUrl, craftTypeId, craftName } = productData;

  const [orderStatus] = useState("pending_design");
  const [patterns, setPatterns] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  const [formData, setFormData] = useState({
    is_public: 0,
    expected_date: "",
    craft_type_id: craftTypeId || "",
    pattern_id: "",
    custom_notes: "",
    pattern_type_id: "1",
    base_inscription: "",
  });

  /* ==============================
     Fetch patterns
  ============================== */
  useEffect(() => {
    const fetchPatterns = async () => {
      try {
        const res = await fetch(
          `/api/hearthstudio/v1/product_craft_options/get_product_design_data.php?product_id=${productId}`
        );
        const data = await res.json();
        if (data.success) {
          setPatterns(data.patterns);
        }
      } catch (err) {
        console.error("Error fetching patterns:", err);
      }
    };

    fetchPatterns();
  }, [productId]);

  /* ==============================
     Submit Order (安全修复核心)
  ============================== */
  const handleSubmitOrder = async () => {
    try {

      // 🔒 核心修复逻辑
      const safePatternId =
        craftTypeId === "4" && formData.pattern_type_id === "1"
          ? formData.pattern_id || null
          : null;

      const payload = {
        productId,
        status: "pending_design",
        ...formData,
        pattern_id: safePatternId,   // 👈 强制安全值
      };

      console.log("Submitting order payload:", payload);

      const response = await fetch("/api/hearthstudio/v1/create_order.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        navigate("/customize", {
          state: { newOrderId: result.orderId }
        });
      } else {
        console.error("Order creation failed:", result.message);
      }
    } catch (err) {
      console.error("Error submitting order:", err);
    }
  };

  /* ==============================
     Modal Controls
  ============================== */
  const openModal = (imageUrl) => {
    setSelectedImage(imageUrl);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedImage(null);
  };

  return (
    <div className="bridge-page">

      {/* Product Header */}
      <div className="product-header">
        <div className="product-image">
          <img 
            src={imageUrl} 
            alt={productName} 
            onClick={() => openModal(imageUrl)}
          />
        </div>

        <div className="product-info">
          <h1>{productName}</h1>

          {price ? (
            <h2>Starting from ${price}</h2>
          ) : (
            <h2 className="price-placeholder">
              Price available after design selection
            </h2>
          )}
        </div>
      </div>

      {/* Order Status */}
      <div className="order-status">
        <h3>Order Status: {orderStatus}</h3>
        <p>
          We are awaiting your design details to begin the customization process.
        </p>
      </div>

      {/* Base Inscription */}
      <div className="form-group">
        <label>Base Inscription (Optional)</label>
        <input
          type="text"
          value={formData.base_inscription}
          onChange={(e) =>
            setFormData({ ...formData, base_inscription: e.target.value })
          }
          placeholder="Text to be carved at the bottom of the piece"
        />
      </div>

      {/* Craft Type */}
      <div className="form-group">
        <label>Craft Type</label>
        <input
          type="text"
          value={craftName}
          disabled
        />
      </div>

      {/* Pattern Section */}
      {craftTypeId === "4" && (
        <>
          <div className="form-group">
            <label>Pattern Type</label>
            <select
              value={formData.pattern_type_id}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  pattern_type_id: e.target.value,
                  pattern_id: ""   // 🔒 切换类型时清空 pattern_id
                })
              }
            >
              <option value="1">Preset</option>
              <option value="2">Custom Upload</option>
            </select>
          </div>

          {formData.pattern_type_id === "1" && (
            <>
              <div className="pattern-gallery">
                {patterns.map((pattern) => (
                  <div key={pattern.id} className="pattern-card">
                    <img
                      src={`https://www.ichessgeek.com/HearthStudio${pattern.thumbnail_url}`}
                      alt={pattern.name}
                      onClick={() =>
                        openModal(
                          `https://www.ichessgeek.com/HearthStudio${pattern.thumbnail_url}`
                        )
                      }
                    />
                    <span>{pattern.name}</span>
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Pattern Selection</label>
                <select
                  value={formData.pattern_id}
                  onChange={(e) =>
                    setFormData({ ...formData, pattern_id: e.target.value })
                  }
                >
                  <option value="">Select a Pattern</option>
                  {patterns.map((pattern) => (
                    <option key={pattern.id} value={pattern.id}>
                      {pattern.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {formData.pattern_type_id === "2" && (
            <div className="customize-message">
              <p>Please upload your custom pattern in the next step of customization.</p>
            </div>
          )}
        </>
      )}

      {/* Expected Date */}
      <div className="form-group">
        <label>Latest Needed Date</label>
        <input
          type="date"
          value={formData.expected_date}
          onChange={(e) =>
            setFormData({ ...formData, expected_date: e.target.value })
          }
        />
      </div>

      {/* Public Toggle */}
      <div className="form-group checkbox-group">
        <label>
          <input
            type="checkbox"
            checked={formData.is_public === 1}
            onChange={(e) =>
              setFormData({
                ...formData,
                is_public: e.target.checked ? 1 : 0
              })
            }
          />
          Allow this work to be publicly displayed
        </label>
      </div>

      {/* Customer Notes */}
      <div className="form-group">
        <label>Customer Notes</label>
        <textarea
          rows="4"
          value={formData.custom_notes}
          onChange={(e) =>
            setFormData({ ...formData, custom_notes: e.target.value })
          }
        />
        <p className="hint-text">
          Every handcrafted detail matters. Please describe preferred dimensions, glaze tone, packaging style, intended use, or any reference ideas as clearly as possible. Detailed notes help us shorten the customization process.
        </p>
      </div>

      {/* Submit */}
      <div className="action-buttons">
        <button onClick={handleSubmitOrder} className="submit-btn">
          Continue to Customize
        </button>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content">
            <img src={selectedImage} alt="Selected" />
          </div>
        </div>
      )}
    </div>
  );
};

export default BridgePage;