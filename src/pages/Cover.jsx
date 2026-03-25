import "./Home.css";
import cup3 from "../assets/images/cup3.jpg";

const Cover = () => {
  return (
    <main className="home">
      <section className="story">
        <div className="section-header">
          <h2>Order Stories</h2>
          <p>Each piece begins with a real person, a real memory.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <div className="story-media">
              <img src="/pet-portrait.jpg" alt="Pet portrait order story" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #28 - Pet Portrait</h3>
              <p>A golden retriever memorialized in green glaze.</p>
              <a
                className="story-link"
                href="https://www.youtube.com/watch?v=_voqLeXDNTg"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Full Story
              </a>
              <a
                className="story-link story-moments"
                href="https://www.youtube.com/playlist?list=PL8Eui6FZ9u0QuCAiGmDGZWvBLyTIDlg3D"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Moments
              </a>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src="/wedding-gift.jpg" alt="Wedding gift order story" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #38 - Wedding Gift</h3>
              <p>A handcrafted keepsake created for a wedding celebration.</p>
              <a
                className="story-link"
                href="https://www.youtube.com/watch?v=GCXAOyTNrQk"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Full Story
              </a>
              <a
                className="story-link story-moments"
                href="https://www.youtube.com/playlist?list=PL8Eui6FZ9u0TuHRrBNjWRH1E_I6aSxH72"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Moments
              </a>
            </div>
          </article>
          <article className="story-card">
            <div className="story-media">
              <img src="/lamp.jpg" alt="Order #45 story" />
              <span className="story-badge">Coming Soon</span>
            </div>
            <div className="story-body">
              <h3>Order #45 &ndash; A Light That Understands</h3>
              <p>
                A thoughtful ceramic lamp designed for a father who refuses to
                compromise on elegance&mdash;and a daughter who refuses to give up on him.
              </p>
              <a
                className="story-link"
                href="https://youtu.be/LAs87W0PyYY"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Full Story
              </a>
              <a
                className="story-link story-moments"
                href="https://www.youtube.com/playlist?list=PL8Eui6FZ9u0QP0PpTB-ndY2ETN-dGJ2k6"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Moments
              </a>
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
              <a
                className="story-link"
                href="https://www.youtube.com/watch?v=DWcJFNfaw9c"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Full Story
              </a>
              <a
                className="story-link story-moments"
                href="https://www.youtube.com/playlist?list=PLrAXtmRdnEQx8i9HfJCH0z8G9z0y8q5b2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch Moments
              </a>
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
