import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  HardHat,
  MessageSquare,
  ScanSearch,
  ShieldCheck,
  Upload,
} from "lucide-react";

const workflow = [
  {
    number: "01",
    icon: Upload,
    title: "Capture the inspection",
    text: "Upload site photographs or a short video, select the project zone, and preserve the original capture context.",
  },
  {
    number: "02",
    icon: ScanSearch,
    title: "Analyse visible evidence",
    text: "The worker detects people and supported PPE classes, samples video frames, and keeps model provenance with every result.",
  },
  {
    number: "03",
    icon: ClipboardCheck,
    title: "Apply human judgement",
    text: "Engineers review the evidence, add observations, and decide which proposed safety or progress records are valid.",
  },
  {
    number: "04",
    icon: FileCheck2,
    title: "Approve a traceable report",
    text: "Create one evidence-linked report per inspection, freeze approved versions, and export a professional PDF.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="landing-logo" aria-label="SiteSight AI home">
          <Image
            src="/logo.png"
            alt="SiteSight AI"
            width={2172}
            height={724}
            priority
          />
        </Link>
        <nav aria-label="Landing page navigation">
          <a href="#workflow">Workflow</a>
          <a href="#capabilities">Capabilities</a>
        </nav>
        <Link className="button secondary landing-signin" href="/dashboard">
          Open workspace <ArrowRight size={15} />
        </Link>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-kicker">
              CONSTRUCTION EVIDENCE, MADE ACCOUNTABLE
            </span>
            <h1>
              See site progress clearly.
              <br />
              Verify every decision.
            </h1>
            <p>
              SiteSight AI turns construction photographs and short videos into
              reviewable inspection records, verified progress updates and
              approved reports.
            </p>
            <div className="landing-actions">
              <Link className="button" href="/inspections?new=inspection">
                <Camera size={17} /> Create inspection
              </Link>
              <Link className="button secondary" href="/projects?new=project">
                Create project
              </Link>
            </div>
            <div className="landing-trust">
              <span>
                <ShieldCheck size={16} /> Private evidence
              </span>
              <span>
                <CheckCircle2 size={16} /> Human verification
              </span>
              <span>
                <FileCheck2 size={16} /> Immutable approvals
              </span>
            </div>
          </div>

          <div
            className="landing-product landing-product-shot"
            aria-label="Annotated SiteSight construction evidence preview"
          >
            <Image
              src="/sitesight-evidence-preview.png"
              alt="Construction workers with SiteSight worker, helmet and vest detection overlays"
              width={1490}
              height={874}
              priority
            />
            <div className="landing-shot-caption">
              <span>
                <ScanSearch size={15} /> Annotated inspection evidence
              </span>
              <span>Worker and PPE associations remain reviewable</span>
            </div>
          </div>
        </section>

        <section className="landing-principle" id="principle">
          <span>
            <ShieldCheck size={22} />
          </span>
          <div>
            <small>THE OPERATING PRINCIPLE</small>
            <h2>AI detects and explains. Engineers verify and decide.</h2>
          </div>
          <p>
            Visible work is evidence, not certification. SiteSight keeps model
            proposals, human decisions and approved client records distinct.
          </p>
        </section>

        <section className="landing-section" id="workflow">
          <div className="landing-section-head">
            <div>
              <span className="landing-kicker">FROM CAPTURE TO APPROVAL</span>
              <h2>A workflow your project team can defend.</h2>
            </div>
            <p>
              Every stage preserves who observed, what the model proposed, what
              a reviewer decided and which evidence supports the final record.
            </p>
          </div>
          <div className="workflow-grid">
            {workflow.map(({ number, icon: Icon, title, text }) => (
              <article key={number}>
                <div>
                  <span>{number}</span>
                  <Icon size={20} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="capability-section" id="capabilities">
          <div className="capability-copy">
            <span className="landing-kicker">ONE CONTROLLED RECORD</span>
            <h2>Progress, PPE and reporting stay connected to the evidence.</h2>
            <p>
              SiteSight is designed for project managers, site engineers, safety
              officers and approved viewers working from the same inspection
              history.
            </p>
            <Link href="/dashboard" className="text-link">
              Explore the dashboard <ArrowRight size={15} />
            </Link>
          </div>
          <div className="capability-list">
            <article>
              <HardHat size={20} />
              <div>
                <h3>PPE monitoring</h3>
                <p>
                  Worker, helmet and vest observations with conservative
                  unable-to-assess handling.
                </p>
              </div>
            </article>
            <article>
              <BarChart3 size={20} />
              <div>
                <h3>Verified progress</h3>
                <p>
                  Weighted milestone progress entered by engineers and kept
                  separate from baseline assumptions.
                </p>
              </div>
            </article>
            <article>
              <FileCheck2 size={20} />
              <div>
                <h3>Approved reports</h3>
                <p>
                  Inspection-specific versions, evidence references, provenance
                  and professional PDF export.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-chat">
          <div className="chat-orbit">
            <MessageSquare size={25} />
          </div>
          <div>
            <span className="landing-kicker">ASK SITESIGHT</span>
            <h2>Get to know the system—or ask about an authorised project.</h2>
            <p>
              The assistant handles general questions naturally and uses
              approved or role-authorised records when a question needs project
              facts.
            </p>
          </div>
          <Link className="button" href="/ask">
            Talk to SiteSight <ArrowRight size={16} />
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <Image src="/logo.png" alt="SiteSight AI" width={2172} height={724} />
        <p>Construction progress and PPE monitoring with human oversight.</p>
        <span>Academic MVP · Localhost workspace</span>
      </footer>
    </div>
  );
}
