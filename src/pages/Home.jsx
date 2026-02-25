import React from "react";
import "./Home.css";
import dragonKiln from "../assets/images/dragon-kiln.jpg";
import carving from "../assets/images/carving.jpg";
import cup from "../assets/images/translucent-cup.jpg";
import dinner from "../assets/images/dinner.jpg";
import cup1 from "../assets/images/cup1.jpg";
import cup2 from "../assets/images/cup2.jpg";
import cup3 from "../assets/images/cup3.jpg";

const Home = () => {
  return (
    <div className="home">

      {/* ================= HERO ================= */}
      <section
        className="hero"
        style={{
          backgroundImage: `url(${dragonKiln})`,
          backgroundPosition: "70% center"
        }}
      >
        <div className="hero-overlay" />
        <div className="hero-content">
          <h1>
            Light carved <br />
            into stoneware.
          </h1>
          <p>From fire and earth.</p>
          <button className="hero-btn">Explore the Collection</button>
        </div>
      </section>

      {/* ================= CRAFT ================= */}
      <section className="split-section">
        <div className="split-image">
          <img src={carving} alt="Carving process" />
        </div>

        <div className="split-text">
          <h2>Where hands meet clay.</h2>
          <p>
            Each line is carved before the flame completes its work.
            The blade meets raw stoneware, shaping patterns
            that only light can reveal.
          </p>
        </div>
      </section>

      {/* ================= LIGHT ================= */}
      <section className="split-section reverse">
        <div className="split-image">
          <img src={cup} alt="Translucent celadon cup" />
        </div>

        <div className="split-text">
          <h2>Carved to reveal light.</h2>
          <p>
            Celadon carries the memory of earth.
            It is light that awakens the carving.
            Hold it to the sun and the design breathes.
          </p>
        </div>
      </section>

      {/* ================= LIFE ================= */}
      <section className="split-section">
        <div className="split-image">
          <img src={dinner} alt="Dinner table scene" />
        </div>

        <div className="split-text">
          <h2>Craft, lived.</h2>
          <p>
            Not confined to tradition, but placed at your table.
            Shared in quiet mornings, admired across warm dinners.
          </p>
        </div>
      </section>

      {/* ================= ART GALLERY ================= */}
      <section className="gallery-grid">
        <img src={cup1} alt="Cup detail" />
        <img src={cup2} alt="Cup detail" />
        <img src={cup3} alt="Cup detail" />
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="final-cta">
        <h2>Bring light to your table.</h2>
        <button className="hero-btn dark">View Collection</button>
      </section>

    </div>
  );
};

export default Home;