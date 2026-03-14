import { useEffect } from "react";
import "./Cover.css";
import dragonKiln from "../assets/images/dragon-kiln.jpg";
import carving from "../assets/images/carving.jpg";
import cup from "../assets/images/translucent-cup.jpg";
import dinner from "../assets/images/dinner.jpg";
import cup1 from "../assets/images/cup1.jpg";
import cup2 from "../assets/images/cup2.jpg";
import cup3 from "../assets/images/cup3.jpg";

const Cover = () => {
  useEffect(() => {
    const anchor = document.getElementById("enter-hearth");
    if (!anchor) return;

    const start = window.scrollY;
    const end =
      anchor.getBoundingClientRect().top +
      window.scrollY -
      window.innerHeight * 0.2;
    const duration = 18000;
    let startTime = null;

    const easeInOut = (t) =>
      t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOut(progress);
      window.scrollTo(0, start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(step);
    };

    const timer = setTimeout(() => {
      requestAnimationFrame(step);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="home">
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
        </div>
      </section>

      <section className="split-section">
        <div className="split-image">
          <img src={carving} alt="Carving process" />
        </div>

        <div className="split-text">
          <h2>Where hands meet clay.</h2>
          <p>
            Each line is carved before the flame completes its
            work. The blade meets raw stoneware, shaping patterns
            that only light can reveal.
          </p>
        </div>
      </section>

      <section className="split-section reverse">
        <div className="split-image">
          <img src={cup} alt="Translucent celadon cup" />
        </div>

        <div className="split-text">
          <h2>Carved to reveal light.</h2>
          <p>
            Celadon carries the memory of earth. It is light that
            awakens the carving. Hold it to the sun and the design
            breathes.
          </p>
        </div>
      </section>

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

      <section className="gallery-grid">
        <img src={cup1} alt="Cup detail" />
        <img src={cup2} alt="Cup detail" />
        <img src={cup3} alt="Cup detail" />
      </section>

      <section className="final-cta" id="enter-hearth">
        <h2>Enter Hearth Studio.</h2>
        <a className="hero-btn dark" href="/home">
          Enter the Studio
        </a>
      </section>
    </div>
  );
};

export default Cover;
