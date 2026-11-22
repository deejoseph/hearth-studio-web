import { useState } from "react";
import "./Education.css";
import RadarChart from "./components/RadarChart";

const TABS = [
  { key: "ichessgeek", label: "iChessGeek 理念" },
  { key: "sixstar", label: "六星图教育" },
  { key: "booking", label: "跟Eddie约课" },
  { key: "ai-tools", label: "教育AI工具" },
];

function BookingForm() {
  const [form, setForm] = useState({
    age: "",
    gender: "",
    course: "",
    schedule: "",
    goal: "",
    email: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="edu-booking-form edu-form-submitted">
        <h3>约课登记</h3>
        <p className="edu-form-success">
          已收到您的约课申请，Eddie 会通过邮箱与您联系。
        </p>
      </div>
    );
  }

  return (
    <div className="edu-booking-form">
      <h3>约课登记</h3>
      <form onSubmit={handleSubmit}>
        <div className="edu-form-row">
          <div className="edu-form-field">
            <label htmlFor="book-age">年龄</label>
            <input
              id="book-age"
              type="text"
              placeholder="例如：12岁"
              value={form.age}
              onChange={handleChange("age")}
              required
            />
          </div>
          <div className="edu-form-field">
            <label htmlFor="book-gender">性别</label>
            <select
              id="book-gender"
              value={form.gender}
              onChange={handleChange("gender")}
              required
            >
              <option value="">请选择</option>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
        </div>
        <div className="edu-form-field edu-form-full">
          <label htmlFor="book-course">想学习的课程</label>
          <input
            id="book-course"
            type="text"
            placeholder="例如：Python入门、Chess大师课"
            value={form.course}
            onChange={handleChange("course")}
            required
          />
        </div>
        <div className="edu-form-field edu-form-full">
          <label htmlFor="book-schedule">时间安排</label>
          <input
            id="book-schedule"
            type="text"
            placeholder="例如：每周六下午2点"
            value={form.schedule}
            onChange={handleChange("schedule")}
            required
          />
        </div>
        <div className="edu-form-field edu-form-full">
          <label htmlFor="book-goal">学习目标</label>
          <textarea
            id="book-goal"
            rows="3"
            placeholder="简述你的学习目标或期望"
            value={form.goal}
            onChange={handleChange("goal")}
          />
        </div>
        <div className="edu-form-field edu-form-full">
          <label htmlFor="book-email">电子邮箱</label>
          <input
            id="book-email"
            type="email"
            placeholder="your@email.com"
            value={form.email}
            onChange={handleChange("email")}
            required
          />
        </div>
        <button type="submit" className="edu-form-submit">
          提交约课申请
        </button>
      </form>
    </div>
  );
}

function TabContent({ tab, setActiveTab }) {
  if (tab === "ichessgeek") {
    return (
      <div className="edu-tab-panel">
        <div className="edu-section-header">
          <span className="edu-section-tag">OUR PHILOSOPHY</span>
          <h2>关于 iChessGeek</h2>
          <p className="edu-section-subtitle">
            AI时代的极客成长路线：从棋类思维到技术赋能
          </p>
        </div>
        <div className="edu-body">
          <p>
            我们已经进入AI时代，传统"受教育→求职"的路线正在被彻底改变。
            iChessGeek 的核心理念是：从小开始学习技术，成为借助AI来掌握强大技能的极客族——
            这就是"i"的含义。
          </p>
          <p>
            而 Chess（棋类）是我们提供社交和博弈能力的帮手，让孩子不至于变成传统意义上那么"呆"的极客。
            我们会在孩子小的时候先培养他们下棋，让他们在学棋的过程中学会逻辑思考、
            建立自我学习的闭环，并且学会应对挑战、尊重规则。
          </p>
          <p>
            我们的教育核心，是教你怎样走上技术生存之路——学会用技术解决遇到的问题，
            用技术创造财富，用技术支撑人生。我们不是要让你成为一个技术专家，
            更不是让你去追逐那些虚幻的奖项、证书之类的荣誉。
            技术是工具，生存是目的，生活才是最终的意义。
          </p>
          <p>
            这条路线已经过实践验证：我们培训了超过200名小朋友，
            从学棋开始，用两年时间获得大师称号后，再转向学习计算机技术。
            这条成长路线实验下来非常成功。
          </p>
          <p>
            这个群体将持续学习，互相帮助，一起走向不确定的未来。
          </p>
        </div>

        <div className="edu-timeline-section">
          <h3>成长路线</h3>
          <p className="edu-timeline-subtitle">从爬行到终身学习，技术陪伴每一步</p>
          <div className="edu-timeline">
            <div className="edu-timeline-track">
              <div className="edu-timeline-line"></div>
              <div className="edu-timeline-item">
                <div className="edu-timeline-img-wrap">
                  <img src="/timeline-baby.png" alt="婴儿期" className="edu-timeline-img" />
                </div>
                <span className="edu-timeline-label">满地爬的婴儿</span>
              </div>
              <div className="edu-timeline-item">
                <div className="edu-timeline-img-wrap">
                  <img src="/timeline-preschooler.png" alt="学龄前" className="edu-timeline-img" />
                </div>
                <span className="edu-timeline-label">玩电脑的娃娃</span>
              </div>
              <div className="edu-timeline-item">
                <div className="edu-timeline-img-wrap">
                  <img src="/timeline-chess.png" alt="下棋的儿童" className="edu-timeline-img" />
                </div>
                <span className="edu-timeline-label">下棋的儿童</span>
              </div>
              <div className="edu-timeline-item">
                <div className="edu-timeline-img-wrap">
                  <img src="/timeline-coding.png" alt="编程少年" className="edu-timeline-img" />
                </div>
                <span className="edu-timeline-label">钻研编程的少年</span>
              </div>
              <div className="edu-timeline-item">
                <div className="edu-timeline-img-wrap">
                  <img src="/timeline-product.png" alt="开发产品" className="edu-timeline-img" />
                </div>
                <span className="edu-timeline-label">开发产品的青少年</span>
              </div>
              <div className="edu-timeline-item">
                <div className="edu-timeline-img-wrap">
                  <img src="/timeline-startup.png" alt="创业青年" className="edu-timeline-img" />
                </div>
                <span className="edu-timeline-label">开始创业的准青年</span>
              </div>
              <div className="edu-timeline-item">
                <div className="edu-timeline-img-wrap">
                  <img src="/timeline-learner.png" alt="终身学习" className="edu-timeline-img" />
                </div>
                <span className="edu-timeline-label">终身学习者</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tab === "sixstar") {
    return (
      <div className="edu-tab-panel">
        <div className="edu-section-header">
          <span className="edu-section-tag">SIX STAR MAP</span>
          <h2>六星图教育理念</h2>
          <p className="edu-section-subtitle">
            每个孩子都是独一无二的个体，需要被发现、被鼓励，按照符合他们发展规律的方式去引导
          </p>
        </div>
        <div className="edu-body">
          <p>
            六星图教育的核心，是帮助你发现自己、适应自己，而不是把你塑造成一个完美的人。
            要认识自己的长处，但更要接受自己的短处。没有谁应该把完美作为自己的人生目标，
            而应该把接受自己的普通，作为走向完美自我的开始。
          </p>
          <p>
            我把孩子的天赋划分为三个维度、六种属性，帮助家长更好地理解孩子的特点，
            选择符合他们特征的学习方向，让他们更容易获得成就感，同时也提醒家长
            在引导过程中注意可能出现的问题。
          </p>
          <div className="edu-radar-section">
            <h3>六星图模型</h3>
            <p className="edu-radar-hint">拖动节点或滑动条，观察不同天赋组合的形状</p>
            <RadarChart />
          </div>
          <div className="edu-stars-grid">
            <div className="edu-star-card">
              <span className="edu-star-label">东</span>
              <h4>社会性</h4>
              <p>更符合东方集体主义行为模式的特征，社会性比较强。</p>
            </div>
            <div className="edu-star-card">
              <span className="edu-star-label">西</span>
              <h4>个体性</h4>
              <p>更符合西方个体至上行为模式的特征，追求自由个性。</p>
            </div>
            <div className="edu-star-card">
              <span className="edu-star-label">艺</span>
              <h4>创造性</h4>
              <p>学习和做事时更倾向于创造性，具有理想主义的特征。</p>
            </div>
            <div className="edu-star-card">
              <span className="edu-star-label">技</span>
              <h4>规则性</h4>
              <p>学习和做事时更倾向于规则性，更容易构建严密体系。</p>
            </div>
            <div className="edu-star-card">
              <span className="edu-star-label">身</span>
              <h4>外向体验</h4>
              <p>更倾向于物理世界的体验感，偏外向型的性格。</p>
            </div>
            <div className="edu-star-card">
              <span className="edu-star-label">心</span>
              <h4>内向体验</h4>
              <p>更倾向于精神世界的体验，偏内向型的性格。</p>
            </div>
          </div>
          <p>
            这个六维成长观察模型，我从十年前开始实验，积累了许多心得体会。
            每个孩子在这六个维度上都有不同的倾向，了解这些倾向，
            就能更好地因材施教。
          </p>
        </div>
      </div>
    );
  }

  if (tab === "booking") {
    return (
      <div className="edu-tab-panel">
        <div className="edu-section-header">
          <span className="edu-section-tag">BOOK A LESSON</span>
          <h2>跟 Eddie 约课</h2>
          <p className="edu-section-subtitle">
            不是讲课，是陪跑——帮你找到属于自己的学习节奏
          </p>
        </div>
        <div className="edu-body">
          <p>
            Eddie 不会像传统老师那样给你讲课。他会为你制定学习路线，陪同你学习，
            当你遇到困难时帮你解决，当你走弯路时把你拉回来，当你想放弃时鼓励你坚持。
          </p>
          <p>
            特别是，他会教你怎样用 AI 帮助自己，成为一个自己主导学习进度、
            AI 辅助学习的终身学习者。
          </p>
        </div>

        <div className="edu-courses-section">
          <h3>课程建议</h3>
          <div className="edu-courses-list">
            <div className="edu-course-item">
              <span className="edu-course-age">10岁以前</span>
              <span className="edu-course-desc">建议从 Chess（棋类）开始学习，培养逻辑思维和专注力</span>
            </div>
            <div className="edu-course-item">
              <span className="edu-course-age">10岁 ~ 初中前</span>
              <span className="edu-course-desc">密歇根大学安娜堡分校的 Python、前端开发课程</span>
            </div>
            <div className="edu-course-item">
              <span className="edu-course-age">初中</span>
              <span className="edu-course-desc">范登堡大学的 AI 系列课程、Google 的 IT 课程、IBM 的数据分析课程</span>
            </div>
            <div className="edu-course-item">
              <span className="edu-course-age">高中</span>
              <span className="edu-course-desc">斯坦福大学的数学思维导论、MIT 的概率统计学、Meta 的全栈开发、吴恩达的机器学习与深度学习课程</span>
            </div>
            <div className="edu-course-item">
              <span className="edu-course-age">其他</span>
              <span className="edu-course-desc">PBL 课程——只要你有项目开发的想法和创意，就可以找 Eddie 帮助你一起完成项目开发过程</span>
            </div>
            <div className="edu-course-item">
              <span className="edu-course-age">其他</span>
              <span className="edu-course-desc">Comfy 工作流——AI应用落地的课程，学会用 ComfyUI 搭建实际可用的AI应用工作流</span>
            </div>
            <div className="edu-course-item">
              <span className="edu-course-age">其他</span>
              <span className="edu-course-desc">安卓应用开发——从零开始构建自己的 Android 应用</span>
            </div>
            <div className="edu-course-item">
              <span className="edu-course-age">其他</span>
              <span className="edu-course-desc">3D 打印——主推 Fusion 360 建模课程，从设计到打印的完整流程</span>
            </div>
          </div>
        </div>

        <BookingForm />
      </div>
    );
  }

  if (tab === "ai-tools") {
    return (
      <div className="edu-tab-panel">
        <div className="edu-section-header">
          <span className="edu-section-tag">AI IN EDUCATION</span>
          <h2>教育 AI 工具</h2>
          <p className="edu-section-subtitle">
            三个开源工具 + 一个在线工具箱，组成你的 AI 学习系统
          </p>
        </div>
        <div className="edu-body">
          <p>
            Eddie 从来不想用一个教学大纲来定义教学，因为现在技术发展太快了，
            学科建设的速度远远跟不上技术进化的速度。所以，Eddie 只做两件事：
            一件事是教你怎样成为一个终身学习者——这是 iChessGeek 和六星图关注的事；
            另一件事就是开发一些 AI 教育工具，分享给学习者们使用。
          </p>
          <p>
            下面三个 AI 工具组成了一个完整的学习系统，覆盖从快速了解一门学科、
            系统学习一门学科，到攻克学习难点的全过程。
            此外还有一个在线编程学习工具箱：不用安装部署，打开浏览器就能动手实验。
          </p>
        </div>

        <div className="edu-ai-tools">
          <div className="edu-ai-tool">
            <div className="edu-ai-tool-header">
              <span className="edu-ai-tool-badge">快速了解</span>
              <h3>ScoreOrbit</h3>
              <p className="edu-ai-tool-tagline">快速了解一门学科的工具</p>
            </div>
            <p className="edu-ai-tool-desc">
              ScoreOrbit 是一个本地化的学科速览工具，帮助你快速建立对一门学科的整体认知。
              它涵盖多个学科的知识考点，支持搜索、统计学习进度，
              让你在最短的时间内了解一门学科的核心框架和知识脉络。
            </p>
            <div className="edu-ai-tool-img">
              <img src="/scoreorbit-ui.png" alt="ScoreOrbit 界面截图" />
            </div>
            <div className="edu-ai-tool-links">
              <a href="https://github.com/deejoseph/ScoreOrbit" target="_blank" rel="noopener noreferrer" className="edu-ai-tool-link">
                访问 GitHub 仓库 →
              </a>
            </div>
          </div>

          <div className="edu-ai-tool">
            <div className="edu-ai-tool-header">
              <span className="edu-ai-tool-badge">系统学习</span>
              <h3>AICompanion</h3>
              <p className="edu-ai-tool-tagline">系统学习一门学科的工具</p>
            </div>
            <p className="edu-ai-tool-desc">
              AICompanion 是一个本地 AI 驱动的自学系统，帮你构建完整的学习闭环：
              从资料收集、知识图谱构建、题库映射，到学习者画像、薄弱点分析和迭代复习建议。
              所有数据本地存储，不依赖云服务，真正做到自主学习。
            </p>
            <div className="edu-ai-tool-imgs">
              <img src="/aicompanion-home.png" alt="AICompanion 首页" />
              <img src="/aicompanion-graph.png" alt="AICompanion 知识图谱" />
            </div>
            <div className="edu-ai-tool-links">
              <a href="https://github.com/deejoseph/ChunkaoCompanion" target="_blank" rel="noopener noreferrer" className="edu-ai-tool-link">
                访问 GitHub 仓库 →
              </a>
            </div>
          </div>

          <div className="edu-ai-tool">
            <div className="edu-ai-tool-header">
              <span className="edu-ai-tool-badge">攻克难点</span>
              <h3>EduRAG</h3>
              <p className="edu-ai-tool-tagline">专门针对学习中难点的工具</p>
            </div>
            <p className="edu-ai-tool-desc">
              EduRAG 基于 RAG（检索增强生成）技术，是一个本地化的智能写作辅助系统。
              它提供写作训练、强化练习、作品集管理、语义检索、热点预测和成长日志等功能，
              帮助学习者攻克学习中最难啃的骨头。内置超过 28,000 个知识片段的向量检索，
              让 AI 真正理解你的学习内容。
            </p>
            <div className="edu-ai-tool-img">
              <img src="/edurag-home.png" alt="EduRAG 界面截图" />
            </div>
            <div className="edu-ai-tool-links">
              <a href="https://github.com/deejoseph/EduRAG" target="_blank" rel="noopener noreferrer" className="edu-ai-tool-link">
                访问 GitHub 仓库 →
              </a>
            </div>
          </div>

          <div className="edu-ai-tool">
            <div className="edu-ai-tool-header">
              <span className="edu-ai-tool-badge">动手实验</span>
              <h3>编程学习工具箱</h3>
              <p className="edu-ai-tool-tagline">打开浏览器就能用的可视化实验工具</p>
            </div>
            <p className="edu-ai-tool-desc">
              编程学习工具箱把位运算、指针与内存、补码、运算符优先级、递归调用栈、
              排序动画、结构体对齐和动态内存管理这些抽象概念，
              变成可以点击、逐步演示的可视化实验。
              无需安装，打开浏览器就能动手验证自己的想法，数据不出浏览器。
            </p>
            <div className="edu-ai-tool-img">
              <img src="/edu-tools-preview.png" alt="编程学习工具箱界面截图" />
            </div>
            <div className="edu-ai-tool-links">
              <a href="/edu-tools/" target="_blank" rel="noopener noreferrer" className="edu-ai-tool-link">
                在线使用 →
              </a>
            </div>
          </div>
        </div>

        <div className="edu-ai-help">
          <p>
            如果你在部署或使用这些工具时遇到任何问题，欢迎在
            <a href="/guestbook">留言板</a>留言，或给 Eddie 发电子邮件
            （<a href="mailto:edward_dee@ichessgeek.com">edward_dee@ichessgeek.com</a>）
            寻求帮助。你也可以直接<a href="#booking" onClick={(e) => { e.preventDefault(); setActiveTab("booking"); }}>跟 Eddie 约课</a>，
            让他手把手带你上手。
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default function Education() {
  const [activeTab, setActiveTab] = useState("ichessgeek");

  return (
    <div className="edu-page">
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          <a href="/" className="fh-nav-link fh-nav-back">← 返回</a>
          <a href="/education" className="fh-nav-link active">教育</a>
          <a href="/tech" className="fh-nav-link">技术</a>
          <a href="/business" className="fh-nav-link">小生意</a>
          <a href="/guestbook" className="fh-nav-link">留言板</a>
        </div>
      </nav>

      <main className="edu-main">
        <div className="edu-hero">
          <span className="edu-hero-tag">EDUCATION</span>
          <h1>教育</h1>
          <p>
            在AI时代，教育的边界正在被重新定义。
            我们相信，每个普通家庭都能找到属于自己的教育路径。
          </p>
        </div>

        <div className="edu-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`edu-tab ${activeTab === t.key ? "active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <TabContent tab={activeTab} setActiveTab={setActiveTab} />
      </main>

      <footer className="edu-footer">
        <div className="edu-footer-inner">
          <p className="edu-footer-copy">
            &copy; {new Date().getFullYear()} ichessgeek.com
          </p>
          <div className="edu-footer-contact">
            <a href="mailto:edward_dee@ichessgeek.com" className="edu-footer-email">edward_dee@ichessgeek.com</a>
            <span className="edu-footer-email-sep">|</span>
            <a href="mailto:admin@ichessgeek.com" className="edu-footer-email">admin@ichessgeek.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
