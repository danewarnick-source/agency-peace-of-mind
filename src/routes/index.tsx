import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Layers,
  Activity,
  CheckCircle2,
  ChevronRight,
  Menu,
  X,
  Cpu,
  ArrowRight,
  ClipboardList,
  Building2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HIVE — Engineered by Nectar" },
      {
        name: "description",
        content:
          "HIVE unifies timesheets, EVV records, and progress logs into one ecosystem. Powered by the Nectar Intelligence Engine.",
      },
      { property: "og:title", content: "HIVE — Engineered by Nectar" },
      {
        property: "og:description",
        content:
          "Consolidate care data. Ensure pure compliance with the Nectar engine.",
      },
    ],
  }),
  component: HiveLandingPage,
});

function HiveLandingPage() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activePortalView, setActivePortalView] = useState<"staff" | "admin">("admin");

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-amber-100 selection:text-slate-900 overflow-x-hidden">
      {/* Background orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-b from-blue-600/5 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-[500px] left-[-150px] w-[500px] h-[500px] bg-gradient-to-tr from-slate-100 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

      {/* 1. NAV */}
      <nav className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center w-10 h-11 bg-slate-900 clip-hex shadow-sm group">
                <div className="absolute w-[34px] h-[38px] bg-white clip-hex flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600 transition-transform duration-500 group-hover:rotate-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" strokeDasharray="2 2" className="opacity-40" />
                    <path d="M12 7c2.5 0 4 1.5 4 4v3c0 1.5-1.5 3-4 3s-4-1.5-4-3v-3c0-2.5 1.5-4 4-4z" fill="currentColor" fillOpacity="0.1" />
                    <path d="M8 11a4 4 0 0 1 8 0v3a4 4 0 0 1-8 0z" />
                    <path d="M6 10c-1.5-1.5-2.5-.5-2.5 1.5s1 2.5 2.5 1" />
                    <path d="M18 10c1.5-1.5 2.5-.5 2.5 1.5s-1 2.5-2.5 1" />
                  </svg>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="font-black text-2xl tracking-tight text-slate-900 leading-none">HIVE</span>
                <span className="text-[10px] font-bold text-amber-600 tracking-[0.12em] uppercase mt-1">Engineered by Nectar</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#vision" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Vision</a>
              <a href="#architecture" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Platform Hubs</a>
              <a href="#peace-of-mind" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">The Reward</a>
              <a href="#pricing" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Pricing</a>
            </div>

            <div className="hidden md:flex items-center gap-4">
              <Link to="/login" className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">Sign In</Link>
              <Link to="/signup" className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm border border-blue-700/20 transition-all active:scale-[0.98]">
                Request Live Tour
              </Link>
            </div>

            <div className="md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-md text-slate-600 hover:text-slate-900 focus:outline-none min-h-[44px] min-w-[44px]"
                aria-label="Menu"
              >
                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-6 space-y-3">
            <a href="#vision" onClick={() => setIsMobileMenuOpen(false)} className="block px-3 py-3 rounded-md text-base font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600">Vision</a>
            <a href="#architecture" onClick={() => setIsMobileMenuOpen(false)} className="block px-3 py-3 rounded-md text-base font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600">Platform Hubs</a>
            <a href="#peace-of-mind" onClick={() => setIsMobileMenuOpen(false)} className="block px-3 py-3 rounded-md text-base font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600">The Reward</a>
            <a href="#pricing" onClick={() => setIsMobileMenuOpen(false)} className="block px-3 py-3 rounded-md text-base font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600">Pricing</a>
            <div className="pt-4 flex flex-col gap-3 px-3">
              <Link to="/login" className="w-full py-3 text-center font-semibold text-slate-600 border border-slate-200 rounded-lg">Sign In</Link>
              <Link to="/signup" className="w-full py-3 text-center font-bold text-white bg-blue-600 rounded-lg">Request Live Tour</Link>
            </div>
          </div>
        )}
      </nav>

      {/* 2. HERO */}
      <header className="relative pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
                <Cpu size={13} className="text-blue-600" />
                <span className="text-xs font-bold text-blue-800 tracking-wider uppercase">Nectar Intelligence Engine</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
                Consolidate care data.<br />
                Ensure <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-800 font-extrabold">Pure Compliance.</span>
              </h1>
              <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                HIVE unifies timesheets, EVV records, and daily progress logs into a single ecosystem. Driven by the
                <strong className="text-slate-900 font-bold"> Nectar™ Engine</strong>, the platform automates validation gates to protect your Medicaid funding and business licensing.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <a href="#architecture" className="w-full sm:w-auto px-8 py-3.5 text-center font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 group active:scale-[0.99]">
                  Explore the Platform
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </a>
                <a href="#peace-of-mind" className="w-full sm:w-auto px-8 py-3.5 text-center font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-all active:scale-[0.99]">
                  Read Audit Blueprint
                </a>
              </div>
              <div className="pt-8 grid grid-cols-3 gap-4 max-w-md mx-auto lg:mx-0 border-t border-slate-200">
                <div>
                  <p className="text-2xl font-black text-slate-900">100%</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">EVV Accuracy</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">Zero</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Clawback Risk</p>
                </div>
                <div>
                  <p className="text-2xl font-black text-slate-900">Unified</p>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Colony Core</p>
                </div>
              </div>
            </div>

            {/* Dashboard preview */}
            <div className="lg:col-span-5 relative mt-6 lg:mt-0">
              <div className="relative bg-white border border-slate-200 rounded-2xl shadow-xl p-4 overflow-hidden aspect-[4/3] flex flex-col">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-600 via-amber-400 to-blue-800" />
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 bg-slate-200 rounded-full" />
                    <span className="w-2.5 h-2.5 bg-slate-200 rounded-full" />
                    <span className="w-2.5 h-2.5 bg-slate-200 rounded-full" />
                  </div>
                  <div className="px-2.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9px] font-mono text-slate-400">
                    {activePortalView === "admin" ? "admin_snapshot_hub.tsx" : "staff_caseload_grid.tsx"}
                  </div>
                </div>

                <div className="flex-1 flex gap-4 text-[11px] font-mono text-slate-500 overflow-hidden">
                  <div className="w-1/3 border-r border-slate-100 pr-2 flex flex-col gap-1.5">
                    <div className="p-1.5 bg-blue-50 border border-blue-100 rounded text-[9px] text-blue-700 font-extrabold flex items-center gap-1">
                      <svg className="w-3 h-3 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 7c2.5 0 4 1.5 4 4v3c0 1.5-1.5 3-4 3s-4-1.5-4-3v-3c0-2.5 1.5-4 4-4z" />
                        <path d="M6 10c-1.5-1.5-2.5-.5-2.5 1.5s1 2.5 2.5 1M18 10c1.5-1.5 2.5-.5 2.5 1.5s-1 2.5-2.5 1" />
                      </svg>
                      Nectar Active
                    </div>
                    <div className="h-3.5 bg-slate-100 rounded w-full" />
                    <div className="h-3.5 bg-slate-900 text-amber-400 rounded w-full px-1 flex items-center text-[9px] font-sans font-bold">
                      <CheckCircle2 size={9} className="mr-1" /> Active Hub
                    </div>
                    <div className="h-3.5 bg-slate-100 rounded w-5/6" />
                    <div className="h-3.5 bg-slate-100 rounded w-4/5" />
                  </div>

                  <div className="flex-1 flex flex-col gap-2.5">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Data Integrity Score</div>
                        <div className="text-base font-black text-slate-900 mt-0.5">99.91%</div>
                      </div>
                      <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin-slow" />
                    </div>
                    <div className="p-2.5 bg-white border border-slate-100 rounded-xl space-y-1.5 flex-1 shadow-inner relative overflow-hidden">
                      <svg className="absolute bottom-1 right-2 w-8 h-8 text-amber-500/10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.5c3.59 0 6.5-2.91 6.5-6.5 0-3.59-6.5-13-6.5-13S5.5 11.41 5.5 15c0 3.59 2.91 6.5 6.5 6.5z" />
                      </svg>
                      <div className="h-1.5 bg-slate-200 rounded w-1/2" />
                      <div className="h-1.5 bg-slate-100 rounded w-full" />
                      <div className="h-1.5 bg-slate-100 rounded w-4/5" />
                      <div className="pt-2 flex gap-1">
                        <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-[8px] text-slate-600 rounded font-sans font-bold">[DSI]</span>
                        <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-[8px] text-amber-700 rounded font-sans font-bold">[HHS]</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 flex bg-white border border-slate-200 p-1 rounded-lg shadow-lg z-20">
                  <button
                    onClick={() => setActivePortalView("admin")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activePortalView === "admin" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                  >
                    Admin Hub
                  </button>
                  <button
                    onClick={() => setActivePortalView("staff")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activePortalView === "staff" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                  >
                    Staff View
                  </button>
                </div>
              </div>

              <div className="absolute top-[-15px] right-[-5px] bg-white border border-slate-200 p-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-bounce-slow pointer-events-none">
                <div className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                  <CheckCircle2 size={14} />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Audit Shield</p>
                  <p className="text-xs font-extrabold text-slate-900">SOW Code Validated</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. VISION */}
      <section id="vision" className="relative py-16 bg-white border-y border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center mx-auto text-blue-600 shadow-sm">
            <Layers size={18} />
          </div>
          <h2 className="text-xs font-bold text-blue-600 uppercase tracking-[0.2em]">The Core Philosophy</h2>
          <blockquote className="text-xl sm:text-2xl font-bold tracking-tight max-w-4xl mx-auto leading-relaxed text-slate-900">
            "The Vision Defined: Nectar™ is the refined essence of your agency's daily work. It is the single platform standard that proves that when data is harvested correctly, compliance doesn't have to be a complicated, defensive shield—it can be pure, straightforward, and effortless."
          </blockquote>
          <div className="w-16 h-[2px] bg-amber-500 mx-auto mt-2" />
        </div>
      </section>

      {/* 4. ARCHITECTURE */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-3 mb-14">
          <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest">Colony Framework</h2>
          <p className="text-3xl font-black text-slate-900 tracking-tight">Two Hubs. One Connected Platform.</p>
          <p className="text-slate-500 max-w-xl mx-auto text-sm sm:text-base">
            We eliminate software fragmentation by consolidating administrative oversight and frontline documentation into unified interfaces.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="w-9 h-9 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl flex items-center justify-center shadow-sm">
                  <ClipboardList size={18} />
                </span>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">Caregiver / Staff Portal</h3>
                  <p className="text-xs font-bold text-blue-600 mt-0.5">Four Functional Tabs. Zero Friction.</p>
                </div>
              </div>
              <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                Designed for speed on shift. Field staff access localized client management grids directly from a centralized path.
              </p>
              <div className="space-y-3.5">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 text-xs font-bold">My Caseload Management</strong>
                    <p className="text-[11px] text-slate-500 mt-0.5">Tapping client profile tags ([DSI], [SEI], [HHS]) swaps matching operational forms instantly without altering context.</p>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 text-xs font-bold">General Time Clock & Training</strong>
                    <p className="text-[11px] text-slate-500 mt-0.5">Tracks client-less punches for company overhead alongside instant access to active credential training modules.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 mt-6 flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-mono">view: /dashboard/caseload</span>
              <span className="font-bold text-slate-900 flex items-center gap-0.5">Mobile Optimized <ChevronRight size={12} /></span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <span className="w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center shadow-sm">
                  <Building2 size={18} />
                </span>
                <div>
                  <h3 className="font-black text-lg text-slate-900 leading-tight">Admin Oversight Desk</h3>
                  <p className="text-xs font-bold text-amber-600 mt-0.5">Five Enterprise Command Centers.</p>
                </div>
              </div>
              <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                Aggregates separate financial ledgers and timesheet grids into secure, high-density corporate monitoring suites.
              </p>
              <div className="space-y-3.5">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 text-xs font-bold">Compliance & Auditing Hub</strong>
                    <p className="text-[11px] text-slate-500 mt-0.5">A single sub-tab panel to manage timesheets, process Utah DHHS EVV extractions, and review signed 31-day attendance matrices.</p>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex gap-3 items-start">
                  <CheckCircle2 size={15} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-900 text-xs font-bold">Rep Payee Asset Management</strong>
                    <p className="text-[11px] text-slate-500 mt-0.5">Row-level secure validation grids for client fund distributions and integrated duplicate receipt blocking logic.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="pt-6 border-t border-slate-100 mt-6 flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-mono">view: /dashboard/compliance</span>
              <span className="font-bold text-blue-600 flex items-center gap-0.5">Audit Ready <ChevronRight size={12} /></span>
            </div>
          </div>
        </div>
      </section>

      {/* 5. PEACE OF MIND */}
      <section id="peace-of-mind" className="relative py-20 bg-slate-900 text-slate-100 overflow-hidden">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[100px] bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-xs font-bold uppercase tracking-wider mx-auto">
            <Activity size={12} /> Continuous Risk Mitigation
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            The Reward of Absolute Peace of Mind
          </h2>
          <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-800 p-8 sm:p-10 rounded-2xl text-left space-y-5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-4 right-6 flex items-center gap-4 text-amber-500/20 pointer-events-none">
              <svg className="w-8 h-8 animate-bounce-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 7c2.5 0 4 1.5 4 4v3c0 1.5-1.5 3-4 3s-4-1.5-4-3v-3c0-2.5 1.5-4 4-4z" />
                <path d="M6 10c-1.5-1.5-2.5-.5-2.5 1.5s1 2.5 2.5 1M18 10c1.5-1.5 2.5-.5 2.5 1.5s-1 2.5-2.5 1" />
              </svg>
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.5c3.59 0 6.5-2.91 6.5-6.5 0-3.59-6.5-13-6.5-13S5.5 11.41 5.5 15c0 3.59 2.91 6.5 6.5 6.5z" />
              </svg>
            </div>
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              Just as sweet nectar is the ultimate reward for a bee's hard work, your <span className="text-amber-500 font-bold">Nectar™ engine</span> is the ultimate reward for the agency owner. It is the assurance that the business is secure.
            </p>
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed">
              When an auditor walks through the door, you don't hand them a chaotic stack of papers; you hand them Nectar—a perfectly organized, indisputable record of pristine compliance. It is the sweet relief of knowing your Medicaid funding and business licensing are completely safe.
            </p>
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 bg-amber-500 rounded-full" />
                Forensic Verification Ledgers Active
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 bg-amber-500 rounded-full" />
                SOW Validation Architecture Enabled
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. HEALTH SNAPSHOT */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-8 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5 space-y-5">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Agency Health Snapshot</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Monitor operational compliance in real time. The administrative Command Center runs automated data integrity calculations across your entire active structure.
            </p>
            <div className="space-y-2.5 pt-1 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Green (90%+): Optimal Audit Readiness State
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Amber (80-89%): Processing Warning Flags Detected
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Red (&lt; 80%): Immediate Funding Exposure Risk
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-slate-50 border border-slate-100 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 relative overflow-hidden">
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Client Core Files</span>
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-100" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-emerald-500" strokeDasharray="94, 100" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-950 tracking-tight">94%</span>
                  <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded mt-0.5">SECURE</span>
                </div>
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center text-center space-y-3 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Staff Compliance</span>
              <div className="relative w-28 h-28 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-100" strokeWidth="2.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-blue-600" strokeDasharray="91, 100" strokeWidth="2.5" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-slate-950 tracking-tight">91%</span>
                  <span className="text-[8px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded mt-0.5">SECURE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. PRICING */}
      <section id="pricing" className="bg-slate-100 py-20 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-3 mb-14">
            <h2 className="text-xs font-bold text-blue-600 uppercase tracking-widest">SaaS Packaging</h2>
            <p className="text-3xl font-black text-slate-900 tracking-tight">Predictable Pricing Tiers</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Essential Base</h4>
                <div className="text-3xl font-black text-slate-950 mt-2">$299<span className="text-xs font-normal text-slate-400">/mo</span></div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Core system tools to initiate profile setup and primary time clock tracking.</p>
                <div className="w-full h-px bg-slate-100 my-5" />
                <ul className="space-y-2.5 text-xs font-semibold text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Standard Time Clock Punches</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Base Progress Form Fields</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Grammar Validation Systems</li>
                </ul>
              </div>
              <button className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs mt-6 transition-colors">Deploy Essential</button>
            </div>

            <div className="bg-white border-2 border-blue-600 rounded-xl p-8 flex flex-col justify-between shadow-md relative md:scale-105 z-10">
              <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] font-black tracking-widest uppercase px-3 py-0.5 rounded-full">
                Standard Profile
              </div>
              <div>
                <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Enterprise Compliance</h4>
                <div className="text-3xl font-black text-slate-950 mt-2">$599<span className="text-xs font-normal text-slate-400">/mo</span></div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Full environment automation equipped with our proprietary auditing core features.</p>
                <div className="w-full h-px bg-slate-100 my-5" />
                <ul className="space-y-2.5 text-xs font-bold text-slate-600">
                  <li className="flex items-center gap-2 text-blue-600"><CheckCircle2 size={13} /> Full Nectar™ Engine Core</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Utah DHHS Aggregated EVV Exports</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Row-Level Secured Rep Payee ledgers</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Automated Duplicate Receipt Interceptors</li>
                </ul>
              </div>
              <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs mt-6 shadow-sm transition-colors">Deploy Full Compliance</button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between shadow-sm">
              <div>
                <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Custom Scale</h4>
                <div className="text-3xl font-black text-slate-900 mt-2">Custom</div>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">Built for multi-regional agencies managing large client casing metrics across multiple regions.</p>
                <div className="w-full h-px bg-slate-100 my-5" />
                <ul className="space-y-2.5 text-xs font-semibold text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Isolated High-Performance Database</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> Custom Role Permissions Matrix</li>
                  <li className="flex items-center gap-2"><CheckCircle2 size={13} className="text-blue-600" /> QuickBooks Direct API Syncing</li>
                </ul>
              </div>
              <button className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs mt-6 transition-colors">Contact Architecture Team</button>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="bg-slate-900 text-slate-400 text-[11px] py-10 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="font-black text-base text-white tracking-tight">HIVE</span>
              <span className="text-[9px] font-bold text-amber-500 tracking-[0.12em] uppercase">Engineered by Nectar</span>
            </div>
            <p className="text-slate-500">Pure compliance for Medicaid care providers.</p>
          </div>
          <div className="md:col-span-7 flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-1.5 text-slate-500">
            <span>© 2026 HIVE Tech Systems Inc. All rights reserved.</span>
            <a href="#privacy" className="hover:text-slate-300 transition-colors">Data Privacy Security</a>
            <a href="#terms" className="hover:text-slate-300 transition-colors">System Service Policies</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
