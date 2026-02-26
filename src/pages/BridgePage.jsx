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

  const { productId, productName, startingPrice, imageUrl } = productData;

  const [orderStatus] = useState("pending_design");
  const [patternThumb, setPatternThumb] = useState(null);
  const [patterns, setPatterns] = useState([]);

  const [formData, setFormData] = useState({
    is_public: 0,
    expected_date: "",
    craft_type_id: "",
    pattern_type_id: "",
    pattern_id: "",
    custom_notes: ""
  });

  // Fetch patterns from the backend when the page loads
  useEffect(() => {
    const fetchPatterns = async () => {
      try {
        const res = await fetch(
          `/api/hearthstudio/v1/product_craft_options/get_product_design_data.php?product_id=${productId}`
        );
        const data = await res.json();
        if (data.success) {
          setPatterns(data.patterns); // Store the patterns data
        }
      } catch (err) {
        console.error("Error fetching patterns:", err);
      }
    };

    fetchPatterns();
  }, [productId]);

  // 🔹 Fetch pattern thumbnail when pattern_id changes
  useEffect(() => {
    if (!formData.pattern_id) {
      setPatternThumb(null);
      return;
    }

    const fetchPatternThumb = async () => {
      try {
        const res = await fetch(
          `/api/hearthstudio/v1/get_pattern_thumb.php?id=${formData.pattern_id}`
        );
        const data = await res.json();
        if (data.success) {
          setPatternThumb(data.thumbnail_url);
        }
      } catch (err) {
        console.error("Error fetching pattern thumbnail:", err);
      }
    };

    fetchPatternThumb();
  }, [formData.pattern_id]);

  const handleSubmitOrder = async () => {
    try {
      const response = await fetch("/api/hearthstudio/v1/create_order.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productId,
          status: "pending_design",
          ...formData
        })
      });

      const result = await response.json();

      if (result.success) {
        navigate(`/customize/${result.orderId}`);
      } else {
        console.error("Order creation failed:", result.message);
      }
    } catch (err) {
      console.error("Error submitting order:", err);
    }
  };

  return (
    <div className="bridge-page">
      {/* Product Header */}
      <div className="product-header">
        <div className="product-image">
          <img src={imageUrl} alt={productName} />
        </div>

        <div className="product-info">
          <h1>{productName}</h1>

          {/* ✅ engraving 价格安全显示 */}
          {startingPrice ? (
            <h2>Starting from ${startingPrice}</h2>
          ) : (
            <h2 className="price-placeholder">Price available after design selection</h2>
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

      {/* Craft Type */}
      <div className="form-group">
        <label>Craft Type</label>
        <input
          type="number"
          value={formData.craft_type_id}
          onChange={(e) =>
            setFormData({ ...formData, craft_type_id: e.target.value })
          }
        />
      </div>

      {/* Pattern Type */}
      <div className="form-group">
        <label>Pattern Type</label>
        <input
          type="number"
          value={formData.pattern_type_id}
          onChange={(e) =>
            setFormData({ ...formData, pattern_type_id: e.target.value })
          }
        />
      </div>

      {/* Pattern Selection */}
      <div className="form-group">
        <label>Pattern Selection</label>
        <input
          type="number"
          value={formData.pattern_id}
          onChange={(e) =>
            setFormData({ ...formData, pattern_id: e.target.value })
          }
        />

        {/* ✅ Pattern Cards */}
        {patterns.length > 0 && (
          <div className="pattern-selection">
            {patterns.map((pattern) => (
              <div key={pattern.id} className="pattern-card">
                <img
                  src={`https://www.ichessgeek.com/HearthStudio${pattern.thumbnail_url}`}
                  alt={pattern.name}
                  onClick={() =>
                    setFormData({ ...formData, pattern_id: pattern.id })
                  }
                />
                <span>{pattern.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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
          Let us know your required date and intended use.
        </p>
      </div>

      {/* Submit */}
      <div className="action-buttons">
        <button onClick={handleSubmitOrder} className="submit-btn">
          Continue to Customize
        </button>
      </div>
    </div>
  );
};

export default BridgePage;