import React, { useEffect, useState } from "react";
import { getProductCraftOptions } from "../../api/productService";

const IMAGE_BASE = "https://www.ichessgeek.com/";

export default function HomeDecor() {
  const [craftData, setCraftData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await getProductCraftOptions({
          category: "homedecor"
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

  if (loading) return <div style={{ padding: "40px" }}>Loading...</div>;

  if (!craftData.length)
    return <div style={{ padding: "40px" }}>No products available.</div>;

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
    <div style={{ padding: "40px" }}>
      {Object.keys(groupedByProduct).map((productId) => {
        const group = groupedByProduct[productId];

        return (
          <section key={productId} style={{ marginBottom: "60px" }}>
            <h2 style={{ marginBottom: "20px" }}>{group.name}</h2>

            <div style={{ display: "flex", gap: "30px", flexWrap: "wrap" }}>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    width: "260px",
                    border: "1px solid #eee",
                    borderRadius: "8px",
                    padding: "15px",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
                  }}
                >
                  <img
                    src={IMAGE_BASE + item.image_url}
                    alt={item.craft_name}
                    onClick={() =>
                      setSelectedImage(IMAGE_BASE + item.image_url)
                    }
                    style={{
                      width: "100%",
                      height: "200px",
                      objectFit: "cover",
                      marginBottom: "10px",
                      cursor: "pointer",
                      borderRadius: "6px",
                    }}
                  />

                  <h3>{item.craft_name}</h3>

                  <p style={{ fontSize: "14px", color: "#666" }}>
                    {item.description}
                  </p>

                  <p style={{ fontWeight: "bold", marginTop: "10px" }}>
                    ${item.price}
                  </p>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "pointer",
          }}
        >
          <img
            src={selectedImage}
            alt="Preview"
            style={{
              maxWidth: "90%",
              maxHeight: "90%",
              borderRadius: "10px",
            }}
          />
        </div>
      )}
    </div>
  );
}