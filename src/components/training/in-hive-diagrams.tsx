export type DiagramId =
  | "fast"
  | "recovery-position"
  | "choking-rescue"
  | "report-path"
  | "brain-areas"
  | "hospital-to-community"
  | "eight-know"
  | "policy-stack";

const frame = "w-full max-w-xl rounded-xl border border-[#d5dae6] bg-[#f7f8fb] p-3";

export function TrainingDiagram({ id }: { id: DiagramId }) {
  switch (id) {
    case "fast":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#185fa5]">
            Picture: FAST — stroke signs
          </figcaption>
          <svg viewBox="0 0 360 110" className="h-auto w-full" role="img" aria-label="FAST stroke signs">
            <rect x="8" y="12" width="78" height="86" rx="10" fill="#eaf3fc" stroke="#8eb8e0" />
            <text x="47" y="38" textAnchor="middle" fontSize="22" fontWeight="700" fill="#185fa5">F</text>
            <text x="47" y="62" textAnchor="middle" fontSize="11" fill="#1c4e80">Face droop</text>
            <text x="47" y="80" textAnchor="middle" fontSize="10" fill="#5b6172">Ask to smile</text>
            <rect x="96" y="12" width="78" height="86" rx="10" fill="#eaf3fc" stroke="#8eb8e0" />
            <text x="135" y="38" textAnchor="middle" fontSize="22" fontWeight="700" fill="#185fa5">A</text>
            <text x="135" y="62" textAnchor="middle" fontSize="11" fill="#1c4e80">Arm drift</text>
            <text x="135" y="80" textAnchor="middle" fontSize="10" fill="#5b6172">Raise both</text>
            <rect x="184" y="12" width="78" height="86" rx="10" fill="#eaf3fc" stroke="#8eb8e0" />
            <text x="223" y="38" textAnchor="middle" fontSize="22" fontWeight="700" fill="#185fa5">S</text>
            <text x="223" y="62" textAnchor="middle" fontSize="11" fill="#1c4e80">Speech</text>
            <text x="223" y="80" textAnchor="middle" fontSize="10" fill="#5b6172">Slurred?</text>
            <rect x="272" y="12" width="80" height="86" rx="10" fill="#fdeded" stroke="#e29a9a" />
            <text x="312" y="38" textAnchor="middle" fontSize="22" fontWeight="700" fill="#a32d2d">T</text>
            <text x="312" y="62" textAnchor="middle" fontSize="11" fill="#7a2222">Time</text>
            <text x="312" y="80" textAnchor="middle" fontSize="10" fill="#7a2222">Call 911</text>
          </svg>
        </figure>
      );
    case "recovery-position":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#0f6e56]">
            Picture: recovery position
          </figcaption>
          <svg viewBox="0 0 360 120" className="h-auto w-full" role="img" aria-label="Person on their side">
            <ellipse cx="180" cy="98" rx="140" ry="10" fill="#e4e7ef" />
            <path d="M70 78 C90 70 130 62 170 64 C210 66 250 72 290 78" fill="none" stroke="#137182" strokeWidth="10" strokeLinecap="round" />
            <circle cx="78" cy="62" r="14" fill="#c5d4e0" stroke="#137182" strokeWidth="2" />
            <path d="M170 64 L155 88" stroke="#137182" strokeWidth="8" strokeLinecap="round" />
            <path d="M210 66 L230 90" stroke="#137182" strokeWidth="8" strokeLinecap="round" />
            <text x="180" y="28" textAnchor="middle" fontSize="12" fill="#0f6e56">On the side so the airway can drain</text>
          </svg>
        </figure>
      );
    case "choking-rescue":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#a32d2d]">
            Picture: mild vs severe choking
          </figcaption>
          <svg viewBox="0 0 360 100" className="h-auto w-full" role="img" aria-label="Mild versus severe choking">
            <rect x="10" y="14" width="160" height="72" rx="10" fill="#e1f5ee" stroke="#9fe1cb" />
            <text x="90" y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f6e56">Mild</text>
            <text x="90" y="60" textAnchor="middle" fontSize="11" fill="#0f6e56">Can cough or speak</text>
            <text x="90" y="76" textAnchor="middle" fontSize="11" fill="#0f6e56">Let them cough</text>
            <rect x="190" y="14" width="160" height="72" rx="10" fill="#fdeded" stroke="#e29a9a" />
            <text x="270" y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill="#a32d2d">Severe</text>
            <text x="270" y="60" textAnchor="middle" fontSize="11" fill="#7a2222">Cannot cough, speak,</text>
            <text x="270" y="76" textAnchor="middle" fontSize="11" fill="#7a2222">or breathe — act now</text>
          </svg>
        </figure>
      );
    case "report-path":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#a32d2d]">
            Picture: ANE reporting path
          </figcaption>
          <svg viewBox="0 0 360 88" className="h-auto w-full" role="img" aria-label="Report path">
            <rect x="8" y="22" width="88" height="44" rx="8" fill="#fdeded" stroke="#e29a9a" />
            <text x="52" y="48" textAnchor="middle" fontSize="11" fill="#7a2222">Suspect</text>
            <path d="M100 44 H124" stroke="#8a8f9e" strokeWidth="2" markerEnd="url(#arr)" />
            <rect x="128" y="22" width="100" height="44" rx="8" fill="#fff8e6" stroke="#f5d889" />
            <text x="178" y="42" textAnchor="middle" fontSize="11" fill="#7a5208">Agency process</text>
            <text x="178" y="56" textAnchor="middle" fontSize="10" fill="#7a5208">and supervisor</text>
            <path d="M232 44 H256" stroke="#8a8f9e" strokeWidth="2" />
            <rect x="260" y="10" width="92" height="68" rx="8" fill="#eaf3fc" stroke="#8eb8e0" />
            <text x="306" y="36" textAnchor="middle" fontSize="11" fill="#1c4e80">APS and /</text>
            <text x="306" y="52" textAnchor="middle" fontSize="11" fill="#1c4e80">or police</text>
            <text x="306" y="68" textAnchor="middle" fontSize="10" fill="#1c4e80">911 if danger</text>
          </svg>
        </figure>
      );
    case "brain-areas":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#4e1f81]">
            Picture: injury location can change different skills
          </figcaption>
          <svg viewBox="0 0 360 130" className="h-auto w-full" role="img" aria-label="Brain areas and skills">
            <ellipse cx="120" cy="68" rx="70" ry="48" fill="#efe7fb" stroke="#8b6bb8" />
            <text x="120" y="64" textAnchor="middle" fontSize="11" fill="#4e1f81">Brain</text>
            <text x="120" y="80" textAnchor="middle" fontSize="10" fill="#4e1f81">injury</text>
            <text x="230" y="28" fontSize="11" fill="#2a3040">Front — planning, impulse</text>
            <text x="230" y="50" fontSize="11" fill="#2a3040">Side — language, memory</text>
            <text x="230" y="72" fontSize="11" fill="#2a3040">Back — vision</text>
            <text x="230" y="94" fontSize="11" fill="#2a3040">Deep — movement, alertness</text>
            <text x="230" y="116" fontSize="11" fill="#5b6172">Not every injury looks the same</text>
          </svg>
        </figure>
      );
    case "hospital-to-community":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#137182]">
            Picture: hospital to community
          </figcaption>
          <svg viewBox="0 0 360 90" className="h-auto w-full" role="img" aria-label="Hospital to community steps">
            <rect x="10" y="20" width="90" height="50" rx="8" fill="#eaf3fc" stroke="#8eb8e0" />
            <text x="55" y="50" textAnchor="middle" fontSize="11" fill="#1c4e80">Hospital</text>
            <path d="M104 45 H128" stroke="#137182" strokeWidth="2" />
            <rect x="132" y="20" width="96" height="50" rx="8" fill="#fff8e6" stroke="#f5d889" />
            <text x="180" y="42" textAnchor="middle" fontSize="11" fill="#7a5208">Discharge</text>
            <text x="180" y="58" textAnchor="middle" fontSize="10" fill="#7a5208">plan + who to call</text>
            <path d="M232 45 H256" stroke="#137182" strokeWidth="2" />
            <rect x="260" y="20" width="90" height="50" rx="8" fill="#e1f5ee" stroke="#9fe1cb" />
            <text x="305" y="42" textAnchor="middle" fontSize="11" fill="#0f6e56">Community</text>
            <text x="305" y="58" textAnchor="middle" fontSize="10" fill="#0f6e56">staff + family</text>
          </svg>
        </figure>
      );
    case "eight-know":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#137182]">
            Picture: eight things before working alone
          </figcaption>
          <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-[#2a3040] sm:grid-cols-4">
            {["Disability effects", "Goals", "Medical / safety", "Medications", "Plan / supports", "Restrictions", "Your duties", "DNR / POLST / hospice"].map((label) => (
              <li key={label} className="rounded-lg border border-[#d5dae6] bg-white px-2 py-2 text-center font-medium">
                {label}
              </li>
            ))}
          </ul>
        </figure>
      );
    case "policy-stack":
      return (
        <figure className={frame}>
          <figcaption className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#1C2A5E]">
            Picture: this agency’s documents
          </figcaption>
          <svg viewBox="0 0 360 110" className="h-auto w-full" role="img" aria-label="Stack of agency policy documents">
            <rect x="70" y="18" width="220" height="22" rx="4" fill="#eaf3fc" stroke="#8eb8e0" />
            <text x="180" y="33" textAnchor="middle" fontSize="11" fill="#1c4e80">Personnel policies</text>
            <rect x="78" y="42" width="220" height="22" rx="4" fill="#fff8e6" stroke="#f5d889" />
            <text x="188" y="57" textAnchor="middle" fontSize="11" fill="#7a5208">Operating procedures</text>
            <rect x="86" y="66" width="220" height="22" rx="4" fill="#fdeded" stroke="#e29a9a" />
            <text x="196" y="81" textAnchor="middle" fontSize="11" fill="#7a2222">Emergency procedures</text>
          </svg>
        </figure>
      );
    default:
      return null;
  }
}
