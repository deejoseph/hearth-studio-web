import "./Home.css";

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
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
            <a className="btn primary" href="/collection">
              Start a Custom Order
            </a>
            <a className="btn ghost" href="/collection">
              View Gallery
            </a>
          </div>
          <div className="hero-micro">
            Serving U.S. customers · Hand‑engraved · Studio updates
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-card">
            <div className="card-label">Signature Relief</div>
            <div className="card-meta">
              Collaborative design · Kiln‑fired finish
            </div>
          </div>
          <div className="hero-card alt">
            <div className="card-label">Pet Portrait Mug</div>
            <div className="card-meta">
              Hand carved · Studio proofing
            </div>
          </div>
          <div className="hero-orbit" aria-hidden="true" />
        </div>
      </section>

      <section className="steps">
        <div className="section-header">
          <h2>How it works</h2>
          <p>
            Simple steps, clear updates, and room for your input.
          </p>
        </div>
        <div className="steps-grid">
          <div className="step-card">
            <span className="step-index">01</span>
            <h3>Share your idea</h3>
            <p>
              Tell us the story, photos, or details you want to
              preserve in clay.
            </p>
          </div>
          <div className="step-card">
            <span className="step-index">02</span>
            <h3>We craft together</h3>
            <p>
              We shape, carve, and send updates so you can guide
              the process.
            </p>
          </div>
          <div className="step-card">
            <span className="step-index">03</span>
            <h3>Kiln‑fired memory</h3>
            <p>
              The final piece is fired and finished, made to last
              for years.
            </p>
          </div>
        </div>
      </section>

      <section className="showcase">
        <div className="section-header">
          <h2>Recent studio pieces</h2>
          <p>Small batch, hand‑engraved, always one‑of‑one.</p>
        </div>
        <div className="showcase-grid">
          <div className="showcase-card">
            <div className="showcase-image" />
            <div className="showcase-title">Relief Mug</div>
            <div className="showcase-desc">
              Pet portrait in warm stoneware.
            </div>
          </div>
          <div className="showcase-card">
            <div className="showcase-image alt" />
            <div className="showcase-title">Memory Tile</div>
            <div className="showcase-desc">
              Floral linework with gold glaze.
            </div>
          </div>
          <div className="showcase-card">
            <div className="showcase-image deep" />
            <div className="showcase-title">Keepsake Cup</div>
            <div className="showcase-desc">
              Hand‑etched message, smoky finish.
            </div>
          </div>
        </div>
      </section>

      <section className="values">
        <div className="section-header">
          <h2>Why Hearth Studio</h2>
          <p>
            Crafted for meaning, not mass production.
          </p>
        </div>
        <div className="values-grid">
          <div className="value-card">
            <h3>Participatory</h3>
            <p>
              Your input shapes the design at every stage.
            </p>
          </div>
          <div className="value-card">
            <h3>Hand‑engraved</h3>
            <p>
              Each detail is carved by hand, never copied.
            </p>
          </div>
          <div className="value-card">
            <h3>Fired to last</h3>
            <p>
              Kiln‑fired finishes that keep memories intact.
            </p>
          </div>
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
}
