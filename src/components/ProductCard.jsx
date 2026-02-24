import { Link } from "react-router-dom";

export default function ProductCard({ product }) {
  return (
    <div className="product-card">
      <Link to={`/product/${product.id}`}>

        <div className="product-image">
          <img 
            src={`/images/products/${product.id}.jpg`} 
            alt={product.name} 
          />
        </div>

        <div className="product-info">
          <h3>{product.name}</h3>
          <p className="product-description">
            {product.description}
          </p>
          <p className="product-price">
            €{product.base_price}
          </p>
        </div>

      </Link>
    </div>
  );
}