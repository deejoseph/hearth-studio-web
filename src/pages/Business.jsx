import "./Business.css";

const BUSINESS_AREAS = [
  {
    icon: "💡",
    title: "技术应用",
    tagline: "让技术为生意服务",
    description:
      "把现成的技术工具用到你的生意里。不需要自己开发，只需要知道什么工具能解决什么问题。局域网络建设让团队协作更高效，官网开发让客户找到你，数据分析让你看清生意的真实状况，趋势预测帮你提前布局。",
    examples: [
      { name: "局域网络建设", desc: "搭建高效的内部网络，让团队协作更顺畅" },
      { name: "官网开发", desc: "让客户在搜索引擎中找到你，建立线上信任" },
      { name: "数据分析", desc: "用数据看清生意的真实状况，不再凭感觉决策" },
      { name: "趋势预测", desc: "借助AI分析市场走向，提前布局下一步" },
    ],
  },
  {
    icon: "⚙️",
    title: "技术改造",
    tagline: "用AI重塑工作流程",
    description:
      "把现有的工作流程数字化、AI化、自动化。不是推翻重来，而是在现有基础上逐步升级。让重复的工作交给机器，让人专注于创造性的高价值环节。每一个工作岗位都可以被AI增强，每一个运营流程都可以被自动化。",
    examples: [
      { name: "数字化工作流程", desc: "把纸质流程搬到线上，减少人为错误和等待时间" },
      { name: "AI化工作岗位", desc: "用AI工具增强每个岗位的工作效率" },
      { name: "自动化运营项目", desc: "让系统自动处理重复性任务，释放人力" },
      { name: "智能客服与营销", desc: "用AI处理客户咨询，精准触达目标用户" },
    ],
  },
  {
    icon: "🚀",
    title: "技术创新",
    tagline: "打破地域限制",
    description:
      "借助AI和互联网技术，把传统上无法直接销往海外的产品实现全球直销。这是这个时代给予普通人最大的礼包——你不需要是大企业，不需要有海外办事处，只需要一个好产品和一套数字化销售体系。",
    examples: [
      { name: "青瓷私人定制", desc: "传统青瓷工艺 + 在线定制系统，全球直销" },
      { name: "眼镜远程定制", desc: "远程验光 + 个性化镜框设计，跨境交付" },
      { name: "手工艺品出海", desc: "用AI翻译、AI客服、AI营销打通海外市场" },
      { name: "文化产品全球化", desc: "把中国传统文化产品卖给全世界的消费者" },
    ],
  },
  {
    icon: "🔬",
    title: "产品研发",
    tagline: "AI + 实体，创造新品类",
    description:
      "将AI技术与实体产品结合，创造出全新的产品品类和商业模式。这不是纯软件创业，而是把技术融入真实世界的产品——教育机器人、医疗辅助设备、手工艺生产自动化，每一个方向都是技术与实业的结合。",
    examples: [
      { name: "AI教育机器人", desc: "结合AI的智能教育硬件，辅助儿童学习" },
      { name: "医疗辅助设备", desc: "AI驱动的康复、监测、辅助诊断设备" },
      { name: "手工艺生产自动化", desc: "用机器人辅助传统工艺，提升产能和一致性" },
      { name: "智能家居产品", desc: "AI + 传统制造业，打造智能化家居产品" },
    ],
  },
];

export default function Business() {
  return (
    <div className="biz-page">
      <nav className="fh-nav">
        <div className="fh-nav-inner">
          <a href="/" className="fh-nav-link fh-nav-back">← 返回</a>
          <a href="/education" className="fh-nav-link">教育</a>
          <a href="/tech" className="fh-nav-link">技术</a>
          <a href="/business" className="fh-nav-link active">小生意</a>
          <a href="/guestbook" className="fh-nav-link">留言板</a>
        </div>
      </nav>

      <main className="biz-main">
        <div className="biz-hero">
          <span className="biz-hero-tag">SMALL BUSINESS</span>
          <h1>小生意</h1>
          <p className="biz-hero-subtitle">
            在AI技术革命爆发的时代，如何将技术应用到现实生意领域，是我们最想探索的事。
            这也是时代给予普通人最大的礼包——你不需要是大企业，不需要风投，只需要一个好想法和一双愿意动手的手。
          </p>
        </div>

        <div className="biz-philosophy">
          <p>
            Eddie 和斯嘉丽，一个是不懂编程的独立开发者，一个是做传统小生意的老板娘。
            他们的组合，本身就是"技术 + 实业"的实验。HearthStudio 青瓷定制平台，
            就是技术创新的一个真实案例——用数字化手段把传统青瓷卖到全世界。
          </p>
          <p>
            我们相信，每一个普通的小生意，都有被AI升级的可能。
            不需要颠覆，只需要一点点改变，就能带来巨大的效率提升和新的商业机会。
          </p>
        </div>

        <div className="biz-areas">
          {BUSINESS_AREAS.map((area) => (
            <div key={area.title} className="biz-area-card">
              <div className="biz-area-header">
                <span className="biz-area-icon">{area.icon}</span>
                <div>
                  <h2>{area.title}</h2>
                  <span className="biz-area-tagline">{area.tagline}</span>
                </div>
              </div>
              <p className="biz-area-desc">{area.description}</p>
              <div className="biz-area-examples">
                <h4>实践方向</h4>
                <div className="biz-examples-grid">
                  {area.examples.map((ex) => (
                    <div key={ex.name} className="biz-example-item">
                      <span className="biz-example-name">{ex.name}</span>
                      <span className="biz-example-desc">{ex.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="biz-cta">
          <h3>有具体的小生意想法？</h3>
          <p>
            如果你正在经营一个小生意，想用AI技术来提升效率、拓展市场、或者开发新产品，
            欢迎和 Eddie 聊聊。他会帮你分析哪些环节可以用技术优化，
            哪些想法可以落地实现，怎样用最小的成本开始你的AI生意实验。
          </p>
          <div className="biz-cta-buttons">
            <a href="/education#booking" className="biz-cta-btn biz-cta-primary">
              跟 Eddie 约课 →
            </a>
            <a href="mailto:edward_dee@ichessgeek.com" className="biz-cta-btn biz-cta-secondary">
              发邮件咨询
            </a>
          </div>
        </div>
      </main>

      <footer className="biz-footer">
        <div className="biz-footer-inner">
          <p className="biz-footer-copy">
            &copy; {new Date().getFullYear()} ichessgeek.com
          </p>
          <div className="biz-footer-contact">
            <a href="mailto:edward_dee@ichessgeek.com" className="biz-footer-email">edward_dee@ichessgeek.com</a>
            <span className="biz-footer-email-sep">|</span>
            <a href="mailto:admin@ichessgeek.com" className="biz-footer-email">admin@ichessgeek.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
