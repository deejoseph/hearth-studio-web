import React, { useEffect, useState } from "react";
import { getProductCraftOptions } from "../../api/productService";
import { useNavigate } from "react-router-dom";
import "./Tableware.css"; // 复用同一套样式

const IMAGE_BASE = "https://www.ichessgeek.com/";

export default function Coffeeware() {
  const [craftData, setCraftData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await getProductCraftOptions({
          category: "coffeeware",
        });

        if (res && res.success) {
          setCraftData(res.data);
        }
      } catch (err) {
        console.error("Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <div className="loading">Loading...</div>;

  const groupedByProduct = craftData.reduce((acc, item) => {
    if (!acc[item.product_id]) {
      acc[item.product_id] = {
        name: item.product_name,
        items: [],
      };
    }
    acc[item.product_id].items.push(item);
    return acc;
  }, {});

  return (
    <div className="tableware-page">
      {Object.keys(groupedByProduct).map((productId) => {
        const group = groupedByProduct[productId];

        const startingPrice = Math.min(
          ...group.items.map((item) => Number(item.price))
        );

        return (
          <section key={productId} className="product-section">
            <h2 className="product-title">{group.name}</h2>

            <div className="tableware-grid">
              {group.items.map((item) => (
                <div key={item.id} className="product-card">
                  <img
                    src={IMAGE_BASE + item.image_url}
                    alt={item.craft_name}
                    onClick={() =>
                      setSelectedImage(IMAGE_BASE + item.image_url)
                    }
                  />

                  <h3>{item.craft_name}</h3>

                  <p className="description">
                    {item.description}
                  </p>

                  <p className="price">${item.price}</p>
                </div>
              ))}
            </div>

            <div className="product-footer">
              <p className="starting-price">
                Starting from ${startingPrice}
              </p>

              <button
                className="customize-btn"
                onClick={() => navigate(`/product/${productId}`)}
              >
                Customize
              </button>
            </div>
          </section>
        );
      })}

      {selectedImage && (
        <div
          className="image-modal"
          onClick={() => setSelectedImage(null)}
        >
          <img src={selectedImage} alt="Preview" />
        </div>
      )}
    </div>
  );
}