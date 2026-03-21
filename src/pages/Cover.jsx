import "./Home.css";
import cup1 from "../assets/images/cup1.jpg";
import cup2 from "../assets/images/cup2.jpg";
import cup3 from "../assets/images/cup3.jpg";
import carving from "../assets/images/carving.jpg";

const Cover = () => {
  return (
    <main className="home">
      <a className="sr-only" href="/customize">
        Start Your Custom Piece
      </a>
      <section className="story">
        <div className="section-header">
          <h2>Order Stories</h2>
          <p>Each piece begins with a real person, a real memory.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <div className="story-media">
              <img src={carving} alt="Hand carving process" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #28 - Pet Portrait</h3>
              <p>A golden retriever memorialized in green glaze.</p>
              <button className="story-link" type="button">
                Watch on YouTube
              </button>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src={cup1} alt="Relief mug order story" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #31 - Relief Mug</h3>
              <p>A family portrait turned into a daily ritual.</p>
              <button className="story-link" type="button">
                Watch on YouTube
              </button>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src={cup2} alt="Memory tile order story" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #36 - Memory Tile</h3>
              <p>A botanical sketch preserved in ceramic.</p>
              <button className="story-link" type="button">
                Watch on YouTube
              </button>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src={cup3} alt="Keepsake cup order story" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #42 - Keepsake Cup</h3>
              <p>Hand-etched text for a milestone gift.</p>
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
          <p>Tell us what you want to create and we'll guide the next steps.</p>
          <a className="btn primary" href="/customize">
            Start Your Custom Piece
          </a>
        </div>
      </section>
    </main>
  );
};

export default Cover;
