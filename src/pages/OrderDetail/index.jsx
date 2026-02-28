import React from "react";
import "../OrderDetail/OrderDetail.css";

const OrderDetail = () => {
  return (
    <div className="order-detail-container">

      {/* HEADER */}
      <div className="order-header">
        <h1>Order #HS2026-001</h1>
        <p>Client: Sarah Johnson</p>
        <p>Product: Custom Bridge Tea Set</p>
        <p>Status: In Design Stage</p>
        <p>Created: Feb 25, 2026</p>
      </div>

      {/* PROGRESS */}
      <div className="progress-section">
        <h2>Progress</h2>
        <ul className="timeline">
          <li className="completed">Deposit Paid</li>
          <li className="active">Design Draft</li>
          <li className="pending">Crafting</li>
        </ul>
      </div>

      {/* PAYMENT */}
      <div className="payment-section">
        <h2>Payment</h2>

        <div className="payment-card">
          <h3>Deposit</h3>
          <p>$300 - Paid</p>
        </div>

        <div className="payment-card">
          <h3>Final Payment</h3>
          <p>$700 - Pending</p>
          <button>Pay Now</button>
        </div>
      </div>

      {/* DESIGN PREVIEW */}
      <div className="design-preview">
        <h2>Design Preview</h2>
        <img src="/placeholder-design.jpg" alt="Design Preview" />
        <div>
          <button>Confirm Design</button>
          <button>Request Revision</button>
        </div>
      </div>

      {/* COMMUNICATION */}
      <div className="communication-section">
        <h2>Communication</h2>

        <div className="message">
          <p><strong>Client:</strong> Can we adjust the bridge curve?</p>
        </div>

        <div className="message">
          <p><strong>Studio:</strong> Updated draft will be ready tomorrow.</p>
        </div>
      </div>

    </div>
  );
};

export default OrderDetail;