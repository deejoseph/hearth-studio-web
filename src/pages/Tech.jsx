import "./Tech.css";

const TECH_BRANCHES = [
  {
    icon: "📊",
    title: "数据领域",
    tagline: "用数据讲故事",
    description:
      "数据采集、清洗、分析与可视化。学会用 Python 处理数据，用 SQL 查询数据库，用图表讲清楚数据背后的故事。数据思维是AI时代的基础能力。",
    tools: ["Python", "Pandas", "SQL", "Tableau"],
    paths: [
      "Python 基础与数据处理",
      "SQL 数据库查询",
      "数据可视化（Matplotlib / Plotly）",
      "数据分析实战项目",
    ],
  },
  {
    icon: "🌐",
    title: "全栈开发",
    tagline: "从零到一做产品",
    description:
      "从前端界面到后端服务，独立完成一个完整的产品。学会把想法变成真正可用的东西，部署上线，让别人能用。这是最直接的技术创业路径。",
    tools: ["React", "Node.js", "数据库", "部署"],
    paths: [
      "HTML / CSS / JavaScript 基础",
      "React 前端开发",
      "Node.js 后端与 API",
      "数据库设计与部署",
    ],
  },
  {
    icon: "📱",
    title: "手机应用",
    tagline: "把产品放进口袋",
    description:
      "iOS / Android 原生或跨平台应用开发。做一个手机上能用的应用，是最接近用户的技术方向。从想法到上架，完整走一遍产品开发流程。",
    tools: ["Swift", "Kotlin", "Flutter", "React Native"],
    paths: [
      "移动端 UI 设计基础",
      "跨平台开发（Flutter / React Native）",
      "原生开发入门（Swift / Kotlin）",
      "应用发布与迭代",
    ],
  },
  {
    icon: "🧠",
    title: "AI 模型训练",
    tagline: "让机器为你工作",
    description:
      "小模型微调、本地部署、RAG 应用开发。不需要从头训练大模型，学会在现有模型基础上微调、部署，构建自己的 AI 应用。这是AI时代最核心的技术能力。",
    tools: ["PyTorch", "HuggingFace", "Ollama", "LangChain"],
    paths: [
      "机器学习基础概念",
      "HuggingFace 模型使用与微调",
      "本地模型部署（Ollama）",
      "RAG 应用开发（LangChain）",
    ],
  },
  {
    icon: "🎨",
    title: "Comfy 工作流",
    tagline: "AI 创意落地",
    description:
      "AI 图像与视频生成的工作流搭建。用 ComfyUI 把 AI 能力变成可复用的生产流程，从一张图到一套方案，从实验到产品。这是AI应用层最实用的技能。",
    tools: ["ComfyUI", "Stable Diffusion", "ControlNet", "IPAdapter"],
    paths: [
      "ComfyUI 节点与工作流基础",
      "图像生成与控制（ControlNet）",
      "风格迁移与角色一致性",
      "视频生成与批量生产流程",
    ],
  },
  {
    icon: "🖨️",
    title: "3D 打印",
    tagline: "从屏幕到手中",
    description:
      "从建模到实物制造的完整流程。用 Fusion 360 设计模型，用切片软件准备打印，用 3D 打印机把数字世界的东西变成实物。这是连接数字与物理世界的桥梁。",
    tools: ["Fusion 360", "切片软件", "3D 打印机", "后处理"],
    paths: [
      "Fusion 360 建模基础",
      "从设计到切片的工作流程",
      "打印材料选择与参数调试",
      "后处理与实物组装",
    ],
  },
];

export default function Tech() {
  return (
    <div className="tech-page">
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          <a href="/" className="fh-nav-link fh-nav-back">← 返回</a>
          <a href="/education" className="fh-nav-link">教育</a>
          <a href="/tech" className="fh-nav-link active">技术</a>
          <a href="/business" className="fh-nav-link">小生意</a>
          <a href="/guestbook" className="fh-nav-link">留言板</a>
        </div>
      </nav>

      <main className="tech-main">
        <div className="tech-hero">
          <span className="tech-hero-tag">TECH BRANCHES</span>
          <h1>技术分支</h1>
          <p className="tech-hero-subtitle">
            学习阶段最大的财富是时间。只要不被分数绑架，你就有大量的自由时间去探索真实的技术世界——直接动手做产品、做项目、做创业实验。
          </p>
        </div>

        <div className="tech-philosophy">
          <p>
            下面这六个方向，每一个都可以从零开始，边学边做，做出真正可用的东西。
            不需要等到"学完"才开始——做的过程就是学的过程。
          </p>
          <p>
            Eddie 自己就是这样走过来的：非科班出身，从国际象棋教练转型为独立开发者，
            用自学和实战，在AI时代找到了自己的生存方式。他把这些方向整理出来，
            帮助每一个想走上技术路线的人，找到适合自己的切入点。
          </p>
        </div>

        <div className="tech-branches">
          {TECH_BRANCHES.map((branch) => (
            <div key={branch.title} className="tech-branch-card">
              <div className="tech-branch-header">
                <span className="tech-branch-icon">{branch.icon}</span>
                <div>
                  <h2>{branch.title}</h2>
                  <span className="tech-branch-tagline">{branch.tagline}</span>
                </div>
              </div>
              <p className="tech-branch-desc">{branch.description}</p>
              <div className="tech-branch-section">
                <h4>工具与平台</h4>
                <div className="tech-branch-tools">
                  {branch.tools.map((tool) => (
                    <span key={tool} className="tech-tool-badge">{tool}</span>
                  ))}
                </div>
              </div>
              <div className="tech-branch-section">
                <h4>学习路径</h4>
                <ul className="tech-branch-paths">
                  {branch.paths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="tech-cta">
          <h3>不确定从哪里开始？</h3>
          <p>
            每个方向都可以独立入门，也可以组合学习。
            如果你不确定自己适合哪个方向，或者想有人陪你一起走，
            可以和 Eddie 约课，他会帮你找到适合自己的学习节奏。
          </p>
          <a href="/education#booking" className="tech-cta-btn">
            跟 Eddie 约课 →
          </a>
        </div>
      </main>

      <footer className="tech-footer">
        <div className="tech-footer-inner">
          <p className="tech-footer-copy">
            &copy; {new Date().getFullYear()} ichessgeek.com
          </p>
          <div className="tech-footer-contact">
            <a href="mailto:edward_dee@ichessgeek.com" className="tech-footer-email">edward_dee@ichessgeek.com</a>
            <span className="tech-footer-email-sep">|</span>
            <a href="mailto:admin@ichessgeek.com" className="tech-footer-email">admin@ichessgeek.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
