import { useState, useEffect, useRef, useCallback } from "react";
import "./FamilyHome.css";

const STORY_LINES = [
  "这是一个普通家庭的故事。",
  "一个非专业出身的爸爸，",
  "一个做传统小生意的妈妈，",
  "和一个并非学霸的孩子。",
  "",
  "在AI浪潮席卷一切的时代，",
  "我们用自学的方式在线学习，",
  "引导孩子走上技术路线，",
  "用普通人的方式，活出不一样的可能。",
];

function useTypewriterSound() {
  const audioCtxRef = useRef(null);
  const unlockedRef = useRef(false);

  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    unlockedRef.current = true;
    document.removeEventListener("click", unlock);
    document.removeEventListener("touchstart", unlock);
  }, []);

  useEffect(() => {
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, [unlock]);

  const playClick = useCallback(() => {
    if (!unlockedRef.current) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(800 + Math.random() * 400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.03);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  }, []);

  return playClick;
}

function useTypewriter(lines, speed = 65, pauseBetween = 600) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);
  const charIdx = useRef(0);
  const playClick = useTypewriterSound();

  useEffect(() => {
    let timer;
    const type = () => {
      if (idx.current >= lines.length) {
        setDone(true);
        return;
      }
      const line = lines[idx.current];
      if (line === "") {
        setDisplayed((prev) => prev + "\n");
        idx.current++;
        charIdx.current = 0;
        timer = setTimeout(type, pauseBetween);
        return;
      }
      if (charIdx.current < line.length) {
        const ch = line[charIdx.current];
        setDisplayed((prev) => prev + ch);
        playClick();
        charIdx.current++;
        timer = setTimeout(type, speed);
      } else {
        setDisplayed((prev) => prev + "\n");
        idx.current++;
        charIdx.current = 0;
        timer = setTimeout(type, pauseBetween);
      }
    };
    timer = setTimeout(type, 800);
    return () => clearTimeout(timer);
  }, []);

  return { displayed, done };
}

export default function FamilyHome() {
  const { displayed, done } = useTypewriter(STORY_LINES);
  const heroRef = useRef(null);

  return (
    <div className="family-home">
      {/* ── Navigation ── */}
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          <a href="/education" className="fh-nav-link">教育</a>
          <a href="/chess/" className="fh-nav-link">国际象棋</a>
          <a href="/tech" className="fh-nav-link">技术</a>
          <a href="/business" className="fh-nav-link">小生意</a>
          <a href="/guestbook" className="fh-nav-link">留言板</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="fh-hero" ref={heroRef}>
        <img src="/hero-family-560.webp" alt="" className="fh-hero-image" width="560" height="320" />
        <div className="fh-hero-badge">ichessgeek.com</div>
        <div className="fh-typewriter-container">
          <div className="fh-typewriter-text">
            {displayed}
            {!done && <span className="cursor" />}
          </div>
        </div>
        <p className="fh-hero-subtitle" style={{ animationDelay: done ? "0.5s" : "999s" }}>
          大时代下的普通生活 — 一个家庭的AI时代生存实验
        </p>
        <div className="fh-scroll-hint" style={{ animationDelay: done ? "1.5s" : "999s" }}>
          向下滚动，认识我们
        </div>
      </section>

      {/* ─ Eddie ── */}
      <section className="fh-member fh-member--eddie">
        <div className="fh-member-image">
          <img src="/eddie-840.webp" alt="艾迪" width="840" height="840" loading="lazy" decoding="async" />
        </div>
        <div className="fh-member-content">
          <span className="fh-section-label">DAD</span>
          <h2 className="fh-member-name">艾迪 Eddie</h2>
          <p className="fh-member-role">
            非科班出身的独立开发者 / 国际象棋教练 / AI探索者
          </p>
          <p className="fh-member-desc">
            没有计算机学位，却在AI时代找到了自己的生存方式。
            用自学和实战，独立完成了多个全栈项目，
            同时引导孩子走上技术路线。他相信：普通人也能成为新式手艺人。
          </p>
          <div className="fh-projects">
            <a href="https://cm.ichessgeek.com" className="fh-project-card" target="_blank" rel="noreferrer">
              <div className="proj-icon">🏘️</div>
              <h4>Commoners</h4>
              <p>普通人的生存社区</p>
            </a>
            <a href="https://bc.ichessgeek.com" className="fh-project-card" target="_blank" rel="noreferrer">
              <div className="proj-icon">🔬</div>
              <h4>BreastCommons</h4>
              <p>乳腺健康开源知识库</p>
            </a>
            <a href="https://github.com/deejoseph/ScoreOrbit" className="fh-project-card" target="_blank" rel="noreferrer">
              <div className="proj-icon">♟️</div>
              <h4>ScoreOrbit</h4>
              <p>沪教版高中合格考复习助手，涵盖六大学科，752个知识点，421套试卷</p>
            </a>
            <a href="https://github.com/deejoseph/ChunkaoCompanion" className="fh-project-card" target="_blank" rel="noreferrer">
              <div className="proj-icon"></div>
              <h4>AICompanion</h4>
              <p>本地AI自学系统，知识图谱构建，学员画像分析，提供薄弱点建议与迭代学习路径</p>
            </a>
          </div>
          <div className="fh-toolkit-note">
            <span className="toolkit-icon"></span>
            <p>ScoreOrbit、AICompanion 与 EduRAG 共同组成 AI 学习工具链，覆盖复习、自学、写作全流程</p>
          </div>
          <a href="#" className="fh-book-card">
            <span className="book-icon">📖</span>
            <div className="book-info">
              <h4>《AI父子兵》</h4>
              <p>大时代下的普通生活 · 第一部</p>
              <span className="book-coauthor">艾迪 & 乔 合著</span>
            </div>
          </a>
        </div>
      </section>

      {/* ── Scarlett ── */}
      <section className="fh-member fh-member--scarlett reverse">
        <div className="fh-member-image">
          <img src="/scarlett-840.webp" alt="斯嘉丽" width="840" height="840" loading="lazy" decoding="async" />
        </div>
        <div className="fh-member-content">
          <span className="fh-section-label">MOM</span>
          <h2 className="fh-member-name">斯嘉丽 Scarlett</h2>
          <p className="fh-member-role">
            传统小生意人 / 播客主播 / 生活经济学家
          </p>
          <p className="fh-member-desc">
            经营着传统的小生意，却用最朴素的经济学智慧，
            解读着大时代下的生存法则。她相信：每一个普通人的日常选择里，
            都藏着真正的经济学。
          </p>
          <div className="fh-podcast-grid">
            <a href="https://www.youtube.com/@Scarlett-shi" className="fh-podcast-card" target="_blank" rel="noreferrer">
              <div className="podcast-icon">️</div>
              <h4>斯嘉丽的小生意经济学</h4>
              <p>
                从菜市场的讨价还价到供应链的博弈，
                用真实的小生意案例，讲透经济学的底层逻辑。
              </p>
              <span className="podcast-tag">YouTube</span>
            </a>
            <a href="https://www.xiaoyuzhoufm.com/podcast/6a3be97102183f8be736d9ab" className="fh-podcast-card" target="_blank" rel="noreferrer">
              <div className="podcast-icon"></div>
              <h4>大时代下的普通生活</h4>
              <p>
                一个普通家庭的真实记录。在AI浪潮中，
                如何保持清醒，找到属于自己的节奏。
              </p>
              <span className="podcast-tag">小宇宙</span>
            </a>
            <a href="https://open.spotify.com/show/033WuUuRlvMcqVsQy9BHj6" className="fh-podcast-card" target="_blank" rel="noreferrer">
              <div className="podcast-icon"></div>
              <h4>大时代下的普通生活</h4>
              <p>
                一个普通家庭的真实记录。在AI浪潮中，
                如何保持清醒，找到属于自己的节奏。
              </p>
              <span className="podcast-tag">Spotify</span>
            </a>
          </div>
        </div>
      </section>

      {/* ── HearthStudio (Joint Project) ── */}
      <section className="fh-member fh-member--joint">
        <div className="fh-member-image">
          <img src="/hearthstudio-840.webp" alt="HearthStudio" width="840" height="840" loading="lazy" decoding="async" />
        </div>
        <div className="fh-member-content">
          <span className="fh-section-label">JOINT PROJECT</span>
          <h2 className="fh-member-name">HearthStudio</h2>
          <p className="fh-member-role">
            艾迪 & 斯嘉丽 共同经营 / 私人定制青瓷平台
          </p>
          <p className="fh-member-desc">
            将传统青瓷工艺与现代定制服务结合，打造专属的陶瓷艺术品。
            从设计到烧制，每一步都承载着匠人的温度与心意。
            这是技术与传统手艺的融合，也是家庭协作的见证。
          </p>
          <a href="https://hs.ichessgeek.com" className="fh-hearth-cta" target="_blank" rel="noreferrer">
            访问 HearthStudio →
          </a>
        </div>
      </section>

      {/* ── Qiao ── */}
      <section className="fh-member fh-member--qiao reverse">
        <div className="fh-member-image">
          <img src="/qiao-840.webp" alt="乔" width="840" height="840" loading="lazy" decoding="async" />
        </div>
        <div className="fh-member-content">
          <span className="fh-section-label">KID</span>
          <h2 className="fh-member-name">乔 Joe</h2>
          <p className="fh-member-role">
            非学霸学生 / 自学编程者 / EduRAG 项目发起人
          </p>
          <p className="fh-member-desc">
            不是传统意义上的"好学生"，却在AI时代找到了自己的学习方式。
            用RAG技术重新定义写作辅助，证明了：
            兴趣驱动的学习，比任何补习班都有效。
          </p>
          <div className="fh-projects">
            <a href="#" className="fh-project-card">
              <div className="proj-icon">✍️</div>
              <h4>EduRAG</h4>
              <p>基于RAG技术的K12 AI写作助手</p>
            </a>
          </div>
          <div className="fh-toolkit-note">
            <span className="toolkit-icon">🎯</span>
            <p>ScoreOrbit、AICompanion 与 EduRAG 共同组成 AI 学习工具链，覆盖复习、自学、写作全流程</p>
          </div>
          <a href="#" className="fh-book-card">
            <span className="book-icon">📖</span>
            <div className="book-info">
              <h4>《AI父子兵》</h4>
              <p>大时代下的普通生活 · 第一部</p>
              <span className="book-coauthor">乔 & 艾迪 合著</span>
            </div>
          </a>
        </div>
      </section>

      {/* ── Commoners ── */}
      <section className="fh-section fh-commoners">
        <div className="fh-commoners-inner">
          <div>
            <h2>
              加入 <span>Commoners</span>
            </h2>
            <p className="fh-commoners-desc">
              Commoners 不是一个产品，而是一场实验。
              我们相信，在AI时代，普通人需要的不是被替代，而是被赋能。
              这里汇聚了一群不甘被时代巨轮碾压的人，用技术和协作，
              探索新式手艺人的生存方式。
            </p>
            <div className="fh-mission">
              "不是每个人都能成为精英，但每个人都可以成为自己的手艺人。"
            </div>
            <a href="https://cm.ichessgeek.com" className="fh-commoners-cta" target="_blank" rel="noreferrer">
              了解 Commoners →
            </a>
          </div>
          <div className="fh-comm-principles">
            <div className="fh-comm-principle">
              <div className="principle-icon">🔧</div>
              <h4>技术赋能</h4>
              <p>用AI工具武装普通人</p>
            </div>
            <div className="fh-comm-principle">
              <div className="principle-icon">🤝</div>
              <h4>协作共生</h4>
              <p>社区互助，共同成长</p>
            </div>
            <div className="fh-comm-principle">
              <div className="principle-icon"></div>
              <h4>自学驱动</h4>
              <p>兴趣是最好的老师</p>
            </div>
            <div className="fh-comm-principle">
              <div className="principle-icon">🌱</div>
              <h4>可持续生存</h4>
              <p>不追求暴富，追求活得久</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="fh-footer">
        <p className="fh-footer-quote">
          "大时代不需要每个人都是英雄，只需要每个人都不放弃自己。"
        </p>
        <div className="fh-footer-contact">
          <a href="mailto:edward_dee@ichessgeek.com" className="fh-footer-email">
            edward_dee@ichessgeek.com
          </a>
          <span className="fh-footer-email-sep">|</span>
          <a href="mailto:admin@ichessgeek.com" className="fh-footer-email">
            admin@ichessgeek.com
          </a>
        </div>
        <p className="fh-footer-copy">
          © 2026 ichessgeek.com — 大时代下的普通生活
        </p>
      </footer>
    </div>
  );
}
