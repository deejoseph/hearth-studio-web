import "./IchessgeekHome.css";

export default function Home() {
  return (
    <div className="ichessgeek">
      {/* ── Hero ── */}
      <section className="ik-hero">
        <span className="ik-hero-badge">ichessgeek.com</span>
        <h1>
          大时代之下，<br />
          做<span className="highlight">新式手艺人</span>
        </h1>
        <p className="ik-hero-desc">
          时代的巨轮不会停下，但你可以学会驾驭它。
          借助 AI 技术，把知识变成手艺，把技能变成生存方式。
          不依赖平台，不困于岗位——用技术武装自己，走出一条属于普通人的路。
        </p>
        <div className="ik-hero-quote">
          "手艺人是饿不死的。"<br />
          <small style={{ fontSize: 14, color: "var(--text-dim)", fontStyle: "normal" }}>
            —— 只是今天的手艺，不再是一把油纸伞
          </small>
        </div>
      </section>

      {/* ── Commoners 特别推荐 ── */}
      <section className="ik-section ik-commoners">
        <div className="ik-commoners-inner">
          <div className="ik-commoners-text">
            <span className="ik-tag">核心理念</span>
            <h2>Commoners<br />普通人的生存共同体</h2>
            <p>
              工业时代的人生路径正在断裂。失业、裁员、行业消失——
              普通人最紧迫的不是"找什么工作"，而是怎么活下去。
            </p>
            <div className="ik-mission">
              让普通人先活下来，再以平等的方式一起走。
            </div>
            <p>
              Commoners 不是一个公司，不是一个平台。
              它是一群普通人用各自的手艺，组成生存共同体——
              共享资源、降低生存成本、平等协作、有活一起干、干完回家。
            </p>
          </div>
          <div className="ik-commoners-cards">
            <div className="ik-comm-card">
              <div className="comm-icon">🏠</div>
              <h4>生存优先</h4>
              <p>先活下来。共享资源，用能力交换代替金钱交易。</p>
            </div>
            <div className="ik-comm-card">
              <div className="comm-icon">🤝</div>
              <h4>平等互助</h4>
              <p>没有老板，没有层级。全员投票，一致同意。</p>
            </div>
            <div className="ik-comm-card">
              <div className="comm-icon">🔧</div>
              <h4>手艺重组</h4>
              <p>会做饭、会写代码、会修东西——都是无价的手艺。</p>
            </div>
            <div className="ik-comm-card">
              <div className="comm-icon">🌱</div>
              <h4>不创业，接任务</h4>
              <p>像手艺人行会——有活一起干，干完回到平等的生活中。</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 子站导航 ── */}
      <section className="ik-section">
        <h2 className="ik-section-title">我们的实践</h2>
        <p className="ik-section-sub">每个站点都是一次真实的探索</p>
        <div className="ik-sites-grid">
          <a
            className="ik-site-card"
            href="https://cm.ichessgeek.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="site-icon cm">🌿</div>
            <h3>Commoners</h3>
            <p>普通人生存共同体。平等协作，先活下来再一起走。</p>
            <span className="site-link">cm.ichessgeek.com →</span>
          </a>
          <a
            className="ik-site-card"
            href="https://bc.ichessgeek.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="site-icon bc">🎀</div>
            <h3>BreastCommons</h3>
            <p>乳腺癌匿名互助平台。用技术让每个声音被听见。</p>
            <span className="site-link">bc.ichessgeek.com →</span>
          </a>
          <div className="ik-site-card">
            <div className="site-icon edu">📚</div>
            <h3>EduRAG</h3>
            <p>AI 智能写作助手。RAG + 本地大模型，数据不出校园。</p>
            <span className="site-link">本地部署 · 即将上线</span>
          </div>
          <a
            className="ik-site-card"
            href="https://hs.ichessgeek.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="site-icon hs">🏺</div>
            <h3>HearthStudio</h3>
            <p>手工陶瓷定制工坊。从想法到窑烧的全程协作。</p>
            <span className="site-link">hs.ichessgeek.com →</span>
          </a>
        </div>
      </section>

      {/* ── 内容版块 ── */}
      <section className="ik-section">
        <h2 className="ik-section-title">新式手艺人的四条路</h2>
        <p className="ik-section-sub">技术是武器，教育是火种，生意是口粮，自由是方向</p>
        <div className="ik-pillars-grid">
          <div className="ik-pillar-card">
            <div className="ik-pillar-icon tech">💻</div>
            <h3>技术分享</h3>
            <p>
              AI 实战、RAG 知识库搭建、全栈开发。
              不教理论，只讲能用的技术。
            </p>
            <div className="pillar-tags">
              <span className="pillar-tag">AI 实战</span>
              <span className="pillar-tag">RAG</span>
              <span className="pillar-tag">全栈开发</span>
            </div>
          </div>
          <div className="ik-pillar-card">
            <div className="ik-pillar-icon edu">🎓</div>
            <h3>教育分享</h3>
            <p>
              让学习回归真实问题。
              写作训练、智能辅导、成长追踪。
            </p>
            <div className="pillar-tags">
              <span className="pillar-tag">写作训练</span>
              <span className="pillar-tag">AI 辅导</span>
              <span className="pillar-tag">成长记录</span>
            </div>
          </div>
          <div className="ik-pillar-card">
            <div className="ik-pillar-icon biz">🧮</div>
            <h3>小生意经</h3>
            <p>
              普通人的生存经济学。
              低成本启动、技术降本、一人公司方法论。
            </p>
            <div className="pillar-tags">
              <span className="pillar-tag">低成本创业</span>
              <span className="pillar-tag">一人公司</span>
              <span className="pillar-tag">技术降本</span>
            </div>
          </div>
          <div className="ik-pillar-card">
            <div className="ik-pillar-icon nomad">🌍</div>
            <h3>数字游民</h3>
            <p>
              不被地点绑定的生存方式。
              远程协作、自由职业、共同体生活。
            </p>
            <div className="pillar-tags">
              <span className="pillar-tag">远程协作</span>
              <span className="pillar-tag">自由职业</span>
              <span className="pillar-tag">共同体</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ik-cta">
        <div className="ik-cta-box">
          <h2>路不是等出来的</h2>
          <p>
            如果前面没有路，那就自己开一条。
            加入我们，一起探索普通人在大时代的生存方式。
          </p>
          <a
            className="ik-cta-btn"
            href="https://cm.ichessgeek.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            了解 Commoners →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="ik-footer">
        © 2026 ichessgeek.com · 大时代下的普通生活
      </footer>
    </div>
  );
}
