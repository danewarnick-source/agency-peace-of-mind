import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  Layers,
  CheckCircle2,
  ChevronRight,
  Menu,
  X,
  Cpu,
  ArrowRight,
  ClipboardList,
  Building2,
  Droplet,
  Star,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HIVE — Engineered by Nectar" },
      {
        name: "description",
        content:
          "HIVE unifies fragmented provider apps, timesheets, and case logs into one effortless colony. Powered by the Nectar Intelligence Engine.",
      },
      { property: "og:title", content: "HIVE — Engineered by Nectar" },
      {
        property: "og:description",
        content:
          "Distill complex Medicaid care documentation into pure operational clarity.",
      },
    ],
  }),
  component: HiveLandingPage,
});

function HiveLandingPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activePortalView, setActivePortalView] = useState<"staff" | "admin">("admin");

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 selection:bg-amber-100 selection:text-amber-900 overflow-x-hidden">
      {/* Background blur orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-b from-amber-100/30 via-amber-50/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[500px] left-[-150px] w-[500px] h-[500px] bg-gradient-to-tr from-stone-100 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

      {/* 1. Top nav */}
      <nav className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200/60 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-11 bg-amber-500/90 clip-hex shadow-[0_4px_12px_rgba(217,119,6,0.15)] transition-transform hover:scale-105 duration-300">
                <div className="absolute w-[34px] h-[38px] bg-white clip-hex flex items-center justify-center">
                  <span className="font-black text-lg tracking-wider text-amber-600">H</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-black text-2xl tracking-tight text-stone-900 leading-none">HIVE</span>
                <span className="text-[10px] font-bold text-amber-600 tracking-[0.12em] uppercase mt-1">
                  Engineered by Nectar
                </span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#vision" className="text-sm font-medium text-stone-600 hover:text-amber-600 transition-colors">The Vision</a>
              <a href="#architecture" className="text-sm font-medium text-stone-600 hover:text-amber-600 transition-colors">Platform Hubs</a>
              <a href="#peace-of-mind" className="text-sm font-medium text-stone-600 hover:text-amber-600 transition-colors">The Reward</a>
              <a href="#pricing" className="text-sm font-medium text-stone-600 hover:text-amber-600 transition-colors">Enterprise Plans</a>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <Link to="/login" className="px-4 py-2.5 text-sm font-semibold text-stone-600 hover:text-stone-900 transition-colors">Sign In</Link>
              <Link to="/signup" className="px-5 py-2.5 text-sm font-bold text-stone-900 bg-amber-400 hover:bg-amber-300 rounded-lg border border-amber-500/20 shadow-sm transition-all active:scale-[0.98]">
                Request Live Tour
              </Link>
            </div>

            <div className="md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 min-h-11 min-w-11 rounded-md text-stone-600 hover:text-stone-900 focus:outline-none"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-stone-200 px-4 pt-2 pb-6 space-y-3 animate-fade-in">
            <a href="#vision" onClick={() => setIsMobileMenuOpen(false)} className="block px-3 py-3 rounded-md text-base font-medium text-stone-700 hover:bg-stone-50 hover:text-amber-600">The Vision</a>
            <a href="#architecture" onClick={() => setIsMobileMenuOpen(false)} className="block px-3 py-3 rounded-md text-base font-medium text-stone-700 hover:bg-stone-50 hover:text-amber-600">Platform Hubs</a>
            <a href="#peace-of-mind" onClick={() => setIsMobileMenuOpen(false)} className="block px-3 py-3 rounded-md text-base font-medium text-stone-700 hover:bg-stone-50 hover:text-amber-600">The Reward</a>
            <div className="pt-4 flex flex-col gap-3 px-3">
              <Link to="/login" className="w-full py-3 text-center font-semibold text-stone-600 border border-stone-200 rounded-lg">Sign In</Link>
              <Link to="/signup" className="w-full py-3 text-center font-bold text-stone-900 bg-amber-400 rounded-lg">Request Live Tour</Link>
            </div>
          </div>
        )}
      </nav>

      {/* 2. Hero */}
      <header className="relative pt-12 pb-20 md:pt-20 md:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/5 border border-amber-500/20 rounded-full">
                <Cpu size={13} className="text-amber-600 animate-pulse" />
                <span className="text-xs font-bold text-amber-700 tracking-wider uppercase">
                  Proprietary Core Intelligence Engine
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-stone-900 tracking-tight leading-[1.1]">
                Flatten daily care chaos.
                <br />
                Extract{" "}
                <span className="text-amber-600 font-extrabold underline decoration-amber-400/60 decoration-wavy underline-offset-4">
                  Pure Simplicity.
                </span>
              </h1>
              <p className="text-base sm:text-lg text-stone-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                HIVE unifies your fragmented provider apps, timesheets, and case logs into one sleek, effortless colony.
                Driven by our unique{" "}
                <strong className="text-stone-950 font-bold">Nectar™ Intelligence Engine</strong>, the system purifies field documentation and builds an unbreachable wall of compliance automatically.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <a href="#architecture" className="w-full sm:w-auto px-8 py-3.5 text-center font-bold text-white bg-stone-900 hover:bg-stone-800 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 group active:scale-[0.99]">
                  Explore the Ecosystem
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </a>
                <a href="#peace-of-mind" className="w-full sm:w-auto px-8 py-3.5 text-center font-bold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-xl shadow-sm transition-all active:scale-[0.99]">
                  Read Audit Blueprint
                </a>
              </div>

              <div className="pt-8 grid grid-cols-3 gap-4 max-w-md mx-auto lg:mx-0 border-t border-stone-200">
                <div>
                  <p className="text-xl font-black text-stone-900">100%</p>
                  <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wide mt-0.5">EVV Accuracy</p>
                </div>
                <div className="border-x border-stone-200 px-4">
                  <p className="text-xl font-black text-stone-900">Zero</p>
                  <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wide mt-0.5">Clawback Risk</p>
                </div>
                <div className="pl-2">
                  <p className="text-xl font-black text-stone-900">Unified</p>
                  <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wide mt-0.5">Colony Core</p>
                </div>
              </div>
            </div>

            {/* Console preview */}
            <div className="lg:col-span-5 relative mt-6 lg:mt-0">
              <div className="relative bg-white border border-stone-200 rounded-2xl shadow-xl p-4 overflow-hidden aspect-[4/3] flex flex-col group">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-amber-400 via-amber-200 to-transparent" />
                <div className="flex items-center justify-between border-b border-stone-100 pb-3 mb-4">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 bg-stone-200 rounded-full" />
                    <span className="w-2.5 h-2.5 bg-stone-200 rounded-full" />
                    <span className="w-2.5 h-2.5 bg-stone-200 rounded-full" />
                  </div>
                  <div className="px-2.5 py-0.5 bg-stone-50 border border-stone-200/60 rounded text-[9px] font-mono text-stone-400">
                    {activePortalView === "admin" ? "admin_snapshot_hub.tsx" : "staff_caseload_grid.tsx"}
                  </div>
                </div>

                <div className="flex-1 flex gap-4 text-[11px] font-mono text-stone-500 overflow-hidden">
                  <div className="w-1/3 border-r border-stone-100 pr-2 flex flex-col gap-1.5">
                    <div className="p-1.5 bg-amber-50 border border-amber-100 rounded text-[9px] text-amber-700 font-extrabold flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Nectar Core Active
                    </div>
                    <div className="h-3.5 bg-stone-100 rounded w-full" />
                    <div className="h-3.5 bg-stone-900 text-amber-400 rounded w-full px-1 flex items-center gap-1 text-[9px] font-sans font-bold">
                      <Check size={8} /> Active Hub
                    </div>
                    <div className="h-3.5 bg-stone-100 rounded w-5/6" />
                    <div className="h-3.5 bg-stone-100 rounded w-4/5" />
                  </div>

                  <div className="flex-1 flex flex-col gap-2.5">
                    <div className="p-2.5 bg-stone-50 border border-stone-200/60 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-bold text-stone-400 uppercase tracking-wide">Data Verification Integrity</div>
                        <div className="text-base font-black text-stone-900 mt-0.5">99.91%</div>
                      </div>
                      <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin-slow" />
                    </div>
                    <div className="p-2.5 bg-white border border-stone-100 rounded-xl space-y-1.5 flex-1 shadow-inner">
                      <div className="h-1.5 bg-stone-200 rounded w-1/2" />
                      <div className="h-1.5 bg-stone-100 rounded w-full" />
                      <div className="h-1.5 bg-stone-100 rounded w-4/5" />
                      <div className="pt-2 flex gap-1">
                        <span className="px-1.5 py-0.5 bg-stone-100 border border-stone-200 text-[8px] text-stone-600 rounded font-sans font-bold">[DSI]</span>
                        <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-[8px] text-amber-700 rounded font-sans font-bold">[HHS]</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 flex bg-white border border-stone-200 p-1 rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => setActivePortalView("admin")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activePortalView === "admin" ? "bg-amber-400 text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    Admin Hub
                  </button>
                  <button
                    onClick={() => setActivePortalView("staff")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activePortalView === "staff" ? "bg-amber-400 text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"}`}
                  >
                    Staff View
                  </button>
                </div>
              </div>

              <div className="absolute top-[-15px] right-[-5px] bg-white border border-amber-200/80 p-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-bounce-slow pointer-events-none">
                <div className="w-6 h-6 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                  <Check size={14} strokeWidth={3} />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Audit Shield</p>
                  <p className="text-xs font-extrabold text-stone-900">SOW Code Enforced</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. Vision */}
      <section id="vision" className="relative py-16 bg-white border-y border-stone-200/60 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.015] bg-repeat pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100' viewBox='0 0 56 100'%3E%3Cpath d='M28 66L0 50L0 18L28 2L56 18L56 50L28 66ZM28 98L0 82L0 66L28 50L56 66L56 82L28 98Z' fill='%23D97706' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center space-y-6">
          <div className="w-10 h-10 bg-amber-50 border border-amber-200/60 rounded-full flex items-center justify-center mx-auto text-amber-600 shadow-sm">
            <Layers size={18} />
          </div>
          <h2 className="text-xs font-bold text-amber-600 uppercase tracking-[0.2em]">The Core Philosophy</h2>
          <blockquote className="text-xl sm:text-2xl font-semibold tracking-tight max-w-4xl mx-auto leading-relaxed italic text-stone-900">
            "The Vision Defined: Nectar™ is the refined essence of your agency's daily work. It is the single platform standard that proves that when data is harvested correctly, compliance doesn't have to be a complicated, defensive shield—it can be pure, straightforward, and effortless."
          </blockquote>
          <div className="w-16 h-[2px] bg-amber-400 mx-auto" />
        </div>
      </section>

      {/* 4. Architecture */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-3 mb-14">
          <h2 className="text-xs font-bold text-amber-600 uppercase tracking-widest">Colony Framework</h2>
          <p className="text-3xl font-black text-stone-900 tracking-tight">Two High-Density Hubs. One Single Platform.</p>
          <p className="text-stone-500 max-w-2xl mx-auto text-sm sm:text-base">
            We completely eliminate software fragmentation. Your system interfaces are broken down into clean, action-driven dashboards engineered for total ease of use.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-8 flex flex-col justify-between hover:border-amber-200 transition-all duration-300">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="w-9 h-9 bg-stone-50 border border-stone-200 text-stone-800 rounded-xl flex items-center justify-center shadow-sm">
                  <ClipboardList size={18} />
                </span>
                <div>
                  <h3 className="font-black text-lg text-stone-900 leading-tight">The Caregiver / Staff Portal</h3>
                  <p className="text-xs font-bold text-amber-600 mt-0.5">Four Concise Tabs. Zero Workflow Friction.</p>
                </div>
              </div>
              <p className="text-stone-600 text-sm mb-6 leading-relaxed">
                Direct care staff need immediate route entry tools. HIVE encapsulates all compliance and logging parameters onto a clean, mobile-first workspace grid.
              </p>
              <div className="space-y-3.5">
                <div className="p-3 bg-stone-50 border border-stone-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-stone-900 text-xs font-bold">My Caseload Management</strong>
                    <p className="text-[11px] text-stone-500 mt-0.5">Unified entry framework. Tapping localized client code tags ([DSI], [SEI], [HHS]) swaps matching data sheets instantly without changing files.</p>
                  </div>
                </div>
                <div className="p-3 bg-stone-50 border border-stone-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-stone-900 text-xs font-bold">General Time Clock &amp; Training Matrix</strong>
                    <p className="text-[11px] text-stone-500 mt-0.5">Client-less punches for general agency hours, plus quick credential file tracking loops with visual progress bar updates.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-6 border-t border-stone-100 mt-6 flex justify-between items-center text-[10px]">
              <span className="text-stone-400 font-mono">view: /dashboard/caseload</span>
              <span className="font-bold text-stone-900 flex items-center gap-0.5">Mobile Core Active <ChevronRight size={12} /></span>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-8 flex flex-col justify-between hover:border-amber-200 transition-all duration-300">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="w-9 h-9 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl flex items-center justify-center shadow-sm">
                  <Building2 size={18} />
                </span>
                <div>
                  <h3 className="font-black text-lg text-stone-900 leading-tight">The Admin Oversight Desk</h3>
                  <p className="text-xs font-bold text-amber-600 mt-0.5">Five High-Density Corporate Command Centers.</p>
                </div>
              </div>
              <p className="text-stone-600 text-sm mb-6 leading-relaxed">
                Collapses disconnected ledger and log entries into highly scannable command suites backed by rigid role-based permission locks.
              </p>
              <div className="space-y-3.5">
                <div className="p-3 bg-stone-50 border border-stone-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-stone-900 text-xs font-bold">Compliance &amp; Auditing Suite</strong>
                    <p className="text-[11px] text-stone-500 mt-0.5">A single table deck to batch-verify timesheets, run Utah DHHS EVV aggregations, read progress logs, and audit signed 31-day attendance matrix blocks.</p>
                  </div>
                </div>
                <div className="p-3 bg-stone-50 border border-stone-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-stone-900 text-xs font-bold">Rep Payee Asset Ledgers</strong>
                    <p className="text-[11px] text-stone-500 mt-0.5">Secure maintenance of client personal balances, allowance payouts, and automated duplicate receipt upload verification gates.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-6 border-t border-stone-100 mt-6 flex justify-between items-center text-[10px]">
              <span className="text-stone-400 font-mono">view: /dashboard/compliance</span>
              <span className="font-bold text-amber-700 flex items-center gap-0.5">Audit Proof System <ChevronRight size={12} /></span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Peace of mind */}
      <section id="peace-of-mind" className="relative py-20 bg-stone-900 text-stone-100 overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[100px] bg-amber-400/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400/10 border border-amber-400/20 rounded-full text-amber-400 text-xs font-bold uppercase tracking-wider mx-auto">
            <ShieldCheck size={12} /> Risk Interceptor Active
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            The Reward of Absolute Peace of Mind
          </h2>
          <div className="bg-stone-950/80 backdrop-blur-sm border border-stone-800 p-8 sm:p-10 rounded-2xl text-left space-y-5 shadow-2xl relative">
            <div className="absolute top-[-20px] left-8 w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center text-stone-950 shadow-lg shadow-amber-400/10">
              <Droplet size={18} strokeWidth={2.5} />
            </div>
            <p className="text-base sm:text-lg text-stone-300 leading-relaxed pt-1">
              Just as sweet nectar is the ultimate reward for a bee's hard work, your{" "}
              <span className="text-amber-400 font-bold">Nectar™ engine</span> is the ultimate reward for the agency owner. It is the assurance that the business is secure.
            </p>
            <p className="text-base sm:text-lg text-stone-300 leading-relaxed">
              When an auditor walks through the door, you don't hand them a chaotic stack of papers; you hand them Nectar—a perfectly organized, indisputable record of pristine compliance. It is the sweet relief of knowing your Medicaid funding and business licensing are completely safe.
            </p>
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 border-t border-stone-800 text-[10px] text-stone-500 font-mono">
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 bg-amber-400 rounded-full" />
                Forensic Verification Ledgers Active
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 bg-amber-400 rounded-full" />
                SOW Code Logic Validation Checked
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Health snapshot */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 space-y-5">
            <h3 className="text-2xl font-black text-stone-900 tracking-tight">Agency Health Snapshot</h3>
            <p className="text-stone-600 text-sm leading-relaxed">
              Eliminate tracking assumptions. Our Command Center features a live dual-ring verification loop that aggregates data integrity scores across your entire platform setup in real time.
            </p>
            <div className="space-y-2.5 pt-1 text-xs font-bold text-stone-700">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Green (≥ 90%): Optimal Audit Readiness State
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Amber (80-89%): Processing Warning Flags Detected
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Red (&lt; 80%): Immediate Funding Exposure Risk
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-stone-50 border border-stone-100 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 relative overflow-hidden">
            {[
              { label: "Client Core Files", value: 94, sub: "Fulfillment Logs Clear" },
              { label: "Staff Compliance", value: 91, sub: "EVV Location Links Verified" },
            ].map((r) => (
              <div key={r.label} className="bg-white border border-stone-200/80 rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
                <span className="text-[10px] font-bold text-stone-400 tracking-wider uppercase">{r.label}</span>
                <div className="relative w-28 h-28 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path className="text-stone-100" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="text-emerald-500" strokeDasharray={`${r.value}, 100`} strokeWidth="2.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-stone-900 tracking-tight">{r.value}%</span>
                    <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded mt-0.5">SECURE</span>
                  </div>
                </div>
                <p className="text-[10px] text-stone-400 font-medium">{r.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Pricing */}
      <section id="pricing" className="bg-stone-100 py-20 border-t border-stone-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 mb-14">
            <h2 className="text-xs font-bold text-amber-600 uppercase tracking-widest">SaaS Packaging</h2>
            <p className="text-3xl font-black text-stone-900 tracking-tight">Predictable Plans for Active Colonies</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="text-stone-400 text-xs font-bold uppercase tracking-wider">Essential Base</h4>
                <div className="text-3xl font-black text-stone-900 mt-2">$299<span className="text-xs font-normal text-stone-400">/mo</span></div>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">Perfect starting package to consolidate profile structures and primary data entry loops.</p>
                <div className="w-full h-[1px] bg-stone-100 my-5" />
                <ul className="space-y-2.5 text-xs font-medium text-stone-600">
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Standard Time Clock Punches</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Base Progress Form Elements</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Care Academy Tracking Shell</li>
                </ul>
              </div>
              <button className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-lg text-xs mt-6 transition-colors">Deploy Essential</button>
            </div>

            <div className="bg-white border-2 border-amber-500 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-md relative md:scale-105 z-10">
              <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 bg-amber-500 text-stone-900 text-[9px] font-black tracking-widest uppercase px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                <Star size={10} fill="currentColor" /> Preferred Standard
              </div>
              <div>
                <h4 className="text-stone-400 text-xs font-bold uppercase tracking-wider">Enterprise Compliance</h4>
                <div className="text-3xl font-black text-stone-900 mt-2">$599<span className="text-xs font-normal text-stone-400">/mo</span></div>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">Full system provisioning equipped with active database auditing mechanisms.</p>
                <div className="w-full h-[1px] bg-stone-100 my-5" />
                <ul className="space-y-2.5 text-xs font-medium text-stone-600">
                  <li className="flex items-center gap-2 text-amber-600 font-bold"><Check size={12} /> Full Nectar™ Intelligence Engine</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Aggregated Utah DHHS EVV Exports</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Row-Level Secured Rep Payee ledgers</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Automated Duplicate Receipt Interceptors</li>
                </ul>
              </div>
              <button className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-stone-900 font-black rounded-lg text-xs mt-6 border border-amber-600/20 shadow-sm transition-colors">Deploy Full Compliance</button>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="text-stone-400 text-xs font-bold uppercase tracking-wider">Custom Scale</h4>
                <div className="text-3xl font-black text-stone-900 mt-2">Custom</div>
                <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">Built for multi-regional providers managing massive client caseload grids across separate regions.</p>
                <div className="w-full h-[1px] bg-stone-100 my-5" />
                <ul className="space-y-2.5 text-xs font-medium text-stone-600">
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Isolated High-Performance Servers</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> Custom Role Permission Profiling</li>
                  <li className="flex items-center gap-2"><Check size={12} className="text-amber-600" /> QuickBooks Direct Payroll Export mapping</li>
                </ul>
              </div>
              <button className="w-full py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-lg text-xs mt-6 transition-colors">Contact Architecture Team</button>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="bg-stone-900 text-stone-400 text-[11px] py-10 border-t border-stone-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-1.5">
              <span className="font-black text-base text-white tracking-tight">HIVE</span>
              <span className="text-[9px] text-amber-400 font-mono tracking-wider bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">v2.4.0-NectarEngine</span>
            </div>
            <p className="max-w-xs text-stone-500 text-[11px] leading-relaxed">
              The straightforward, single-platform ecosystem built to distill complex Medicaid care documentation into pure operational clarity.
            </p>
          </div>
          <div className="md:col-span-7 flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-1.5 text-stone-500">
            <span>© 2026 HIVE Tech Systems Inc. All rights reserved.</span>
            <a href="#privacy" className="hover:text-stone-300 transition-colors">Data Privacy Security</a>
            <a href="#terms" className="hover:text-stone-300 transition-colors">System Service Policies</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
