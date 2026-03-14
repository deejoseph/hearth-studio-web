import "./Home.css";
import cup1 from "../assets/images/cup1.jpg";
import cup2 from "../assets/images/cup2.jpg";
import cup3 from "../assets/images/cup3.jpg";
import carving from "../assets/images/carving.jpg";

const Home = () => {
  return (
    <main className="home">
      <section
        className="hero"
        style={{ backgroundImage: "url(/public/hearth-studio.jpg)" }}
      >
        <div className="hero-content">
          <p className="eyebrow">Hearth Studio · Custom Ceramics</p>
          <h1>
            Create a ceramic piece with us, not just from us.
          </h1>
          <p className="hero-subtitle">
            A collaborative process that turns your ideas into
            a kiln‑fired memory.
          </p>
          <div className="hero-actions">
            <a className="btn ghost" href="/collection">
              View Gallery
            </a>
          </div>
          <div className="hero-micro">
            Serving U.S. customers · Hand‑engraved · Studio updates
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true" />
      </section>

      <section className="story">
        <div className="section-header">
          <h2>Order Stories</h2>
          <p>
            Each piece begins with a real person, a real memory.
          </p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <div className="story-media">
              <img src={carving} alt="Order story preview" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #28 · Pet Portrait</h3>
              <p>
                A golden retriever memorialized in green glaze.
              </p>
              <button className="story-link" type="button">
                Watch on YouTube
              </button>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src={cup1} alt="Order story preview" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #31 · Relief Mug</h3>
              <p>
                A family portrait turned into a daily ritual.
              </p>
              <button className="story-link" type="button">
                Watch on YouTube
              </button>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src={cup2} alt="Order story preview" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #36 · Memory Tile</h3>
              <p>
                A botanical sketch preserved in ceramic.
              </p>
              <button className="story-link" type="button">
                Watch on YouTube
              </button>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src={cup3} alt="Order story preview" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #42 · Keepsake Cup</h3>
              <p>
                Hand‑etched text for a milestone gift.
              </p>
              <button className="story-link" type="button">
                Watch on YouTube
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="cta">
        <div className="cta-card">
          <h2>Ready to begin?</h2>
          <p>
            Tell us what you want to create and we’ll guide the
            next steps.
          </p>
          <a className="btn primary" href="/customize">
            Start Your Custom Piece
          </a>
        </div>
      </section>
    </main>
  );
};

export default Home;
