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
    pattern_type_id: "1", // Default is Preset
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

  // Handle image click (open modal)
  const openModal = (imageUrl) => {
    setSelectedImage(imageUrl);
    setIsModalOpen(true);
  };

  // Close modal
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
            onClick={() => openModal(imageUrl)} // Open modal on click
          />
        </div>

        <div className="product-info">
          <h1>{productName}</h1>

          {/* ✅ engraving 价格安全显示 */}
          {price ? (
            <h2>Starting from ${price}</h2>
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
          type="text"
          value={craftName} // Display the craft name
          disabled
        />
      </div>

      {/* Only show Pattern Type and Pattern Selection if craft_type_id is 4 */}
      {craftTypeId === "4" && (
        <>
          {/* Pattern Type (Preset or Custom Upload) */}
          <div className="form-group">
            <label>Pattern Type</label>
            <select
              value={formData.pattern_type_id}
              onChange={(e) =>
                setFormData({ ...formData, pattern_type_id: e.target.value })
              }
            >
              <option value="1">Preset</option>
              <option value="2">Custom Upload</option>
            </select>
          </div>

          {/* Display all pattern images when 'Preset' is selected */}
          {formData.pattern_type_id === "1" && (
            <div className="pattern-gallery">
              {patterns.map((pattern) => (
                <div key={pattern.id} className="pattern-card">
                  <img
                    src={`https://www.ichessgeek.com/HearthStudio${pattern.thumbnail_url}`}
                    alt={pattern.name}
                    onClick={() => openModal(`https://www.ichessgeek.com/HearthStudio${pattern.thumbnail_url}`)} // Open modal on click
                  />
                  <span>{pattern.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Display message if 'Custom Upload' is selected */}
          {formData.pattern_type_id === "2" && (
            <div className="customize-message">
              <p>Please upload your custom pattern in the next step of customization.</p>
            </div>
          )}

          {/* Pattern Selection */}
          {formData.pattern_type_id === "1" && (
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
          Let us know your required date and intended use.
        </p>
      </div>

      {/* Submit */}
      <div className="action-buttons">
        <button onClick={handleSubmitOrder} className="submit-btn">
          Continue to Customize
        </button>
      </div>

      {/* Modal for Image Zoom */}
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