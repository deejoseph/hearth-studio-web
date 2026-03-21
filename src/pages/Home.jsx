import "./Cover.css";
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
            Hearth Studio Custom Ceramics <br />
            Hand-Carved in Stoneware.
          </h1>
          <p>From fire and earth.</p>
          <a className="hero-btn hero-btn-primary" href="/story">
            WATCH ORDER STORIES
          </a>
          <a className="hero-btn hero-btn-secondary" href="/collection">
            EXPLORE COLLECTION
          </a>
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

      <section className="final-cta">
        <h2>Continue Exploring.</h2>
        <a className="hero-btn dark" href="/customize">
          START YOUR CUSTOM PIECE
        </a>
      </section>
    </div>
  );
};

export default Home;
