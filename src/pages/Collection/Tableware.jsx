import React, { useEffect, useState } from "react";
import { getProductCraftOptions } from "../../api/productService";
import { useNavigate } from "react-router-dom";
import "./Tableware.css";

const IMAGE_BASE = "https://www.ichessgeek.com/";

export default function Tableware() {
  const [craftData, setCraftData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await getProductCraftOptions({
          category: "tableware",
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

  // 按 product 分组
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

                  {/* 图片 */}
                  <div className="card-image">
                    <img
                      src={IMAGE_BASE + item.image_url}
                      alt={item.craft_name}
                      onClick={() =>
                        setSelectedImage(IMAGE_BASE + item.image_url)
                      }
                    />
                  </div>

                  {/* 内容 */}
                  <div className="card-body">
                    <h3>{item.craft_name}</h3>
                    <p className="description">{item.description}</p>
                  </div>

                  {/* 👇 关键：底部区域 */}
                  <div className="card-footer">
                    <p className="price">${item.price}</p>

                    <button
                      className="customize-btn"
                      onClick={() =>
                        navigate(
                          `/bridge/${item.product_id}/${item.craft_type_id}`,
                          {
                            state: {
                              productId: item.product_id,
                              productName: group.name,
                              craftTypeId: item.craft_type_id,
                              craftName: item.craft_name,
                              price: item.price,
                              imageUrl: IMAGE_BASE + item.image_url,
                            },
                          }
                        )
                      }
                    >
                      Customize {item.craft_name}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="product-footer">
              <p className="starting-price">
                Starting from ${startingPrice}
              </p>
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