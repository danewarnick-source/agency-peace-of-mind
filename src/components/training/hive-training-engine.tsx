// HiveTrainingCenter.tsx
// Hive Launchpad — 30-Day Core Training
// Data-driven training engine + the full 23-topic course registry.
// Paste into Lovable as a component/route. To add a topic, fill in its entry
// in TRAINING_TOPICS using the same shape as topic "E" (seizures) below —
// every topic then automatically gets the same lessons / dropdowns /
// knowledge-checks / attestation flow.

import { useState } from "react";

/* ───────────────────────── Types ───────────────────────── */
type Callout = { v: "info" | "crit"; t: string; b: string };
type Fact = { t: string; b: string };
type LessonStep = {
  type: "lesson";
  kicker: string;
  title: string;
  lead?: string;
  callout?: Callout;
  facts?: Fact[];
  dropHeading?: string;
  drops?: [string, string][];
};
type CheckStep = {
  type: "check";
  kicker: string;
  stem: string;
  options: { k: string; t: string; correct: boolean; fb: string }[];
};
type Step = LessonStep | CheckStep;
type Topic = {
  code: string;
  title: string;
  category: string;
  status: "ready" | "soon" | "pp";
  estMin?: number;
  intro?: string;
  steps?: Step[];
  attest?: string;
};

/* ───────────────────────── Brand ───────────────────────── */
const NAVY = "#0B1126", GOLD = "#f5a623", TEAL = "#137182", INK = "#0d112b";

/* ───────────────────────── Content: Seizures (worked example) ───────────────────────── */
const SEIZURE_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 4", title: "Understanding seizures",
    lead: "A seizure is a sudden burst of abnormal electrical activity in the brain. They\u2019re common, but because they\u2019re rarely seen up close, most people freeze. Seizures look very different from person to person \u2014 your job is the same every time.",
    callout: { v: "info", t: "You don\u2019t need to diagnose it", b: "You don\u2019t have to name the type. You need to recognize one is happening, keep the person safe, and time it." },
    dropHeading: "The types you may see",
    drops: [
      ["Tonic-clonic (grand mal)", "The seizure most people picture. The person loses consciousness, stiffens, and their arms and legs jerk rhythmically. They may cry out, bite their cheek or tongue, or lose bladder control. Usually one to three minutes, followed by deep confusion and exhaustion."],
      ["Absence (petit mal)", "A brief blank stare, often with fluttering eyelids, usually under 20 seconds. No falling or jerking, so it\u2019s easily mistaken for daydreaming. The person stops, then carries on with no memory of it."],
      ["Focal / complex-partial", "The person may look awake but confused or \u201cnot there.\u201d Watch for repetitive movements \u2014 lip-smacking, chewing, picking at clothing \u2014 wandering, or not responding."],
      ["Simple-partial / focal aware", "Stays fully conscious but experiences something unusual: a sudden emotion, strange smell or taste, tingling, a jerk in one limb, or d\u00e9j\u00e0 vu."],
      ["Warning signs (auras)", "Some people get a warning before a larger seizure \u2014 an odd feeling, a smell, a rush of fear. The warning is itself a small seizure and a chance to calmly help them to a safe place."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "You\u2019re talking with Dana when she suddenly stops mid-sentence, stares blankly, and her eyelids flutter for about 10 seconds. Then she picks up as if nothing happened and doesn\u2019t recall pausing. What\u2019s most likely happening, and what do you do?",
    options: [
      { k: "A", t: "She\u2019s just distracted \u2014 carry on and ignore it.", correct: false, fb: "That\u2019s the easy mistake. A brief blank stare with eyelid flutter and no memory of it is a classic absence seizure, not daydreaming." },
      { k: "B", t: "It looks like an absence seizure \u2014 stay with her, keep her safe, note the time, and report what you saw.", correct: true, fb: "Exactly. You don\u2019t call 911 for a brief one on its own, but you observe, keep her safe, and document it." },
      { k: "C", t: "Call 911 immediately \u2014 any seizure is an emergency.", correct: false, fb: "A single brief absence seizure isn\u2019t a 911 event on its own. Observe, keep her safe, and report it." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 4", title: "What to do during a seizure",
    lead: "Most seizures stop on their own within a couple of minutes. Your job isn\u2019t to stop it \u2014 it\u2019s to prevent injury and stay calm.",
    facts: [
      { t: "Time it.", b: "Say the start time out loud \u2014 duration decides what happens next." },
      { t: "Ease them down.", b: "If standing or sitting, help them gently to the floor." },
      { t: "Turn them on their side.", b: "This keeps the airway clear and lets saliva drain." },
      { t: "Protect the head.", b: "Cushion it; move hard or sharp objects out of the way." },
      { t: "Stay and stay calm.", b: "Keep timing and reassure others nearby." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The steps, in order", "1. Note the start time. 2. Ease them to the floor. 3. Turn them onto their side. 4. Cushion the head. 5. Move sharp objects away. 6. Loosen anything tight at the neck. 7. Stay, stay calm, keep timing."],
      ["What you must never do", "Never restrain them \u2014 it can tear muscles or break bones. Never put anything in the mouth \u2014 a person can\u2019t \u201cswallow their tongue,\u201d and objects break teeth or block the airway. Don\u2019t move them unless they\u2019re in danger (water, fire, traffic). No food, drink, or medication until fully awake."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "Marcus has no known seizure history. He suddenly stiffens, loses consciousness, and begins convulsing on the kitchen floor. What is your first move?",
    options: [
      { k: "A", t: "Hold his arms and legs still so he doesn\u2019t hurt himself.", correct: false, fb: "Never restrain someone seizing \u2014 it causes injury. Ease him down, turn him on his side, clear the area." },
      { k: "B", t: "Clear the space, turn him on his side, cushion his head, and note the time.", correct: true, fb: "Right \u2014 protect, position, and time it. And because it\u2019s his first known seizure, that\u2019s a 911 trigger." },
      { k: "C", t: "Put something soft between his teeth so he doesn\u2019t bite his tongue.", correct: false, fb: "Never put anything in the mouth \u2014 it breaks teeth or blocks the airway. Turning him on his side protects it." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "While you\u2019re helping someone through a seizure, a coworker rushes in and says, \u201cHold his arms down and put a wallet between his teeth!\u201d What do you do?",
    options: [
      { k: "A", t: "Help them restrain him and protect his tongue \u2014 two people are safer.", correct: false, fb: "Both actions cause harm. Restraint injures; nothing goes in the mouth. The tongue-swallowing idea is a myth." },
      { k: "B", t: "Calmly stop them, explain we never restrain or put anything in the mouth, and keep him on his side.", correct: true, fb: "Exactly \u2014 part of your job is protecting the person from well-meaning but harmful \u201chelp.\u201d" },
      { k: "C", t: "Step back and let the coworker take over since they spoke up first.", correct: false, fb: "Speaking first doesn\u2019t make them right. Calmly correct them and keep the person safe on their side." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 4", title: "When it becomes a 911 emergency",
    lead: "Most seizures end safely on their own. A few situations turn a seizure into a medical emergency \u2014 and the clock is the most important one.",
    callout: { v: "crit", t: "Call 911 immediately if", b: "it\u2019s their <b>first-ever</b> seizure, it lasts <b>5 minutes or more</b>, a <b>second seizure</b> starts before they wake up, they\u2019re <b>injured</b>, they have <b>trouble breathing</b> or don\u2019t wake up, it happens <b>in water</b>, or the person is <b>pregnant or diabetic</b>." },
    dropHeading: "Go further",
    drops: [
      ["Why five minutes matters (status epilepticus)", "Most seizures stop within one to three minutes. One lasting five minutes or longer \u2014 or repeating without the person waking up \u2014 is status epilepticus, a true emergency. The longer it runs, the higher the risk of lasting harm, so you call 911 at the five-minute mark, not later."],
      ["All the reasons to call 911", "First known seizure; lasts 5+ minutes; a second before they recover; injury; trouble breathing or not waking; it happens in water; the person is pregnant or diabetic. When unsure \u2014 call."],
      ["Seizure action plans", "Some people have an individual seizure action plan that sets their own time to call 911 or use a rescue medication. When a plan exists, follow it \u2014 it can set a different threshold than the general five-minute rule."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A person with a known seizure disorder is having a tonic-clonic seizure. You\u2019ve been timing it, and it has now passed 5 minutes and is still going. What do you do?",
    options: [
      { k: "A", t: "Keep waiting \u2014 they have a history, so it\u2019ll stop on its own.", correct: false, fb: "A known history doesn\u2019t change the clock. Past five minutes it\u2019s status epilepticus \u2014 waiting raises the risk of harm." },
      { k: "B", t: "Call 911 now, while continuing to keep them safe on their side.", correct: true, fb: "Correct. Five minutes (or the time in their plan), or back-to-back seizures without waking, means call 911." },
      { k: "C", t: "Call your supervisor first to ask whether to call 911.", correct: false, fb: "911 comes first \u2014 every minute counts. Notify your supervisor once help is on the way." },
    ] },
  { type: "lesson", kicker: "Lesson 4 of 4", title: "After the seizure",
    lead: "When the seizure stops, the person enters recovery \u2014 the \u201cpostictal\u201d phase. They may be confused, exhausted, emotional, embarrassed, or have no memory of it. How you respond now matters as much as during.",
    facts: [
      { t: "Stay with them.", b: "Keep them on their side until fully awake; check gently for injuries." },
      { t: "Reassure calmly.", b: "Tell them where they are and that they\u2019re safe \u2014 confusion and fear are normal." },
      { t: "Nothing by mouth yet.", b: "No food, drink, or medication until fully alert and able to swallow." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The recovery (postictal) phase", "The brain needs time to reset. Expect confusion, exhaustion, emotion, headache, or sore muscles, lasting minutes to hours. Be patient, speak calmly, give space, and don\u2019t rush them."],
      ["What to document", "Record the date and start time, how long it lasted, what you saw before/during/after, possible triggers (missed meal or meds, illness, poor sleep, flashing lights), any injuries, and how they recovered. Report it through your agency\u2019s process."],
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "A seizure has just stopped. The person is groggy and not fully alert. Another staff member hands them a glass of water and says, \u201cHere, drink this.\u201d What should you do?",
    options: [
      { k: "A", t: "Encourage them to drink \u2014 people need fluids after a seizure.", correct: false, fb: "Not yet \u2014 before someone is fully alert, drinking is a choking risk." },
      { k: "B", t: "Hold off until they\u2019re fully awake and can swallow safely; stay with them and reassure them.", correct: true, fb: "Right. Wait until fully alert before anything by mouth. Keep them comfortable on their side and reassure them." },
      { k: "C", t: "Give them their seizure medication right away to prevent another.", correct: false, fb: "Don\u2019t give medication on your own in recovery \u2014 only when alert and per their plan. Wait, reassure, document." },
    ] },
];

/* ───────────────────────── The full 30-day registry ─────────────────────────
   "E" is fully built as the template. Each "soon" entry just needs estMin,
   intro, steps[], and attest filled in using the same shape. */

const A_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "The 911 mindset",
    lead: "911 is for life-threatening emergencies \u2014 when someone\u2019s life, breathing, or safety is in immediate danger. Your job isn\u2019t to diagnose; it\u2019s to recognize an emergency and act fast.",
    callout: { v: "info", t: "When in doubt, call", b: "It is always better to call and be told it wasn\u2019t needed than to wait and be wrong. You will <b>never</b> be in trouble for calling 911 in good faith." },
    facts: [
      { t: "Call early.", b: "In an emergency, don\u2019t wait to \u201csee if it gets better.\u201d" },
      { t: "Stay with the person.", b: "Send someone else to unlock doors and flag down EMS." },
      { t: "Stay calm.", b: "Your calm keeps you effective and reassures the person." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Emergency vs. urgent \u2014 the difference", "A 911 emergency is immediate and life-threatening: not breathing, no pulse, severe bleeding, unresponsive, choking that isn\u2019t clearing, or signs of a stroke or heart attack. \u201cUrgent but not 911\u201d means the person needs care soon but is stable \u2014 a low fever, a small cut, mild vomiting. Those go to a nurse line, doctor, or urgent care (see \u201cWhen to call a medical professional\u201d)."],
      ["You don\u2019t need permission to call 911", "In a true emergency you call 911 first, then notify your supervisor. You never wait for approval. Hesitating to \u201ccheck first\u201d costs the minutes that matter most."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 4",
    stem: "You walk in and a person has collapsed and isn\u2019t breathing. What is your first move?",
    options: [
      { k: "A", t: "Call your supervisor to ask what to do.", correct: false, fb: "Not in a life-threatening emergency \u2014 that delay costs critical minutes. Call 911 first." },
      { k: "B", t: "Call 911 immediately, then begin CPR if you\u2019re trained and send someone for an AED.", correct: true, fb: "Right \u2014 call first, then act. Not breathing is always a 911 emergency." },
      { k: "C", t: "Wait a minute to see if they start breathing again.", correct: false, fb: "Never wait when someone isn\u2019t breathing. Call 911 now and begin CPR if trained." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Emergencies that mean call 911 now",
    lead: "Some signs are always a 911 call. Learn them so you react on instinct, not hesitation.",
    callout: { v: "crit", t: "Call 911 now for", b: "no breathing or no pulse; choking you can\u2019t clear; severe or uncontrolled bleeding; signs of a <b>heart attack or stroke</b>; a seizure lasting 5+ minutes or a first-ever seizure; unconsciousness you can\u2019t wake; a severe allergic reaction; a serious fall, head injury, or burn; or a suspected overdose or poisoning." },
    dropHeading: "Go further",
    drops: [
      ["Spotting a stroke \u2014 think FAST", "<b>F</b>ace: does one side droop? Ask them to smile. <b>A</b>rms: can they raise both, or does one drift down? <b>S</b>peech: is it slurred or strange? <b>T</b>ime: if you see any of these, call 911 and note the time it started \u2014 that time is critical for treatment."],
      ["Spotting a heart attack", "Chest pain or pressure, pain spreading to the arm, jaw, or back, shortness of breath, cold sweat, nausea, or sudden dizziness. Symptoms can be subtler in some people. Don\u2019t wait \u2014 call 911."],
      ["Severe allergic reaction (anaphylaxis)", "Trouble breathing, swelling of the face, lips, or throat, widespread hives, or sudden collapse after a food, sting, or medication. Call 911. If the person has a prescribed epinephrine auto-injector and a plan for it, that\u2019s part of an individual plan \u2014 follow it."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 4",
    stem: "A person\u2019s face is drooping on one side, one arm drifts down when they try to raise both, and their speech is slurred. What do you do?",
    options: [
      { k: "A", t: "Have them lie down and rest, then reassess in an hour.", correct: false, fb: "These are classic stroke signs (FAST). Waiting wastes the time that treatment depends on." },
      { k: "B", t: "Call 911 immediately and note the time the symptoms started.", correct: true, fb: "Exactly. Face, Arm, Speech \u2014 it\u2019s Time to call. The start time is critical information for the hospital." },
      { k: "C", t: "Give them water and an aspirin and wait to see if it passes.", correct: false, fb: "Don\u2019t give anything or wait \u2014 these are stroke signs. Call 911 and note the start time." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 4",
    stem: "A person has a small cut on their finger. It\u2019s bleeding a little but stops easily and can be covered with a bandage. What\u2019s the right response?",
    options: [
      { k: "A", t: "Call 911 \u2014 any bleeding is an emergency.", correct: false, fb: "This isn\u2019t a 911 situation. Save 911 for life-threatening emergencies; this is simple first aid." },
      { k: "B", t: "Clean and cover it, provide simple first aid, keep an eye on it, and report it.", correct: true, fb: "Right. Minor, controllable injuries are handled with first aid and documented \u2014 not 911." },
      { k: "C", t: "Ignore it \u2014 it\u2019s too small to matter.", correct: false, fb: "Even small injuries get basic care and a note. Clean it, cover it, and report it." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Making the call",
    lead: "When you call, calm and clear information helps EMS reach you and help the person faster.",
    facts: [
      { t: "Say where you are first.", b: "Full address and where in the building." },
      { t: "Say what\u2019s happening.", b: "What you see, and whether the person is breathing and conscious." },
      { t: "Don\u2019t hang up.", b: "Stay on until the dispatcher says so \u2014 they may coach you through CPR." },
      { t: "Afterward, report and document.", b: "Notify your supervisor and write down what happened." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What the dispatcher will ask", "Your location, the number you\u2019re calling from, what happened, whether the person is conscious and breathing, and any known conditions if you know them. Answer what you can \u2014 it\u2019s fine to say you don\u2019t know."],
      ["After the call", "Stay with the person until EMS arrives, keep them safe, and have someone direct EMS in. Then notify your supervisor and complete an incident report with the facts \u2014 time, what you saw, what you did."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 4",
    stem: "You\u2019re on the phone with the 911 dispatcher, who is giving you instructions. You feel unsure and want to hang up to call your supervisor. What\u2019s correct?",
    options: [
      { k: "A", t: "Hang up and call your supervisor for guidance.", correct: false, fb: "Don\u2019t hang up \u2014 the dispatcher is the right help in the moment. Call your supervisor afterward." },
      { k: "B", t: "Stay on the line, follow the dispatcher\u2019s instructions, and keep the person safe until help arrives.", correct: true, fb: "Right. The dispatcher is trained to guide you. Stay on, follow along, and keep the person safe." },
      { k: "C", t: "Put the phone down and go look for the person\u2019s file.", correct: false, fb: "Don\u2019t leave the call or the person. Stay on the line and follow the dispatcher." },
    ] },
];

const B_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 2", title: "The middle ground",
    lead: "Between \u201ceverything\u2019s fine\u201d and \u201ccall 911\u201d is a wide zone where a person needs medical guidance soon. Knowing when to call a medical professional keeps small problems from becoming emergencies.",
    callout: { v: "info", t: "Unsure? That\u2019s a reason to call", b: "If you\u2019re ever unsure whether something is a 911 emergency, that uncertainty is itself a reason to call someone \u2014 911 if it could be life-threatening, otherwise a nurse line or on-call clinician. Don\u2019t sit on it alone." },
    facts: [
      { t: "Changes from baseline matter.", b: "Someone who seems \u201coff,\u201d more tired, or more confused than usual deserves a call." },
      { t: "Trust the patterns.", b: "New pain, fever, vomiting, rashes, or refusing food or drink are worth reporting." },
      { t: "Document and communicate.", b: "Note what you saw and when, and pass it on." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Who counts as a medical professional to call", "Depending on your agency\u2019s setup: the person\u2019s nurse or on-call nurse line, their doctor\u2019s office, an on-call clinician, a pharmacist for medication questions, or Poison Control (1-800-222-1222) for a non-emergency ingestion. Follow your agency\u2019s chain for who to call first."],
      ["Signs to call a medical professional (not 911)", "A fever; persistent vomiting or diarrhea; a new or worsening rash; a minor injury that may need stitches but isn\u2019t bleeding severely; signs of an infection; new swelling or pain; a medication question or missed dose; constipation that\u2019s gone on too long; or any clear change from the person\u2019s normal baseline."],
      ["Poison Control", "For a suspected ingestion where the person is awake, breathing, and not in distress, call Poison Control at 1-800-222-1222 \u2014 they\u2019ll tell you what to do. If the person is unconscious, not breathing, seizing, or struggling to breathe, that\u2019s 911."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 4",
    stem: "A person has a fever of 101\u00b0F. They\u2019re tired but alert, drinking fluids, and breathing normally. What\u2019s the right call?",
    options: [
      { k: "A", t: "Call 911 \u2014 a fever is dangerous.", correct: false, fb: "A stable person with a low fever isn\u2019t a 911 case. This is a call to a medical professional." },
      { k: "B", t: "Contact the nurse or on-call medical line, report it, follow their guidance, and document it.", correct: true, fb: "Right \u2014 stable but unwell is exactly the \u201cmedical professional\u201d zone. Report, follow guidance, document." },
      { k: "C", t: "Wait until tomorrow and see how they feel.", correct: false, fb: "Don\u2019t sit on it \u2014 report it now and get guidance. Small problems can grow overnight." },
    ] },
  { type: "check", kicker: "Knowledge check 2 of 4",
    stem: "A person who is normally cheerful and chatty is suddenly very confused and unsteady and isn\u2019t making sense \u2014 but is conscious and breathing. What do you do?",
    options: [
      { k: "A", t: "Assume they\u2019re just tired and let them sleep it off.", correct: false, fb: "A sudden change like this is a red flag, not just tiredness. Don\u2019t wait it out." },
      { k: "B", t: "Treat the sudden change seriously \u2014 call a medical professional right away (and 911 if it could be a stroke or they worsen), stay with them, and document it.", correct: true, fb: "Exactly. A sudden change from baseline always gets escalated. If you see stroke signs, it\u2019s 911." },
      { k: "C", t: "Wait to see if they return to normal on their own.", correct: false, fb: "Sudden confusion needs attention now. Call for guidance, stay with them, and escalate to 911 if it could be a stroke." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 4",
    stem: "You realize a person may have missed a scheduled medication, and you\u2019re unsure what to do about the dose. What\u2019s the right step?",
    options: [
      { k: "A", t: "Guess and give what you think is right.", correct: false, fb: "Never guess with medication. A wrong dose can cause real harm." },
      { k: "B", t: "Don\u2019t guess \u2014 contact the nurse, on-call clinician, or pharmacist for guidance, and document it.", correct: true, fb: "Right. Medication questions always go to a professional, never a guess. Then document what you\u2019re told." },
      { k: "C", t: "Skip it and don\u2019t mention it to anyone.", correct: false, fb: "A missed dose must be reported and guided by a professional \u2014 never hidden." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 2", title: "Communicating clearly",
    lead: "When you call, clear information helps the professional help the person. A simple structure works: what you saw, when it started, and what\u2019s different from normal.",
    facts: [
      { t: "Say who you are and who the person is.", b: "Your role and the person you\u2019re supporting." },
      { t: "Describe what you see.", b: "Plain, specific terms \u2014 what, when it started, how it\u2019s changed." },
      { t: "Share relevant known info.", b: "Temperature, what they ate or drank, recent changes." },
      { t: "Write it down and follow through.", b: "Record the guidance, do it, and document." },
    ],
    dropHeading: "Go further",
    drops: [
      ["A simple way to report", "Lead with the change from normal (\u201cshe\u2019s usually up and about, but today she\u2019s been in bed and won\u2019t eat\u201d), give specifics and timing (\u201cstarted this morning, temp 101\u201d), and note anything you already did. Then follow and record the guidance you\u2019re given."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 4",
    stem: "After you call, the nurse gives you specific instructions. What\u2019s the right follow-through?",
    options: [
      { k: "A", t: "Do what the nurse says, write down the time and the instructions, and pass it on in your shift notes.", correct: true, fb: "Right. Follow professional guidance, document it, and communicate it so the next person knows." },
      { k: "B", t: "Remember it in your head and move on.", correct: false, fb: "It must be written down \u2014 memory isn\u2019t a record, and the next shift needs to know." },
      { k: "C", t: "Decide whether you agree before doing it.", correct: false, fb: "Follow the professional\u2019s guidance. If you have a real concern, raise it with them or your supervisor \u2014 don\u2019t quietly override it." },
    ] },
];

const C_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 2", title: "Recognizing a mental health concern",
    lead: "Mental health needs are as real as physical ones. People you support may experience anxiety, depression, trauma responses, or crises. Recognizing when someone needs professional mental health support \u2014 and responding calmly \u2014 keeps them safe.",
    callout: { v: "info", t: "You\u2019re not expected to be a therapist", b: "You are expected to <b>notice</b> when someone is struggling, respond with calm and respect, and get the right professional involved." },
    facts: [
      { t: "Notice changes.", b: "Withdrawal, sudden mood shifts, agitation, not sleeping or eating, talk of hopelessness." },
      { t: "Stay calm and present.", b: "A steady, non-judgmental presence helps de-escalate." },
      { t: "Take statements seriously.", b: "Never dismiss talk of self-harm or hopelessness." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Who to call for mental health concerns", "Depending on your agency: the person\u2019s therapist, counselor, or behavioral health provider; an on-call mental health clinician; a mobile crisis team; or the 988 Suicide and Crisis Lifeline (call or text 988) for someone in emotional crisis. For immediate danger to life, call 911."],
      ["Signs someone may need mental-health support", "Ongoing sadness or hopelessness; withdrawing from people and activities; big changes in sleep or appetite; rising agitation, anger, or anxiety; talking about being a burden or wanting to disappear; or any talk or signs of self-harm. Trust what you notice and report it."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 4",
    stem: "A person quietly tells you they feel hopeless and that \u201ceveryone would be better off without me.\u201d What do you do?",
    options: [
      { k: "A", t: "Change the subject to cheer them up, and keep it between the two of you.", correct: false, fb: "Never dismiss or hide this. Statements like these are taken seriously and acted on." },
      { k: "B", t: "Take it seriously, stay calm and with them, don\u2019t leave them alone, and contact a mental health professional or the 988 Lifeline right away \u2014 911 if there\u2019s immediate danger.", correct: true, fb: "Right. Stay, listen, don\u2019t leave them alone, and get professional help engaged now." },
      { k: "C", t: "Tell them not to talk like that and that they\u2019ll feel better tomorrow.", correct: false, fb: "That shuts the person down. Take it seriously, stay with them, and get the right help involved." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 2", title: "Crisis vs. emergency, and how to respond",
    lead: "A mental health crisis means someone is overwhelmed and may be at risk. It becomes a 911 emergency when there is immediate danger to their life or someone else\u2019s.",
    callout: { v: "crit", t: "Call 911 right away if", b: "a person is in <b>immediate danger</b> \u2014 actively trying to harm themselves or someone else, or when their safety can\u2019t be kept in the moment. Otherwise, a crisis line (988), the on-call clinician, or a mobile crisis team is the right call. When in doubt about immediate danger, treat it as 911." },
    facts: [
      { t: "Stay with them.", b: "Don\u2019t leave a person in crisis alone." },
      { t: "Listen without judgment.", b: "Let them talk; don\u2019t argue, rush, or minimize." },
      { t: "Keep everyone safe.", b: "Reduce access to anything that could be used for harm; move away from danger." },
    ],
    dropHeading: "Go further",
    drops: [
      ["How to respond in the moment", "Speak calmly and slowly, use the person\u2019s name, listen more than you talk, and don\u2019t make promises you can\u2019t keep. Don\u2019t debate their feelings or rush them. Your goal is to keep them safe and connected until professional help is engaged."],
      ["The 988 Suicide and Crisis Lifeline", "Anyone can call or text 988, any time, to reach trained crisis counselors \u2014 a resource for the person you support and for you if a situation has shaken you. For immediate, life-threatening danger, call 911."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 4",
    stem: "A person is extremely agitated and distressed, but is not in immediate physical danger. What\u2019s the best first response?",
    options: [
      { k: "A", t: "Walk away to give them space and deal with it later.", correct: false, fb: "Don\u2019t leave a person in crisis alone, and don\u2019t delay. Stay, stay calm, and get help engaged." },
      { k: "B", t: "Stay calm and present, listen without judgment, keep them and others safe, and contact the mental health professional or crisis line.", correct: true, fb: "Right. Calm presence first, safety always, and the right professional engaged." },
      { k: "C", t: "Restrain them so they calm down.", correct: false, fb: "Restraint is never a first response. Use calm presence and positive supports, and get professional help." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 4",
    stem: "A person is actively attempting to harm themselves right now. What do you do?",
    options: [
      { k: "A", t: "Call the therapist\u2019s office and leave a voicemail.", correct: false, fb: "Far too slow for immediate danger. Active, immediate risk to life is 911." },
      { k: "B", t: "Call 911 immediately, stay with them, keep them and yourself safe, and follow the dispatcher\u2019s guidance.", correct: true, fb: "Right. Immediate danger to life is always 911. Stay, keep everyone safe, and follow the dispatcher." },
      { k: "C", t: "Wait for your supervisor to arrive before doing anything.", correct: false, fb: "Don\u2019t wait \u2014 call 911 now and stay with them. Notify your supervisor after help is on the way." },
    ] },
  { type: "check", kicker: "Knowledge check 4 of 4",
    stem: "A crisis has passed and the person is stable again. What\u2019s the right follow-up?",
    options: [
      { k: "A", t: "Document what happened, report to your supervisor, and make sure the right professionals and plans are looped in.", correct: true, fb: "Right. Accurate documentation and reporting get the person the ongoing support they need." },
      { k: "B", t: "Don\u2019t write anything down, to protect their privacy.", correct: false, fb: "Documentation is required \u2014 it\u2019s shared only with those who need it to support the person. That\u2019s confidentiality, not silence." },
      { k: "C", t: "Tell other people you know about what happened.", correct: false, fb: "That breaks confidentiality. Information is shared only with those who need it to help the person." },
    ] },
];

const G_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "Recognizing choking",
    lead: "Choking happens when something blocks the airway, and seconds matter. Your first job is to recognize it fast and tell the difference between mild choking, where the person can still cough or speak, and severe choking, where they can\u2019t.",
    callout: { v: "info", t: "Mild vs. severe is the key call", b: "<b>Mild:</b> the person can cough, speak, or breathe \u2014 let them keep coughing. <b>Severe:</b> they can\u2019t cough, speak, or breathe \u2014 act immediately." },
    facts: [
      { t: "The universal sign.", b: "Hands clutching the throat \u2014 learn to spot it instantly." },
      { t: "Mild choking: let them cough.", b: "Coughing is the most effective way to clear it. Don\u2019t interfere." },
      { t: "Severe choking: act now.", b: "Silent, panicked, can\u2019t breathe, may turn pale or blue." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Mild vs. severe choking", "Mild (partial) blockage: the person can still cough forcefully, make sounds, or breathe. Encourage them to keep coughing \u2014 don\u2019t slap their back or interfere. Severe (complete) blockage: they can\u2019t cough, speak, or breathe, may grab their throat, look panicked, and their skin may turn pale or bluish. This is an emergency \u2014 act immediately."],
      ["When the person can\u2019t tell you", "Some people you support may not be able to say they\u2019re choking. Watch for sudden silence while eating, panic, clutching the throat, color changes, drooling, or distress. If you suspect choking and the person can\u2019t breathe, treat it as severe."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "During lunch, a person suddenly starts coughing hard. They\u2019re still able to cough forcefully and gasp out a few words. What do you do?",
    options: [
      { k: "A", t: "Start back blows and abdominal thrusts right away.", correct: false, fb: "Not yet \u2014 they\u2019re moving air and coughing, which is the best way to clear it. Interfering can make it worse." },
      { k: "B", t: "Encourage them to keep coughing, stay with them, and watch closely in case it turns severe.", correct: true, fb: "Right. A forceful cough is doing the work. Stay close and be ready to act if they can no longer cough, speak, or breathe." },
      { k: "C", t: "Give them water to wash it down.", correct: false, fb: "Don\u2019t give anything to drink \u2014 with the airway partly blocked it can make things worse. Encourage coughing and watch closely." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Helping someone who is choking",
    lead: "When the person can\u2019t cough, speak, or breathe, act right away. This is an orientation to the common maneuvers \u2014 your hands-on first-aid and CPR certification is where you practice them for real.",
    callout: { v: "crit", t: "Get 911 coming", b: "If the person can\u2019t breathe, have someone <b>call 911 immediately</b> while you begin. If you\u2019re alone, give care first, then call." },
    facts: [
      { t: "Call for help.", b: "Have someone call 911 while you act." },
      { t: "5 back blows.", b: "Heel of the hand, firmly between the shoulder blades." },
      { t: "5 abdominal thrusts.", b: "Just above the navel, quick and inward-and-upward." },
      { t: "Keep alternating.", b: "Until the object clears, they can breathe, or they go unresponsive." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Abdominal thrusts (the Heimlich), step by step", "Stand behind the person and wrap your arms around their waist. Make a fist and place the thumb side just above the navel, well below the breastbone. Grasp your fist with your other hand and give quick, firm thrusts inward and upward, as if trying to lift them. Each thrust is a separate effort to pop the object out. Alternate 5 back blows and 5 thrusts."],
      ["If the person becomes unresponsive", "Lower them safely to the ground, make sure 911 has been called, and begin CPR if you\u2019re trained \u2014 chest compressions can help dislodge the object. Each time you open the airway, look in the mouth and remove an object only if you can clearly see it. Never do a blind finger sweep. Continue until help arrives."],
      ["When abdominal thrusts won\u2019t work", "If you can\u2019t get your arms around the person\u2019s abdomen \u2014 for example, if they\u2019re pregnant or very large \u2014 give chest thrusts instead: fist on the center of the breastbone, thrust straight back. For someone in a wheelchair, you can still give back blows and thrusts; position yourself to reach around them. Follow your hands-on training."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "A person is clutching their throat, can\u2019t make any sound, and can\u2019t breathe. What is your first action?",
    options: [
      { k: "A", t: "Offer water and wait to see if it clears.", correct: false, fb: "No \u2014 they can\u2019t breathe. This is a severe blockage that needs immediate action." },
      { k: "B", t: "Have someone call 911 and begin back blows and abdominal thrusts.", correct: true, fb: "Right. Get 911 coming and start the maneuvers immediately \u2014 alternate 5 back blows and 5 abdominal thrusts." },
      { k: "C", t: "Reach into their mouth and sweep with your fingers to find the object.", correct: false, fb: "Never do a blind finger sweep \u2014 it can push the object deeper. Use back blows and abdominal thrusts." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "You\u2019ve been giving back blows and thrusts, and the person suddenly goes limp and unresponsive. What do you do?",
    options: [
      { k: "A", t: "Keep giving abdominal thrusts while they lie on the floor.", correct: false, fb: "Once they\u2019re unresponsive the response changes \u2014 it\u2019s time for CPR if you\u2019re trained." },
      { k: "B", t: "Lower them safely, make sure 911 is called, and begin CPR if trained \u2014 checking the mouth for a visible object before breaths.", correct: true, fb: "Right. Compressions can help dislodge it; remove an object only if you can clearly see it." },
      { k: "C", t: "Wait for them to wake up on their own.", correct: false, fb: "Don\u2019t wait \u2014 ensure 911 is coming and begin CPR if trained." },
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "In the middle of helping, someone shouts \u201cjust stick your fingers down their throat and grab it!\u201d What\u2019s correct?",
    options: [
      { k: "A", t: "Do a blind finger sweep \u2014 it\u2019s the fastest way to get it out.", correct: false, fb: "A blind finger sweep can push the object deeper and cause injury. Don\u2019t do it." },
      { k: "B", t: "Don\u2019t sweep blindly \u2014 only remove an object you can clearly see; otherwise keep up back blows and thrusts.", correct: true, fb: "Right. Remove only what you can see. Otherwise continue the maneuvers until it clears or they go unresponsive." },
      { k: "C", t: "Stop the thrusts and only slap the back as hard as you can.", correct: false, fb: "Back blows alone aren\u2019t the method \u2014 alternate 5 back blows with 5 abdominal thrusts." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "After a choking episode",
    lead: "Even once the object clears, the person isn\u2019t necessarily in the clear. Follow-up matters.",
    facts: [
      { t: "Stay with them.", b: "Watch their breathing and comfort them \u2014 it\u2019s frightening." },
      { t: "Get them checked.", b: "Anyone who got thrusts, lost consciousness, or still coughs needs medical evaluation." },
      { t: "Document and report.", b: "Record what happened and what you did." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Why medical follow-up matters", "Abdominal thrusts can injure internal organs, and a partly cleared airway may still have material in it or swell. Anyone who received thrusts, lost consciousness, or has ongoing coughing, trouble swallowing, or breathing should be evaluated by a medical professional. Report and document the episode."],
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "The object cleared after you gave abdominal thrusts, and the person now seems to be breathing fine. What\u2019s the right step?",
    options: [
      { k: "A", t: "Carry on with the day \u2014 they\u2019re fine now.", correct: false, fb: "Not quite \u2014 thrusts can cause internal injury and the airway may not be fully clear. They need to be checked." },
      { k: "B", t: "Have them evaluated by a medical professional, keep watching them, and document the episode.", correct: true, fb: "Right. Anyone who got abdominal thrusts should be medically evaluated, even if they seem okay." },
      { k: "C", t: "Give them a big meal since they missed lunch.", correct: false, fb: "No \u2014 they need monitoring and a medical check first, not more food right away." },
    ] },
];

const H_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "Why choking risk is higher",
    lead: "People with disabilities can have a higher risk of choking \u2014 from swallowing difficulties, eating too fast, certain medications, missing teeth, or medical conditions. Prevention is mostly about food texture, pace, positioning, and supervision.",
    callout: { v: "info", t: "Prevention is the everyday work", b: "The Heimlich is the emergency backup. The real goal is to set things up so you <b>never need it</b>." },
    facts: [
      { t: "Watch the pace.", b: "Eating or drinking too fast is a top cause of choking." },
      { t: "Texture matters.", b: "Some people need food cut small, mashed, or pureed." },
      { t: "Position matters.", b: "Sit upright to eat, and stay upright afterward." },
      { t: "Know who to watch.", b: "Some people need supervision while eating." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What raises choking risk", "Swallowing difficulties (dysphagia), eating or drinking too quickly, large bites, talking or laughing while eating, medications that cause dry mouth or drowsiness, missing or poor teeth, neurological conditions, and a history of choking. Some people also put non-food items in their mouth (pica), which is its own risk."],
      ["High-risk foods to watch", "Common choking foods include hot dogs, grapes, hard or raw vegetables, nuts and seeds, popcorn, hard candy, chunks of meat, and sticky foods like peanut butter, bread, and marshmallows \u2014 anything tough, round, or that doesn\u2019t break down easily. How food is prepared matters as much as what it is."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A person you support tends to eat very fast and take huge bites. How do you help prevent choking?",
    options: [
      { k: "A", t: "Let them eat however they like \u2014 it\u2019s their choice.", correct: false, fb: "Choking is a health and safety issue. You honor independence by adding supports, not by ignoring a real risk." },
      { k: "B", t: "Support a slower pace and smaller bites \u2014 plate smaller portions, offer gentle reminders, and stay present.", correct: true, fb: "Right. Small, respectful supports like portioning and pacing reduce risk while keeping mealtimes dignified." },
      { k: "C", t: "Only step in once they actually start choking.", correct: false, fb: "Prevention happens before the choke. Set up pace and portions so it\u2019s far less likely to happen." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Everyday prevention",
    lead: "Most prevention comes down to four things you can do at every meal: texture, pace, position, and attention.",
    facts: [
      { t: "Follow the prescribed texture.", b: "Chopped, minced, pureed, or thickened liquids \u2014 exactly as ordered." },
      { t: "Small bites, slow pace.", b: "One bite at a time, fully chewed." },
      { t: "Upright posture.", b: "Sit up to eat; stay upright 20\u201330 minutes after." },
      { t: "Stay attentive.", b: "Never leave a high-risk person unsupervised while eating." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Modified diets and thickened liquids", "Some people have a prescribed diet texture \u2014 chopped, ground/minced, or pureed \u2014 or thickened liquids, because a professional found a swallowing risk. These aren\u2019t suggestions; the wrong texture can cause choking or aspiration. If you\u2019re unsure what texture a person is on, ask before serving \u2014 never guess."],
      ["Mealtime setup that prevents choking", "Seat the person upright at about 90 degrees, reduce distractions and rushing, serve appropriate portions, encourage one bite at a time and full chewing, offer sips as appropriate, and stay attentive. Keep things calm so the person isn\u2019t talking or laughing with a full mouth."],
      ["Aspiration \u2014 the quieter danger", "Aspiration is when food or liquid goes toward the lungs instead of the stomach. Signs include coughing during meals, a wet or gurgly voice, or later pneumonia. If you notice frequent coughing, throat-clearing, or a wet voice at meals, report it \u2014 the person may need a swallowing evaluation."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "A person is prescribed pureed food, but the kitchen sent a regular sandwich and you\u2019re not sure what to do. What\u2019s the right step?",
    options: [
      { k: "A", t: "Serve the sandwich \u2014 they\u2019ll probably be fine.", correct: false, fb: "Never serve against a prescribed texture. A pureed-diet order exists because regular food is a real choking or aspiration risk." },
      { k: "B", t: "Don\u2019t guess \u2014 confirm the prescribed texture and get the correct food before serving.", correct: true, fb: "Right. The texture order is a medical instruction. Confirm and serve what\u2019s prescribed." },
      { k: "C", t: "Cut the sandwich into small pieces and serve it.", correct: false, fb: "Chopped is not the same as pureed. Cutting it up doesn\u2019t meet the order \u2014 get the correct texture." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person likes to eat while reclining back on the couch. What\u2019s the best support?",
    options: [
      { k: "A", t: "Let them eat reclined \u2014 comfort matters most.", correct: false, fb: "Reclining while eating raises the risk of choking and aspiration. Comfort and safety can both be met sitting upright." },
      { k: "B", t: "Support them to sit upright to eat and stay upright afterward.", correct: true, fb: "Right. Upright posture helps food go down safely. Encourage staying upright for a while after the meal, too." },
      { k: "C", t: "Only worry about position if they\u2019ve choked before.", correct: false, fb: "Don\u2019t wait for a choke. Upright eating is basic prevention for everyone, especially higher-risk people." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Spotting trouble early",
    lead: "Prevention also means noticing early signs and knowing about non-food risks like pica.",
    facts: [
      { t: "Watch for signs.", b: "Coughing, wet voice, throat-clearing, or holding food in the cheeks." },
      { t: "Report changes.", b: "New coughing at meals may mean a swallowing change." },
      { t: "Know about pica.", b: "Some people mouth or swallow non-food items \u2014 keep risky items out of reach." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Pica and non-food choking risks", "Some people put non-food objects in their mouths \u2014 small toys, batteries, coins, parts of things. This is a real choking and poisoning risk. Know who has this risk, keep small and dangerous items out of reach, supervise as their plan requires, and report incidents."],
      ["When to report a swallowing change", "If a person starts coughing more at meals, develops a wet or gurgly voice, takes much longer to eat, holds food in their cheeks, refuses to eat, or loses weight, report it. These can signal a swallowing problem that needs evaluation \u2014 catching it early prevents choking and aspiration pneumonia."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "Over the past week you\u2019ve noticed a person coughing a lot during meals, and their voice sometimes sounds wet and gurgly afterward. What do you do?",
    options: [
      { k: "A", t: "Ignore it unless they actually choke.", correct: false, fb: "These are early warning signs of a swallowing problem. Reporting now can prevent a choke or pneumonia later." },
      { k: "B", t: "Report it \u2014 new coughing and a wet voice at meals can signal a swallowing problem that needs evaluation.", correct: true, fb: "Right. Early reporting gets the person a swallowing evaluation before something serious happens." },
      { k: "C", t: "Stop giving them all liquids.", correct: false, fb: "That\u2019s not your call and could cause dehydration. Report the signs so a professional can evaluate and adjust." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "A person who is known to put small objects in their mouth is in a room with small craft beads left within reach. What\u2019s the best response?",
    options: [
      { k: "A", t: "Leave it \u2014 they haven\u2019t swallowed anything yet.", correct: false, fb: "Don\u2019t wait for an incident. Prevention means removing the hazard before it\u2019s used." },
      { k: "B", t: "Move the small items out of reach, supervise as their plan requires, and report the situation.", correct: true, fb: "Right. Reduce the hazard, provide the supervision their plan calls for, and report so the team can prevent a repeat." },
      { k: "C", t: "Tell them not to touch the beads and walk away.", correct: false, fb: "A verbal reminder isn\u2019t enough for a known pica risk \u2014 remove the items and supervise as the plan requires." },
    ] },
];

const D_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "What an incident is, and why reporting matters",
    lead: "An incident is any unusual, unexpected, or serious event involving a person you support \u2014 an injury, a fall, a medication error, a behavioral crisis, suspected abuse or neglect, a person missing, a hospitalization, or a death. Reporting protects the person and is required.",
    callout: { v: "info", t: "When in doubt, report it", b: "It\u2019s always better to report something that turns out minor than to stay silent about something that mattered." },
    facts: [
      { t: "Report promptly.", b: "Incidents are time-sensitive \u2014 tell your supervisor right away." },
      { t: "Stick to facts.", b: "What you saw, when, who was involved, and what you did." },
      { t: "It\u2019s not optional.", b: "Failing to report can harm the person and is a serious violation." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What counts as a reportable incident", "Injuries or accidents, falls, medication errors, a behavioral or mental-health crisis, any suspected abuse, neglect, or exploitation, a person whose whereabouts are unknown, an emergency room visit or hospitalization, use of any restraint, a serious safety event, law-enforcement involvement, and a death. When unsure whether something qualifies, report it and let your supervisor decide."],
      ["Why timing matters", "Critical incidents have strict deadlines: your agency must start the incident report within 24 hours of discovery (which notifies the person\u2019s Support Coordinator) and complete the detailed report within five business days. Because the clock starts when the incident is discovered, the moment you become aware of something, tell your supervisor so it\u2019s filed on time."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A person trips and scrapes their knee. It\u2019s minor, and you clean and bandage it. Do you report it?",
    options: [
      { k: "A", t: "No \u2014 it\u2019s too minor to bother with.", correct: false, fb: "Even minor injuries get documented. You don\u2019t decide alone what\u2019s \u201ctoo small\u201d \u2014 report it and let your supervisor judge." },
      { k: "B", t: "Yes \u2014 report it through your agency\u2019s process; minor injuries are still documented, and your supervisor decides what rises to a critical incident.", correct: true, fb: "Right. Report it with the facts. It\u2019s better to over-report than to miss something that mattered." },
      { k: "C", t: "Only if the person asks you to report it.", correct: false, fb: "Reporting isn\u2019t up to the person\u2019s request \u2014 it\u2019s your responsibility whenever an incident occurs." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "How to report: facts, timing, and content",
    lead: "A good incident report is prompt, factual, and objective \u2014 what you saw and did, not your guesses about why.",
    facts: [
      { t: "Report the same day.", b: "Notify your supervisor or file in Hive as soon as you discover it." },
      { t: "Include the facts.", b: "Who, what, when, where, what you observed, and what you did." },
      { t: "Be objective.", b: "Write what you saw and heard \u2014 not opinions or blame." },
      { t: "Note who you notified.", b: "911, the nurse, your supervisor, the guardian." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What to include in the report", "The person\u2019s name, the date and time it happened (and when you discovered it), where it happened, exactly what you observed in objective terms, what you did in response, anyone you notified, and any injuries or follow-up. Stick to facts you witnessed."],
      ["Objective vs. subjective \u2014 writing it down", "Objective: \u201cAt 2:15 pm I found Sam sitting on the floor by his bed holding his left wrist; he said it hurt. I called the nurse at 2:20.\u201d Avoid: \u201cSam was being careless and probably fell because he wasn\u2019t paying attention.\u201d Report what you saw and heard, with times and actions \u2014 not assumptions about cause or blame."],
      ["Reports involving abuse, neglect, or exploitation", "If the incident involves suspected abuse, neglect, or exploitation, it goes through the incident process \u2014 and it also gets reported to Adult Protective Services and/or the police (covered in its own training). Reporting suspected abuse is mandatory and time-sensitive; never wait to \u201cbe sure.\u201d"],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "Which of these is the right way to document what happened in an incident report?",
    options: [
      { k: "A", t: "\u201cThe staff before me must not have been watching him.\u201d", correct: false, fb: "That\u2019s speculation and blame, not observation. Report only what you witnessed." },
      { k: "B", t: "\u201cAt 9:40 am I found Maria on the floor next to her chair. She said she slipped. I helped her up, saw no injury, and notified my supervisor at 9:45.\u201d", correct: true, fb: "Right \u2014 objective, factual, and timed, with the actions you took and who you notified." },
      { k: "C", t: "\u201cMaria fell because she\u2019s clumsy and never listens.\u201d", correct: false, fb: "That\u2019s opinion and is disrespectful. Stick to what you observed, with times and actions." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "You come on shift and learn something happened on the previous shift that was never reported. What do you do?",
    options: [
      { k: "A", t: "It happened on someone else\u2019s shift \u2014 not your problem.", correct: false, fb: "The reporting clock starts when an incident is discovered \u2014 and you just discovered it. Report it now." },
      { k: "B", t: "Report it now through your agency\u2019s process and tell your supervisor.", correct: true, fb: "Right. Discovery triggers the report. File it promptly so deadlines are still met." },
      { k: "C", t: "Ask the previous staff to deal with it whenever they\u2019re back.", correct: false, fb: "Don\u2019t wait or pass it off \u2014 report it now, since you\u2019re the one who became aware of it." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Confidentiality, no retaliation, and what not to do",
    lead: "Reporting comes with responsibilities and protections. Your job is to report the facts \u2014 not to investigate or decide who\u2019s at fault.",
    facts: [
      { t: "Keep it confidential.", b: "Share details only with those who need to know to respond." },
      { t: "Don\u2019t investigate it yourself.", b: "Report the facts; the agency and authorities investigate." },
      { t: "No retaliation.", b: "You can\u2019t be punished for reporting in good faith." },
      { t: "Cooperate.", b: "Provide additional information if it\u2019s requested." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Don\u2019t investigate, don\u2019t alter \u2014 just report", "Your job is to report what you observed, accurately and promptly, and to keep the person safe. It\u2019s not your job to interrogate anyone, decide who\u2019s at fault, or wait until you have \u201cproof.\u201d Don\u2019t change or delay your report to protect yourself or a coworker. The agency, Support Coordinator, and authorities handle the investigation."],
      ["Confidentiality and good-faith protection", "Share incident information only with those who need it to respond \u2014 your supervisor, the nurse, the Support Coordinator, authorities. Don\u2019t discuss it with people who aren\u2019t involved. And reporting in good faith is protected: you should never face retaliation for reporting an injury, a concern, or suspected abuse."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A coworker was involved in an incident and quietly asks you to leave it out of your report or \u201csoften\u201d it. What do you do?",
    options: [
      { k: "A", t: "Leave it out to protect your coworker.", correct: false, fb: "Omitting or falsifying a report is a serious violation that can endanger the person. Report it truthfully." },
      { k: "B", t: "Report the facts accurately and completely, even though a coworker was involved.", correct: true, fb: "Right. Truthful reporting is required and protected \u2014 you can\u2019t be retaliated against for it." },
      { k: "C", t: "Write a vague version so no one gets in trouble.", correct: false, fb: "Vague or altered reports defeat the purpose and are a violation. Document the facts clearly." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "After an incident, who can you discuss the details with?",
    options: [
      { k: "A", t: "Anyone who asks \u2014 people are naturally curious.", correct: false, fb: "No \u2014 that breaks confidentiality. Details go only to those who need them to respond." },
      { k: "B", t: "Only those who need to know to respond \u2014 your supervisor, the nurse, the Support Coordinator, and authorities as required.", correct: true, fb: "Right. Incident details are confidential and shared on a need-to-know basis." },
      { k: "C", t: "Post about it without names on social media to vent.", correct: false, fb: "Never \u2014 even without names, that\u2019s a confidentiality breach. Keep it within the people who need to know." },
    ] },
];

const K_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "The three harms, and your duty",
    lead: "Abuse, neglect, and exploitation are the most serious harms the people you support can face \u2014 and you are their front line. You are a mandatory reporter: if you suspect it, you must report it. You don\u2019t need proof, and it isn\u2019t your job to investigate.",
    callout: { v: "crit", t: "You are a mandatory reporter", b: "If you <b>suspect</b> abuse, neglect, or exploitation, you must report it \u2014 promptly, every time. Suspicion is enough; you never need to prove it first." },
    facts: [
      { t: "Abuse.", b: "Causing harm \u2014 physical, sexual, or emotional/verbal." },
      { t: "Neglect.", b: "Failing to provide for needs \u2014 food, hygiene, medical care, supervision, safety." },
      { t: "Exploitation.", b: "Misusing a person\u2019s money, property, benefits, or identity." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Abuse \u2014 the forms it takes", "Physical: hitting, slapping, rough handling, improper restraint, or any physical harm. Sexual: any unwanted or non-consensual sexual contact or behavior. Emotional or verbal: threats, intimidation, humiliation, yelling, isolating a person, or treating them in a degrading way. Abuse can be a single act or a pattern."],
      ["Neglect \u2014 including self-neglect", "Failing to provide the care, supervision, food, hygiene, medical attention, or safety a person needs. It can be active (withholding care) or passive (not knowing or not doing it). Self-neglect is when a person can\u2019t meet their own basic needs and safety. All of it is reportable."],
      ["Exploitation \u2014 financial and more", "Misusing a person\u2019s money, property, benefits, or identity for someone else\u2019s gain \u2014 stealing, coercing them to hand over money, forging a signature, using their bank card, or pressuring them into financial decisions. Because many people you support rely on others to manage funds, this risk is real and serious."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "Which of these is an example of exploitation?",
    options: [
      { k: "A", t: "A staff member uses a person\u2019s debit card to buy themselves lunch.", correct: true, fb: "Right \u2014 using a person\u2019s money or property for someone else\u2019s benefit is financial exploitation, and it\u2019s reportable." },
      { k: "B", t: "A person chooses to spend their own money on a video game.", correct: false, fb: "That\u2019s the person exercising their own right to spend their money \u2014 not exploitation." },
      { k: "C", t: "A staff member helps a person budget for rent.", correct: false, fb: "That\u2019s appropriate support, not exploitation. Exploitation is misusing the person\u2019s funds for someone else\u2019s gain." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Spotting the warning signs",
    lead: "You won\u2019t always be told \u2014 more often, you\u2019ll notice. Learn the signs so a concern doesn\u2019t slip past you.",
    facts: [
      { t: "Physical signs.", b: "Unexplained bruises or injuries, weight loss, poor hygiene, untreated conditions." },
      { t: "Behavioral signs.", b: "Fear of a person, flinching, withdrawal, sudden mood or behavior changes." },
      { t: "Financial signs.", b: "Missing money or belongings, unusual transactions, a new person controlling funds." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Signs worth a closer look", "Unexplained or repeated injuries, or injuries that don\u2019t match the explanation; fearfulness or flinching around a particular person; sudden withdrawal or behavior change; poor hygiene or untreated medical needs; weight loss or dehydration; missing money or belongings; or someone new suddenly controlling the person\u2019s money or decisions. One sign isn\u2019t proof \u2014 but it\u2019s a reason to report your concern."],
      ["Why this population is at higher risk", "People with disabilities may depend on others for care and money, may have trouble communicating what happened, may not recognize mistreatment, or may fear they won\u2019t be believed. That dependence and vulnerability is exactly why your watchfulness \u2014 and your willingness to report \u2014 matters so much."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "A normally outgoing person has become withdrawn, flinches whenever one particular staff member is nearby, and has a bruise they can\u2019t explain. What do you do?",
    options: [
      { k: "A", t: "Wait and watch for a few weeks to be sure before saying anything.", correct: false, fb: "Don\u2019t wait. Suspicion is enough to report \u2014 delay can leave the person in harm." },
      { k: "B", t: "Report your concern right away through the proper channels \u2014 you don\u2019t need proof.", correct: true, fb: "Right. These signs warrant a report now. It isn\u2019t your job to confirm it first." },
      { k: "C", t: "Confront the staff member yourself to find out what happened.", correct: false, fb: "Never confront or investigate \u2014 that can endanger the person and the investigation. Report it." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "How and where to report",
    lead: "Reporting is mandatory and prompt, and it goes to the right authorities \u2014 not only inside your agency.",
    callout: { v: "crit", t: "It\u2019s more than an internal report", b: "Suspected abuse, neglect, or exploitation also goes to <b>Adult Protective Services and/or the police</b>, not just an internal incident report. In an emergency or immediate danger, call <b>911</b> first." },
    facts: [
      { t: "Immediate danger \u2192 911.", b: "Safety first, always." },
      { t: "Report to the authorities.", b: "Utah Adult Protective Services: 1-800-371-7897, or the police for a crime." },
      { t: "Also use your agency\u2019s process.", b: "Complete the incident report too \u2014 they work together." },
      { t: "Report directly.", b: "Telling a supervisor doesn\u2019t end your personal duty." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Where reports go", "For a vulnerable adult, Utah Adult Protective Services (APS) takes reports at 1-800-371-7897. For a child, it\u2019s the Division of Child and Family Services (DCFS). For a crime or immediate danger, call the police / 911. You also complete your agency\u2019s incident report. These can happen together \u2014 one doesn\u2019t replace the others."],
      ["Your duty is personal \u2014 and protected", "As a mandatory reporter, the obligation is yours: telling a supervisor is good, but it does not transfer or end your legal duty to report to the authorities. Reporting in good faith is confidential and protected \u2014 you cannot be retaliated against, even if it turns out unfounded. Failing to report can carry serious legal consequences."],
      ["What to do \u2014 and not do", "Do: make sure the person is safe, call 911 if there\u2019s immediate danger, report to APS or the police and through your agency, and write down the facts you observed. Don\u2019t: confront the suspected person, investigate, promise secrecy, or wait for proof. Preserve anything that might be evidence."],
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "You report a suspicion to your supervisor, who says \u201cI\u2019ll handle it, don\u2019t worry about it.\u201d Weeks pass and nothing seems to happen. What\u2019s your responsibility?",
    options: [
      { k: "A", t: "Nothing more \u2014 you told your supervisor, so it\u2019s their problem now.", correct: false, fb: "Your duty doesn\u2019t transfer. As a mandatory reporter, the obligation stays with you." },
      { k: "B", t: "You can and should report directly to Adult Protective Services or the police yourself.", correct: true, fb: "Right. Telling a supervisor doesn\u2019t end your personal duty to report to the authorities." },
      { k: "C", t: "Drop it, since your supervisor outranks you.", correct: false, fb: "Rank doesn\u2019t override your legal duty. Report it directly to the authorities." },
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A person discloses to you that they\u2019ve been hurt, and begs you not to tell anyone. What do you do?",
    options: [
      { k: "A", t: "Promise to keep their secret so they\u2019ll keep trusting you.", correct: false, fb: "You can\u2019t promise secrecy \u2014 you\u2019re required to report. Promising silence puts them at continued risk." },
      { k: "B", t: "Reassure them you\u2019re there to keep them safe, don\u2019t promise secrecy, and report it as required.", correct: true, fb: "Right. Be kind and honest \u2014 you can\u2019t keep this secret, and reporting is how you keep them safe." },
      { k: "C", t: "Tell them you\u2019ll only report it if they give you permission.", correct: false, fb: "Reporting isn\u2019t optional or permission-based. Reassure them, then report." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "You walk in and witness a person being physically harmed right now. What\u2019s your first action?",
    options: [
      { k: "A", t: "Start writing an incident report.", correct: false, fb: "Documentation comes later. Immediate safety and 911 come first." },
      { k: "B", t: "Make sure the person is safe and call 911, then report to APS and through your agency.", correct: true, fb: "Right. Stop the harm and get help first; reporting to authorities and your agency follows." },
      { k: "C", t: "Go find your supervisor before doing anything.", correct: false, fb: "Don\u2019t delay for the chain of command in an emergency \u2014 ensure safety and call 911 now." },
    ] },
];

const L_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "What confidentiality means",
    lead: "Everything you learn about a person you support \u2014 their health, disability, history, finances, daily life \u2014 is private. Confidentiality means that information is shared only with people who genuinely need it to do their job, and protected the rest of the time. It\u2019s a legal duty under HIPAA and a matter of basic respect.",
    callout: { v: "info", t: "The rule of thumb", b: "Share only with those who <b>need to know</b>, only what they need, and only to support the person, coordinate their services, keep them safe, or conduct legitimate business." },
    facts: [
      { t: "It\u2019s more than medical.", b: "Their name as a client, disability, behavior, finances, and daily life are all protected." },
      { t: "\u201cNeed to know\u201d is the test.", b: "Does this person need this information to support the person?" },
      { t: "It\u2019s not yours to share.", b: "The information belongs to the person, not to you." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What counts as protected information", "Not just medical records. It includes the fact that the person receives services at all, their diagnosis or disability, medications, behaviors, history, finances, where they live, photos, and anything in their file or that you observe. If it identifies the person or reveals something private, treat it as confidential."],
      ["HIPAA in plain terms", "HIPAA is the federal law protecting people\u2019s health information. For you, it means: access only the information you need for your job, share it only with those who need it to support or treat the person, coordinate services, ensure safety, or conduct legitimate business \u2014 and keep it secure. Curiosity is never a reason to look or share."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A coworker who doesn\u2019t support a particular person asks you, out of curiosity, what that person\u2019s diagnosis is. What do you do?",
    options: [
      { k: "A", t: "Tell them \u2014 you\u2019re both staff at the same agency.", correct: false, fb: "Working at the same agency isn\u2019t \u201cneed to know.\u201d They don\u2019t support that person, so they don\u2019t get the information." },
      { k: "B", t: "Don\u2019t share it \u2014 they don\u2019t support that person, so they have no need to know.", correct: true, fb: "Right. Need-to-know is tied to supporting that specific person, not to being a coworker." },
      { k: "C", t: "Tell them, but ask them to keep it quiet.", correct: false, fb: "Sharing it at all is the breach. If there\u2019s no need to know, you don\u2019t share \u2014 quietly or otherwise." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Everyday confidentiality",
    lead: "Most breaches aren\u2019t dramatic \u2014 they\u2019re casual, accidental, or careless. Confidentiality is a set of daily habits.",
    facts: [
      { t: "Don\u2019t discuss in public.", b: "No hallways, break rooms, elevators, or anywhere others can hear." },
      { t: "Keep records secure.", b: "Lock screens, don\u2019t leave files out, never share logins." },
      { t: "No social media.", b: "Never post about, photograph, or reference the people you support." },
      { t: "Speak respectfully.", b: "Even in private, talk about people with dignity." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Common everyday breaches", "Talking about a person by name in a hallway, break room, or restaurant; leaving files, screens, or notes where others can see; sharing a login or leaving a computer unlocked; texting a person\u2019s information on a personal phone; or telling friends a \u201cstory\u201d about your day that identifies someone. Small habits are where most breaches happen."],
      ["Social media \u2014 a hard line", "Never post about the people you support \u2014 no names, no photos, no stories, no \u201cvague\u201d posts that could identify them, even on private accounts. This includes venting, \u201ccute\u201d moments, or asking for advice. Posting about a person you support is one of the fastest ways to cause a serious, public breach."],
      ["Keeping records and devices secure", "Log off or lock your screen when you step away, don\u2019t share usernames or passwords, keep paper records put away and out of view, and only use approved systems (like Hive) for the person\u2019s information. Access only what you need for your role."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "You had a sweet moment with a person you support and want to share a photo of the two of you on your private Instagram. Is that okay?",
    options: [
      { k: "A", t: "Yes, as long as your account is private.", correct: false, fb: "A private account isn\u2019t protection \u2014 it\u2019s still a confidentiality breach to post about a person you support." },
      { k: "B", t: "No \u2014 never post photos or stories about the people you support, even on a private account.", correct: true, fb: "Right. Social media about the people you support is off-limits, full stop." },
      { k: "C", t: "Yes, as long as you don\u2019t use their name.", correct: false, fb: "A photo identifies them regardless of the name. Don\u2019t post about people you support." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "You\u2019re at a restaurant with coworkers after a shift, and someone starts telling a funny story about a person you support, using their name. What do you do?",
    options: [
      { k: "A", t: "Join in \u2014 you\u2019re off the clock.", correct: false, fb: "Confidentiality doesn\u2019t end when your shift does. Discussing a person by name in public is a breach." },
      { k: "B", t: "Steer the conversation away \u2014 discussing people you support by name in public is a breach, on or off the clock.", correct: true, fb: "Right. Redirect it. The duty to protect their information follows you everywhere." },
      { k: "C", t: "It\u2019s fine as long as no strangers obviously recognize the name.", correct: false, fb: "You can\u2019t know who\u2019s listening, and it\u2019s a breach regardless. Steer it away." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "When sharing is right, and reporting breaches",
    lead: "Confidentiality isn\u2019t secrecy \u2014 the right people do need information to keep someone safe and supported. Knowing when to share is as important as knowing when not to.",
    facts: [
      { t: "Share with the team.", b: "Supervisor, nurse, Support Coordinator, and authorities when they need it." },
      { t: "Safety overrides privacy.", b: "Confidentiality never blocks reporting abuse or an emergency." },
      { t: "Report breaches.", b: "If information is exposed or shared wrongly, report it right away." },
    ],
    dropHeading: "Go further",
    drops: [
      ["When you should share", "Share when it\u2019s needed to provide support or treatment, coordinate the person\u2019s services, ensure their safety, or conduct legitimate DHHS business \u2014 like telling the nurse about a symptom, giving the Support Coordinator required updates, or reporting abuse to authorities. Need-to-know works both ways: withholding information the team needs can also harm the person."],
      ["Confidentiality never blocks safety reporting", "HIPAA and confidentiality do not prevent you from reporting abuse, neglect, exploitation, or an emergency. Calling 911, reporting to Adult Protective Services, or filing an incident report is always allowed and required when warranted. Safety comes first."],
      ["If a breach happens", "If you realize information was shared with the wrong person, left exposed, lost, or posted, report it to your supervisor right away. Reporting a breach quickly lets the agency contain it and meet its legal obligations. Hiding a breach only makes it worse."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "The visiting nurse asks you about symptoms you\u2019ve noticed in a person you support. Do you share?",
    options: [
      { k: "A", t: "No \u2014 it\u2019s confidential information.", correct: false, fb: "The nurse needs this to treat the person \u2014 that\u2019s a legitimate need-to-know. Withholding it could harm them." },
      { k: "B", t: "Yes \u2014 the nurse needs this to provide treatment, which is a legitimate need-to-know.", correct: true, fb: "Right. Confidentiality means sharing with those who need it to help the person, not blanket silence." },
      { k: "C", t: "Only if the person signs a written release first.", correct: false, fb: "Sharing with the treating nurse to provide care is part of normal, permitted coordination \u2014 no special release needed here." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "You accidentally emailed a document containing a person\u2019s information to the wrong address. What do you do?",
    options: [
      { k: "A", t: "Say nothing and hope no one noticed.", correct: false, fb: "Hiding a breach makes it worse and prevents the agency from containing it. Report it." },
      { k: "B", t: "Report it to your supervisor right away so the agency can respond.", correct: true, fb: "Right. Fast reporting lets the agency contain the breach and meet its legal obligations." },
      { k: "C", t: "Quietly try to recall the email and keep it to yourself.", correct: false, fb: "Even if you try to recall it, you must report it \u2014 the agency has obligations you can\u2019t meet alone." },
    ] },
];

const J_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "Rights don\u2019t disappear with a disability",
    lead: "The people you support have the same legal and human rights as anyone else \u2014 they don\u2019t lose rights because they have a disability or receive services. Your job is to support and protect those rights, not manage them away for convenience.",
    callout: { v: "info", t: "Rights aren\u2019t privileges", b: "A disability never removes a person\u2019s rights. When support and rights seem to conflict, the answer is almost never \u201ctake the right away\u201d \u2014 it\u2019s to find a way to support the person safely while preserving the right." },
    facts: [
      { t: "Dignity and respect.", b: "To be treated as an adult, with privacy and courtesy." },
      { t: "Choice and self-determination.", b: "Over daily life, routines, relationships, and goals." },
      { t: "Community and inclusion.", b: "To live, work, and take part in the community." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Everyday rights you support", "When and what to eat; when to sleep and wake; how to spend free time and money; who to talk to and visit; privacy of mail, phone, and personal space; relationships; religion; access to the community; and a real say in their own plan and goals. These aren\u2019t privileges to be earned \u2014 they\u2019re rights."],
      ["Dignity of risk", "People have the right to make their own choices, including ones others might see as risky \u2014 just like anyone else. Supporting someone means helping them make informed choices and stay safe, not removing their choices to eliminate all risk. Overprotection takes away dignity."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A person wants to stay up later than the usual house routine to finish watching a movie. What\u2019s the right approach?",
    options: [
      { k: "A", t: "Enforce the house bedtime \u2014 routines keep things running.", correct: false, fb: "When a person goes to bed is their choice, not a staff rule. A shared routine doesn\u2019t override an adult\u2019s right." },
      { k: "B", t: "Support their choice \u2014 when they go to bed is their right, not the staff\u2019s to dictate.", correct: true, fb: "Right. Bedtime is the person\u2019s decision. Support it." },
      { k: "C", t: "Allow it only if they\u2019ve \u201cearned\u201d it with good behavior.", correct: false, fb: "Rights aren\u2019t earned or used as rewards. Staying up is their choice to make." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "The ADA and your work",
    lead: "The Americans with Disabilities Act (ADA) is the federal law that protects people with disabilities from discrimination and guarantees their access to community life \u2014 jobs, public places, services, and programs.",
    facts: [
      { t: "No discrimination.", b: "People can\u2019t be excluded or treated worse because of disability." },
      { t: "Access and accommodation.", b: "Reasonable changes that let a person participate." },
      { t: "Community integration.", b: "The right to be part of the community, not segregated." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What the ADA protects", "The ADA prohibits discrimination based on disability and requires equal access to employment, public services, public places (stores, restaurants, transit), and programs. It supports the right of people with disabilities to take part in everyday community life alongside everyone else."],
      ["Reasonable accommodations in everyday support", "An accommodation is a reasonable change that lets a person participate \u2014 extra time, a different format, assistive technology, a modified approach, or support to access a place or activity. Day to day, that might mean helping someone use a communication device, arranging accessible transportation, or adapting an activity so they can join in."],
      ["Integration, not segregation", "A core idea behind the ADA and the HCBS rules is that people have the right to live, work, and spend time in the community with everyone else, not be kept separate. Supporting integration means helping people access real community settings and relationships, not just disability-only spaces."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "A person uses a communication device to express choices, and it takes them longer to respond. What\u2019s the right approach?",
    options: [
      { k: "A", t: "Make the choices for them to save time.", correct: false, fb: "That removes their voice. Their right to be heard outweighs saving a few minutes." },
      { k: "B", t: "Give them the time and support to use their device \u2014 a reasonable accommodation that protects their right to be heard.", correct: true, fb: "Right. Patience and support for their communication is exactly the kind of accommodation the ADA is about." },
      { k: "C", t: "Only ask yes/no questions so it\u2019s faster.", correct: false, fb: "That limits what they can express. Support their full communication, even if it takes longer." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A community outing is being planned. What best reflects the person\u2019s rights?",
    options: [
      { k: "A", t: "Keep activities within disability-only groups since it\u2019s simpler.", correct: false, fb: "That\u2019s segregation. People have the right to take part in the broader community." },
      { k: "B", t: "Support the person to take part in real community settings alongside others, with whatever accommodations they need.", correct: true, fb: "Right. Integration into everyday community life is a core right under the ADA and HCBS rules." },
      { k: "C", t: "Skip community outings to avoid the logistics.", correct: false, fb: "Avoiding outings denies access and inclusion. Plan the supports and go." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Restrictions, advocacy, and speaking up",
    lead: "Rights can only be limited through a careful, approved process \u2014 never casually by staff. And part of your role is to advocate when you see a person\u2019s rights being ignored.",
    callout: { v: "crit", t: "You can never restrict rights on your own", b: "Any rights restriction must go through a formal, approved process (the person\u2019s team and the Human Rights Committee) with documented justification. <b>\u201cIt\u2019s easier this way\u201d is never a valid reason.</b>" },
    facts: [
      { t: "No casual restrictions.", b: "Staff don\u2019t decide to limit choices, money, visitors, or freedom." },
      { t: "Restrictions need approval.", b: "Through the team and Human Rights Committee, with a real reason and review." },
      { t: "Advocate.", b: "If you see rights being denied, speak up and report it." },
    ],
    dropHeading: "Go further",
    drops: [
      ["How rights restrictions actually work", "A right can only be limited when there\u2019s a specific, assessed safety need, less restrictive options have been tried, the person\u2019s team agrees, and the Human Rights Committee approves it \u2014 with the reason documented, data collected, time limits, and the person involved. It\u2019s a deliberate, reviewed process, never a staff member\u2019s on-the-spot decision."],
      ["Being an advocate", "If you see a person\u2019s rights ignored or restricted without proper approval \u2014 mail withheld, choices overridden, money controlled without authorization, visitors blocked \u2014 say something. Raise it with your supervisor, report it, and support the person to use the grievance process or request a Human Rights Committee review. Silence lets violations continue."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A coworker decides to lock up a person\u2019s snacks because they \u201ceat too much,\u201d with no plan or approval. What\u2019s correct?",
    options: [
      { k: "A", t: "Go along with it \u2014 your coworker probably knows best.", correct: false, fb: "This is an unapproved rights restriction. Good intentions don\u2019t make it allowed." },
      { k: "B", t: "Recognize it as an unapproved restriction \u2014 don\u2019t enforce it, and report it so any real need goes through the proper process.", correct: true, fb: "Right. If there\u2019s a genuine health need, it goes through the team and Human Rights Committee \u2014 not a staff decision." },
      { k: "C", t: "Lock up the snacks too, to be consistent.", correct: false, fb: "Consistency in a violation is still a violation. Don\u2019t enforce it; report it." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "You notice a person\u2019s incoming mail is being held by staff without any documented reason or approval. What do you do?",
    options: [
      { k: "A", t: "Assume there\u2019s a good reason and leave it alone.", correct: false, fb: "Don\u2019t assume \u2014 withholding mail is a rights restriction that needs documented justification and approval." },
      { k: "B", t: "Speak up and report it \u2014 withholding mail is a restriction that requires proper justification and approval.", correct: true, fb: "Right. Advocate for the person and report it so it\u2019s either stopped or properly reviewed." },
      { k: "C", t: "Open the mail yourself to check whether it\u2019s important.", correct: false, fb: "That\u2019s another violation of their privacy. Don\u2019t open it \u2014 report the situation." },
    ] },
];

const F_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "When someone is missing, act fast",
    lead: "If you don\u2019t know where a person you\u2019re responsible for is \u2014 they wandered off, didn\u2019t return, or you simply can\u2019t locate them \u2014 treat it as urgent from the first moment. The faster you act, the safer the outcome. Don\u2019t assume they\u2019ll turn up.",
    callout: { v: "crit", t: "The clock starts the moment you notice", b: "As soon as you realize you can\u2019t account for a person\u2019s whereabouts, <b>begin looking and calling for help immediately</b> \u2014 don\u2019t wait to \u201csee if they come back.\u201d" },
    facts: [
      { t: "Don\u2019t wait.", b: "Minutes matter \u2014 start right away." },
      { t: "Stay calm and think.", b: "Where were they last? Where might they go?" },
      { t: "Keep others safe.", b: "Make sure the rest of the people you support stay supervised while you respond." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What counts as \u201cwhereabouts unknown\u201d", "Any time you can\u2019t account for where a person in your care is when they should be with you \u2014 they left the home, didn\u2019t return from an activity, slipped away during an outing, or you simply realize you don\u2019t know where they are. It doesn\u2019t matter whose \u201cfault\u201d it was; the response is the same."],
      ["Risk factors that raise urgency", "Some people are at higher risk if missing \u2014 those who can\u2019t communicate their name or address, have medical or behavioral needs, are drawn to water or traffic, don\u2019t recognize danger, or have wandered before. Know who you support and how urgent a missing situation is for them. When in doubt, treat it as high-risk."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A person who was in the next room is suddenly nowhere to be found, and the front door is standing open. What do you do?",
    options: [
      { k: "A", t: "Wait 30 minutes to see if they come back before telling anyone.", correct: false, fb: "Don\u2019t wait \u2014 minutes matter, especially with an open door. Begin searching and calling for help now." },
      { k: "B", t: "Begin searching the immediate area right away and call for help, while keeping the others safe.", correct: true, fb: "Right. Act immediately \u2014 search and get help going while keeping the rest of the people you support supervised." },
      { k: "C", t: "Finish your current task first, then look.", correct: false, fb: "Nothing comes before this. Start the search and notifications immediately." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "The notification steps",
    lead: "Searching and notifying happen together \u2014 you don\u2019t finish one before starting the other. Follow your agency\u2019s procedure, which generally moves quickly through these steps.",
    facts: [
      { t: "Search the immediate area first.", b: "The building, grounds, and nearby spots they like." },
      { t: "Call 911 / police.", b: "When the person is at risk or not quickly found \u2014 sooner for high-risk people." },
      { t: "Notify your supervisor.", b: "Right away, while the search continues." },
      { t: "Notify guardian & Support Coordinator.", b: "Per your agency\u2019s procedure." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The usual order (follow your agency\u2019s plan)", "1. Do a quick, immediate search of the area and the places the person tends to go. 2. Call for help \u2014 get other staff involved, and call 911/police when the person can\u2019t be quickly located or is at risk. 3. Notify your supervisor. 4. Notify the guardian and Support Coordinator. For a high-risk person, calling 911 comes early, not last. Your agency\u2019s written procedure gives the exact order and timing."],
      ["What to tell the police / 911", "The person\u2019s name and a description (clothing, height, appearance), the time and place last seen, any medical or communication needs, whether they\u2019re drawn to specific places or hazards (water, a former home, a bus route), and that they\u2019re a vulnerable adult who may need help. Have a recent photo ready if your agency keeps one."],
      ["Don\u2019t stop searching while you wait", "Once help is called, keep looking and coordinating. Check likely destinations \u2014 a favorite store, a previous home, a relative\u2019s house, transit stops. Keep your supervisor updated, and make sure the other people you support stay safe and supervised throughout."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "A person who can\u2019t communicate their name or address, and who is drawn to a nearby busy road, is missing. When do you call 911?",
    options: [
      { k: "A", t: "After you\u2019ve searched everywhere yourself for an hour.", correct: false, fb: "For a high-risk person, an hour is far too long. Call 911 early." },
      { k: "B", t: "Right away \u2014 a high-risk person who is missing warrants calling 911/police immediately.", correct: true, fb: "Right. High risk means 911 comes early in the steps, not last. Search and call together." },
      { k: "C", t: "Only if the guardian tells you to.", correct: false, fb: "Don\u2019t wait for the guardian\u2019s say-so to call 911 for a high-risk missing person \u2014 call now." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "You\u2019ve started searching for a missing person. When should you notify your supervisor and begin the other notifications?",
    options: [
      { k: "A", t: "Only after the person is found, so you have a complete story.", correct: false, fb: "Don\u2019t wait \u2014 notifications happen alongside the search, not after it." },
      { k: "B", t: "Right away, while the search is ongoing \u2014 searching and notifying happen together.", correct: true, fb: "Right. Get others involved and notifications moving immediately while you keep searching." },
      { k: "C", t: "At the end of your shift in your notes.", correct: false, fb: "Far too late. Notify your supervisor immediately and follow the procedure." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "When they\u2019re found, and documenting",
    lead: "The response isn\u2019t over when the person is located \u2014 there\u2019s follow-up and documentation.",
    facts: [
      { t: "Check on them.", b: "Make sure they\u2019re safe and uninjured; get medical help if needed." },
      { t: "Notify everyone of the outcome.", b: "Police, supervisor, guardian, Support Coordinator." },
      { t: "Document it as an incident.", b: "The timeline, what you did, who you notified." },
      { t: "Learn from it.", b: "The team reviews how to prevent a repeat." },
    ],
    dropHeading: "Go further",
    drops: [
      ["After the person is found", "First, make sure they\u2019re safe and well \u2014 check for injury, distress, or medical needs and get help if needed. Then notify everyone who was involved that the person is safe, including the police if they were called. Stay calm and reassuring; being lost is frightening, and the person shouldn\u2019t be shamed."],
      ["Documenting a missing-person event", "This is a reportable incident. Document the timeline: when you last saw them, when you realized they were missing, what you did, who you called and when, where they were found, and their condition. Accurate documentation helps the team understand what happened and prevent it next time."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A missing person is found safe after about 20 minutes. What\u2019s the right follow-up?",
    options: [
      { k: "A", t: "Just carry on \u2014 no harm done.", correct: false, fb: "Even with a good outcome, there\u2019s follow-up: check on them, close the loop with everyone notified, and document it." },
      { k: "B", t: "Make sure they\u2019re okay, notify everyone who was involved that they\u2019re safe, and document it as an incident.", correct: true, fb: "Right. Confirm their wellbeing, let everyone know they\u2019re safe, and document the event." },
      { k: "C", t: "Document it only if they were hurt.", correct: false, fb: "A missing-person event is documented regardless of injury \u2014 the timeline and response matter." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "A person who has wandered off before goes missing again. A coworker says, \u201cOh, they always do this \u2014 they\u2019ll come back, don\u2019t make a big deal.\u201d What\u2019s correct?",
    options: [
      { k: "A", t: "Agree and wait \u2014 they always come back.", correct: false, fb: "Complacency is dangerous. A history of wandering raises risk; it doesn\u2019t lower it." },
      { k: "B", t: "Respond with the same urgency every time \u2014 search and notify now.", correct: true, fb: "Right. Every missing event gets the full response. A pattern is a reason for more care, not less." },
      { k: "C", t: "Wait a bit longer than usual since it\u2019s a pattern.", correct: false, fb: "No \u2014 treat it as urgent every time. This time could be the time something goes wrong." },
    ] },
];

const S_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "What fraud, waste & abuse mean here",
    lead: "This kind of \u201cabuse\u201d is different from harming a person \u2014 it\u2019s about misusing Medicaid funds and program resources. As staff, you have a duty to report suspected fraud, waste, abuse, and mismanagement of the Medicaid funds that pay for the services you provide.",
    callout: { v: "info", t: "Money and program integrity \u2014 not personal harm", b: "If you suspect someone is cheating the Medicaid system that funds these services, you report it to the Utah Office of Inspector General (OIG). Harm to a <i>person</i> is a different report (abuse/neglect)." },
    facts: [
      { t: "Fraud.", b: "Intentionally deceiving to get money or benefits you\u2019re not entitled to." },
      { t: "Waste.", b: "Careless or needless spending of program resources." },
      { t: "Abuse (of the program).", b: "Practices that misuse funds or don\u2019t meet standards, even without intent to deceive." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Fraud, waste, and abuse \u2014 with examples", "Fraud (intentional): billing for services that weren\u2019t provided, billing for a person who wasn\u2019t there, falsifying timesheets or documentation, or billing for more time than was worked. Waste: needless or careless overuse of resources. Abuse (program): billing or business practices that don\u2019t follow the rules or accepted standards, even if not clearly intentional. All three drain the funds meant to support people."],
      ["Examples you might actually see", "A coworker clocking hours for a shift they didn\u2019t work; documentation written for services that never happened; billing for a person who was in the hospital or absent; signing off on visits that didn\u2019t occur; or pressure to \u201cjust sign\u201d records you know aren\u2019t accurate. These are the kinds of things you report."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "Which of these is an example of Medicaid fraud?",
    options: [
      { k: "A", t: "A coworker documents and bills for a 1:1 shift with a person who was actually away all day.", correct: true, fb: "Right \u2014 billing for a service that didn\u2019t happen is fraud, and it\u2019s reportable to the OIG." },
      { k: "B", t: "A person chooses not to attend their day program one day.", correct: false, fb: "That\u2019s just the person\u2019s choice \u2014 no fraud. Fraud is billing for something that didn\u2019t happen." },
      { k: "C", t: "Staff use cleaning supplies a little faster than expected.", correct: false, fb: "That\u2019s minor at most \u2014 the clear example of fraud is billing for a shift that didn\u2019t occur." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Your duty and how to report",
    lead: "If you suspect fraud, waste, or abuse, you report it to the Utah Office of Inspector General (OIG) \u2014 the state agency that investigates Medicaid program integrity.",
    facts: [
      { t: "Report to the Utah OIG.", b: "At oig.utah.gov/report-fraud." },
      { t: "You can report it yourself.", b: "You don\u2019t have to go through your employer." },
      { t: "No proof needed.", b: "A good-faith suspicion is enough \u2014 you don\u2019t have to be certain." },
      { t: "Stick to what you know.", b: "Report the facts you observed." },
    ],
    dropHeading: "Go further",
    drops: [
      ["How and where to report", "Suspected fraud, waste, abuse, or mismanagement of Medicaid funds goes to the Utah Office of Inspector General (OIG) at https://oig.utah.gov/report-fraud/. You can report directly \u2014 you don\u2019t need your employer\u2019s permission, and you don\u2019t need proof, just a good-faith suspicion. Report the facts you know: what you saw, when, and who was involved."],
      ["Fraud reporting vs. abuse/neglect reporting", "Keep the two straight. Harm to a person \u2014 abuse, neglect, exploitation \u2014 goes to Adult Protective Services and/or the police (and through your agency\u2019s incident process). Misuse of Medicaid money and program resources \u2014 fraud, waste, abuse, mismanagement \u2014 goes to the Utah OIG. A single situation could involve both."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "Where do you report suspected Medicaid billing fraud?",
    options: [
      { k: "A", t: "Only to your supervisor, and nowhere else.", correct: false, fb: "A supervisor can be told, but you can and may need to report directly to the OIG \u2014 the duty doesn\u2019t stop at your employer." },
      { k: "B", t: "To the Utah Office of Inspector General (OIG) at oig.utah.gov/report-fraud \u2014 you can report directly.", correct: true, fb: "Right. The OIG handles Medicaid program integrity, and you can report directly." },
      { k: "C", t: "To Adult Protective Services.", correct: false, fb: "APS is for harm to a person. Misuse of Medicaid funds goes to the OIG." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A coworker keeps documenting visits you\u2019re fairly sure didn\u2019t happen, but you can\u2019t prove it. What do you do?",
    options: [
      { k: "A", t: "Stay quiet until you have solid proof.", correct: false, fb: "You don\u2019t need proof \u2014 a good-faith suspicion is enough to report." },
      { k: "B", t: "Report your good-faith suspicion to the OIG with the facts you do know.", correct: true, fb: "Right. Report what you\u2019ve observed; investigating and proving it is the OIG\u2019s job, not yours." },
      { k: "C", t: "Confront the coworker and demand an explanation first.", correct: false, fb: "Don\u2019t investigate or confront \u2014 report the facts you know and let the OIG handle it." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Protection, and why it matters",
    lead: "Reporting is protected, and it matters \u2014 fraud takes money away from the people the program is meant to serve.",
    facts: [
      { t: "You\u2019re protected.", b: "Good-faith reporting can\u2019t be lawfully retaliated against." },
      { t: "Don\u2019t participate.", b: "Never falsify documents or sign off on something inaccurate, even if asked." },
      { t: "It protects the people you serve.", b: "Fraud drains the funds that pay for their support." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Protection from retaliation", "Reporting suspected fraud, waste, or abuse in good faith is protected \u2014 you can\u2019t be lawfully retaliated against for it, even if it turns out unfounded. If you\u2019re ever pressured to stay quiet or punished for reporting, that itself is a serious problem worth reporting."],
      ["Never go along with it", "If you\u2019re asked to falsify a timesheet, document a service that didn\u2019t happen, or sign something you know isn\u2019t accurate, don\u2019t \u2014 even if a coworker or supervisor asks. Going along with it makes you part of it. Decline, and report it. Honest documentation is part of your job."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A supervisor asks you to sign off on a visit note for a service that didn\u2019t actually happen, saying \u201cjust sign it, it\u2019s fine.\u201d What do you do?",
    options: [
      { k: "A", t: "Sign it \u2014 your supervisor told you to.", correct: false, fb: "Being told to doesn\u2019t make it okay. Signing for a service that didn\u2019t happen is fraud." },
      { k: "B", t: "Don\u2019t sign anything inaccurate, and report it to the OIG.", correct: true, fb: "Right. Decline to falsify records, no matter who asks, and report it." },
      { k: "C", t: "Sign it but add a note that you weren\u2019t sure.", correct: false, fb: "A hedge doesn\u2019t fix it \u2014 you\u2019d still be documenting a service that didn\u2019t happen. Don\u2019t sign; report it." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "Why does reporting fraud, waste, and abuse matter?",
    options: [
      { k: "A", t: "It doesn\u2019t really affect anyone day to day.", correct: false, fb: "It does \u2014 misused funds are funds taken from the people the program exists to support." },
      { k: "B", t: "Fraud drains the Medicaid funds meant to support the people you serve \u2014 reporting protects those resources and the people who depend on them.", correct: true, fb: "Right. Protecting program integrity protects the people who rely on those services." },
      { k: "C", t: "Only to get coworkers in trouble.", correct: false, fb: "It\u2019s not about getting people in trouble \u2014 it\u2019s about protecting the funds and the people they serve." },
    ] },
];

const I_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "Behavior is communication",
    lead: "Positive behavior support (PBS) starts from one idea: behavior is communication. When a person acts out \u2014 yells, refuses, hits, withdraws \u2014 they\u2019re trying to meet a need or tell you something they may not be able to say in words. Your first job is to understand the \u201cwhy,\u201d not just react to the \u201cwhat.\u201d",
    callout: { v: "info", t: "PBS is the first response \u2014 always", b: "The goal is to <b>prevent</b> crises by understanding needs and teaching skills, not to control or punish behavior." },
    facts: [
      { t: "Behavior has a function.", b: "To get something, avoid something, or meet a need." },
      { t: "Look past the behavior.", b: "Ask what it\u2019s communicating." },
      { t: "Punishment doesn\u2019t teach.", b: "It doesn\u2019t address the need, and often makes things worse." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The functions of behavior", "Most behavior serves a purpose: to get something (attention, an item, an activity), to escape or avoid something (a demand, a place, a person, discomfort), to meet a sensory need, or to communicate pain, hunger, fear, or frustration. When you understand the function, you can meet the need a better way \u2014 which is the heart of PBS."],
      ["Why positive support, not punishment", "Punishment might stop a behavior for a moment, but it doesn\u2019t teach the person what to do instead, and it can increase fear, mistrust, and harder behaviors. It can also violate a person\u2019s rights and dignity. PBS replaces problem behavior by meeting the underlying need and teaching skills \u2014 that\u2019s what works, and what the rules require."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "During a task, a person starts yelling and pushes their worksheet away. What\u2019s the positive-behavior-support way to read this?",
    options: [
      { k: "A", t: "They\u2019re being defiant \u2014 give them a consequence.", correct: false, fb: "That\u2019s a punishment lens. PBS asks what the behavior is communicating, not how to punish it." },
      { k: "B", t: "The behavior is communicating something \u2014 maybe the task is too hard or they need a break; find the need and respond to it.", correct: true, fb: "Right. Read the function (escape? frustration? too hard?) and meet the need a better way." },
      { k: "C", t: "Ignore them completely until they stop on their own.", correct: false, fb: "Blanket ignoring misses the need behind the behavior. PBS responds to the message, not just the noise." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Prevent first",
    lead: "The best behavior support happens before anything goes wrong. Most challenging behavior is more predictable than it seems, and small changes to the environment and routine prevent a lot of it.",
    facts: [
      { t: "Know the triggers.", b: "Hunger, noise, transitions, demands, being rushed." },
      { t: "Set people up to succeed.", b: "Predictable routines, choices, clear and calm communication." },
      { t: "Notice early signs.", b: "Catch rising frustration before it becomes a crisis." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Antecedents \u2014 what comes before", "An antecedent is what happens right before a behavior \u2014 a demand, a transition, a loud room, being told \u201cno,\u201d hunger, or pain. Learning a person\u2019s common antecedents lets you adjust ahead of time: warn before transitions, offer choices, reduce noise, build in breaks, or meet a need before it becomes urgent."],
      ["Everyday prevention strategies", "Keep routines predictable; give choices wherever you can; communicate clearly, calmly, and simply; give advance notice before changes; make sure basic needs (food, rest, comfort, activity) are met; and build in breaks. A person who feels in control, understood, and comfortable has far fewer crises."],
      ["Catching the early signs", "Most escalation has warning signs \u2014 pacing, a raised voice, clenched hands, repeating a phrase, withdrawing, getting very quiet. Learning a person\u2019s early signs lets you step in gently and early \u2014 offer a break, reduce the demand, change the environment \u2014 before things reach a crisis."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "You know a particular person gets overwhelmed during loud, busy transitions between activities. What\u2019s the PBS approach?",
    options: [
      { k: "A", t: "Wait for the meltdown, then deal with it.", correct: false, fb: "That\u2019s reactive. PBS prevents \u2014 you already know the trigger, so plan around it." },
      { k: "B", t: "Plan ahead \u2014 give advance warning, reduce the noise and rush, and offer support or choices during the transition.", correct: true, fb: "Right. Adjust the antecedent you already know about so the crisis is far less likely." },
      { k: "C", t: "Avoid all transitions entirely.", correct: false, fb: "That\u2019s neither realistic nor the goal. Prevention means supporting transitions, not eliminating them." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Responding and following the plan",
    lead: "When behavior does escalate, you respond with calm, positive strategies \u2014 and you follow the person\u2019s behavior support plan (BSP) if they have one.",
    callout: { v: "crit", t: "Positive supports first \u2014 always", b: "Restraint or any restrictive intervention is a <b>last resort</b>, only when someone is in immediate danger, only as trained and authorized, and <b>never</b> as punishment or for convenience." },
    facts: [
      { t: "Stay calm.", b: "Your calm is contagious \u2014 and so is your tension." },
      { t: "Follow the BSP.", b: "If the person has a plan, it tells you what works for them." },
      { t: "Restrictive measures are a last resort.", b: "Only for imminent danger, only as trained and approved." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Following the behavior support plan (BSP)", "Some people have a written behavior support plan developed by a professional. It describes their triggers, what their behavior is communicating, prevention strategies, and exactly how staff should respond. When a BSP exists, it isn\u2019t optional \u2014 follow it, because it\u2019s built around that specific person and what actually works for them."],
      ["Restraint and restrictive interventions \u2014 the hard limits", "Under Utah\u2019s rules (R539-4), positive supports come first, always. Restraint or any restrictive intervention is only ever for immediate physical danger to the person or others, only when you\u2019re trained and it\u2019s authorized, and only for as long as the danger lasts. It is never punishment, never for staff convenience, and never an improvised first move. Prohibited practices \u2014 like seclusion, painful holds, or withholding meals \u2014 are never allowed."],
      ["Debrief and learn", "After a hard incident, calm and reconnect with the person \u2014 don\u2019t shame them. Then document what happened, what came before it, and what helped, and share it with the team. Every incident is information that improves the support plan and prevents the next one."],
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person is becoming agitated. Under positive behavior support, what\u2019s the right first response?",
    options: [
      { k: "A", t: "Immediately use a physical hold to keep control.", correct: false, fb: "No \u2014 restraint is a last resort only for immediate danger. It\u2019s never the first move." },
      { k: "B", t: "Stay calm, use positive strategies \u2014 offer a break, reduce demands, listen \u2014 and follow their plan.", correct: true, fb: "Right. Positive supports are always first. Calm, space, and meeting the need defuse most situations." },
      { k: "C", t: "Threaten to take away a privilege unless they calm down.", correct: false, fb: "Threats and punishment escalate and aren\u2019t PBS. Stay calm and meet the need." },
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "When is physical restraint ever appropriate?",
    options: [
      { k: "A", t: "When a person refuses to follow instructions.", correct: false, fb: "Never for non-compliance. Restraint is only for immediate physical danger." },
      { k: "B", t: "Only when there\u2019s immediate physical danger to the person or others, and only as trained and authorized \u2014 never as punishment or for convenience.", correct: true, fb: "Right. Imminent danger only, as trained and authorized, for as long as the danger lasts \u2014 and never otherwise." },
      { k: "C", t: "Whenever it would make the shift easier.", correct: false, fb: "Never for convenience. That would be a serious rights violation." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "A person has a behavior support plan listing strategies that work for them, but you have a different idea you\u2019d rather try in the moment. What do you do?",
    options: [
      { k: "A", t: "Do your own thing \u2014 you know best in the moment.", correct: false, fb: "The BSP was built for this person by a professional. Going off-plan undermines what works for them." },
      { k: "B", t: "Follow the BSP, and raise your ideas with the team so the plan can be updated if they\u2019re good.", correct: true, fb: "Right. Follow the plan now; improve it through the team, not by improvising alone." },
      { k: "C", t: "Ignore the plan \u2014 plans are just suggestions.", correct: false, fb: "A BSP isn\u2019t optional. Follow it, and bring ideas to the team." },
    ] },
];

const U_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "De-escalation starts with you",
    lead: "De-escalation is what you do when a person is upset, agitated, or in crisis, to help them calm and stay safe \u2014 without force. It starts with you: a calm, respectful presence is the single most powerful de-escalation tool you have.",
    callout: { v: "info", t: "You can\u2019t calm someone by matching their intensity", b: "The goal isn\u2019t to \u201cwin\u201d or be right \u2014 it\u2019s to lower the temperature and keep everyone safe." },
    facts: [
      { t: "Manage yourself first.", b: "Your calm tone, body, and breathing set the tone." },
      { t: "It\u2019s not about winning.", b: "Let go of being right; focus on safety and connection." },
      { t: "Give it time and space.", b: "Pressure and crowding make things worse." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Start with your own reaction", "When someone escalates, your instinct may be to raise your voice, take control, or argue back. Resist it. Take a breath, drop your shoulders, soften your tone, and slow down. People in distress read your body and voice more than your words \u2014 a calm presence invites calm; tension feeds tension."],
      ["The goal of de-escalation", "The aim isn\u2019t to make the person comply, admit they\u2019re wrong, or follow the rules in the moment. It\u2019s to bring the intensity down so the person feels heard and safe and no one gets hurt. You can sort out the details later, once everyone is calm."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A person is yelling at you, clearly upset. What\u2019s the most effective first move?",
    options: [
      { k: "A", t: "Raise your voice to be heard over them.", correct: false, fb: "Matching their volume escalates it. Lower your voice instead." },
      { k: "B", t: "Lower your voice, slow down, stay calm, and give them space.", correct: true, fb: "Right. A calm, quiet presence invites calm. You set the tone." },
      { k: "C", t: "Tell them firmly they need to stop right now.", correct: false, fb: "Commands and \u201cstop right now\u201d usually escalate. Soften, slow down, give space." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "What to do \u2014 and not do",
    lead: "De-escalation is a set of skills you can practice \u2014 and a list of things to avoid.",
    facts: [
      { t: "Listen and acknowledge.", b: "Let them express it; name the feeling (\u201cyou\u2019re really frustrated\u201d)." },
      { t: "Give space.", b: "Don\u2019t crowd, corner, or tower over them." },
      { t: "Offer choices and control.", b: "Simple options help a person regain a sense of control." },
      { t: "Keep it simple.", b: "Few words, calm and clear; don\u2019t lecture or argue." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What helps", "Listen more than you talk. Acknowledge the feeling without judging it (\u201cI can see this is really upsetting\u201d). Give space and time. Offer simple choices to restore a sense of control. Use a calm, quiet voice and open body language. Remove or reduce whatever is triggering them if you can. Be patient \u2014 silence is okay."],
      ["What makes it worse", "Raising your voice, arguing, or trying to \u201cwin.\u201d Commands and ultimatums. Crowding, cornering, or looming over the person. Sarcasm, lecturing, or saying \u201ccalm down.\u201d Taking it personally. Sudden movements. Laughing or dismissing their feelings. Touching someone who\u2019s escalated without warning. These all add fuel."],
      ["Personal space and safety", "Keep a respectful distance, stay at the person\u2019s eye level rather than standing over them, keep your hands visible and movements slow, and don\u2019t block their exit \u2014 feeling trapped escalates people. Position yourself so you can step away if needed. De-escalation and safety go together."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "A coworker walks up to an agitated person, stands close and over them, points a finger, and says \u201cyou need to calm down right now.\u201d What\u2019s the problem?",
    options: [
      { k: "A", t: "Nothing \u2014 being firm shows authority.", correct: false, fb: "Authority isn\u2019t the goal \u2014 de-escalation is. This approach will almost certainly escalate things." },
      { k: "B", t: "Crowding, looming, pointing, and \u201ccalm down\u201d commands all escalate \u2014 back off, give space, and lower the tone.", correct: true, fb: "Right. Space, calm voice, and open body language defuse; the opposite inflames." },
      { k: "C", t: "They should have grabbed the person to guide them away.", correct: false, fb: "Don\u2019t touch an escalated person without warning \u2014 that escalates and can be unsafe. Give space." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person is escalating because they\u2019re being told it\u2019s time to leave an activity they\u2019re enjoying. What helps most?",
    options: [
      { k: "A", t: "Insist they leave immediately, no exceptions.", correct: false, fb: "A hard demand in a hot moment escalates. Acknowledge and offer a small choice instead." },
      { k: "B", t: "Acknowledge how they feel and offer a simple choice (\u201cfive more minutes, or one more turn \u2014 which works?\u201d).", correct: true, fb: "Right. A little control and acknowledgment lowers the intensity and keeps cooperation." },
      { k: "C", t: "Warn them they\u2019ll lose the activity next time.", correct: false, fb: "Threats escalate. Acknowledge the feeling and offer a real, simple choice." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Safety, recovery, and getting help",
    lead: "De-escalation keeps everyone safe \u2014 and you need to know when a situation is beyond what you can handle alone.",
    callout: { v: "crit", t: "When there\u2019s real danger, get help", b: "If there\u2019s an immediate threat of serious harm and de-escalation isn\u2019t working, get help and call <b>911</b>. Restraint is only ever a last resort for imminent danger, as trained and authorized \u2014 never a go-to." },
    facts: [
      { t: "Keep everyone safe.", b: "Including yourself; move others away from the area if needed." },
      { t: "Know your limits.", b: "Call for backup, your supervisor, or 911 when needed." },
      { t: "Allow recovery.", b: "After a crisis, give the person quiet time to come down." },
    ],
    dropHeading: "Go further",
    drops: [
      ["When to get help or call 911", "If de-escalation isn\u2019t working and there\u2019s a real risk of serious harm to the person or others, don\u2019t go it alone \u2014 call for backup, your supervisor, the crisis line, or 911. For a mental-health crisis with no immediate danger, a crisis line (988) or mobile crisis team may be the right call. Getting help isn\u2019t failure \u2014 it\u2019s good practice."],
      ["After the crisis \u2014 recovery and reconnect", "Once the intensity drops, give the person quiet time and space to fully calm \u2014 don\u2019t rush to \u201cprocess\u201d it or lecture. Reconnect warmly and without shame; the relationship matters. Later, document what happened and what helped, and share it with the team so the support plan can improve."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "You\u2019re de-escalating alone, it isn\u2019t working, and the person starts throwing heavy objects near others. What do you do?",
    options: [
      { k: "A", t: "Keep trying solo no matter what \u2014 asking for help looks bad.", correct: false, fb: "Asking for help is good practice, not failure. Safety comes first." },
      { k: "B", t: "Get others to safety, call for backup or your supervisor, and call 911 if there\u2019s a real risk of serious harm.", correct: true, fb: "Right. Protect everyone, get help, and escalate to 911 when there\u2019s real danger." },
      { k: "C", t: "Physically restrain them immediately to stop it.", correct: false, fb: "Restraint is a last resort for imminent danger, as trained and authorized. First, get others safe and call for help." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "The crisis has passed and the person is calming down. What\u2019s the best thing to do?",
    options: [
      { k: "A", t: "Immediately sit them down and explain everything they did wrong.", correct: false, fb: "Lecturing in the raw aftermath re-escalates and shames. Let them recover first." },
      { k: "B", t: "Give them quiet time and space to fully recover, reconnect warmly without shame, and document afterward.", correct: true, fb: "Right. Recovery and a warm reconnection matter; the review and documentation come after." },
      { k: "C", t: "Act like nothing happened and move on instantly.", correct: false, fb: "Recovery, reconnection, and documentation still matter \u2014 don\u2019t just brush past it." },
    ] },
];

const V_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "What trauma is, and why it matters",
    lead: "Many of the people you support have experienced trauma \u2014 abuse, neglect, loss, medical trauma, or repeated experiences of having no control. Trauma-informed care means recognizing how common trauma is, how deeply it shapes behavior, and making sure your support doesn\u2019t re-traumatize.",
    callout: { v: "info", t: "\u201cWhat happened to you?\u201d not \u201cWhat\u2019s wrong with you?\u201d", b: "Behavior that looks difficult often makes sense once you understand a person\u2019s history." },
    facts: [
      { t: "Trauma is common.", b: "Especially among people with disabilities and those in systems of care." },
      { t: "Trauma shapes behavior.", b: "Reactions that seem \u201ctoo big\u201d are often the body\u2019s survival response." },
      { t: "The past lives in the present.", b: "A tone, a touch, or a place can trigger old fear." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What trauma is", "Trauma is the lasting effect of overwhelming or frightening experiences \u2014 abuse, neglect, violence, loss, medical procedures, accidents, or repeatedly having no control over what happens to you. It changes how the brain and body respond to stress, often long after the events are over. Many people you support carry trauma, even if you never hear the story."],
      ["Why it matters for support", "Trauma can make ordinary situations feel threatening. Being touched, rushed, cornered, told \u201cno,\u201d or having a routine changed can trigger a survival response \u2014 fight, flight, or freeze \u2014 that looks like \u201cbehavior\u201d but is really fear. Understanding this changes how you respond: with patience and safety instead of control and consequences."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A person reacts with intense fear and resistance to being helped with personal care. The trauma-informed question is:",
    options: [
      { k: "A", t: "\u201cWhy are they being so difficult about something simple?\u201d", correct: false, fb: "That\u2019s the \u201cwhat\u2019s wrong with you\u201d lens. Trauma-informed care asks what happened that makes this feel unsafe." },
      { k: "B", t: "\u201cWhat might have happened to them that makes this feel unsafe \u2014 and how can I make it safer?\u201d", correct: true, fb: "Right. That shift \u2014 from judgment to understanding \u2014 is the heart of trauma-informed care." },
      { k: "C", t: "\u201cHow do I get them to comply faster?\u201d", correct: false, fb: "Pushing for compliance can repeat the original harm. Focus on safety and understanding." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Safety, trust, and choice",
    lead: "Trauma-informed care isn\u2019t a one-time technique \u2014 it\u2019s a way of being present that runs through everything. A few core principles guide it.",
    facts: [
      { t: "Safety.", b: "Physical and emotional \u2014 the person feels safe with you and in the space." },
      { t: "Trust.", b: "Be consistent, predictable, and honest; do what you say." },
      { t: "Choice and control.", b: "Give people as much say as possible \u2014 control is healing." },
      { t: "Respect and collaboration.", b: "Work with the person, not on them." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Creating safety", "Safety is the foundation. Keep your tone calm and your movements predictable, explain what you\u2019re going to do before you do it, avoid surprises and sudden touch, and respect personal space. Emotional safety matters as much as physical \u2014 a person needs to feel they won\u2019t be judged, shamed, or punished."],
      ["Trust and predictability", "Trauma often comes from people or systems that were unsafe or unreliable. You rebuild trust by being consistent and honest: follow through on what you say, keep routines predictable, give advance notice of changes, and admit and repair it when you get something wrong. Small, reliable actions over time are what earn trust."],
      ["Choice and control as healing", "So much trauma is about powerlessness. Giving people real choices \u2014 what to wear, what to eat, the order of tasks, whether they\u2019re ready \u2014 returns a sense of control that is genuinely healing. Even small choices matter. Forcing or rushing, even with good intentions, repeats the original harm."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "Before helping someone with a task that involves touch, what\u2019s the trauma-informed approach?",
    options: [
      { k: "A", t: "Just do it quickly to get it over with.", correct: false, fb: "Surprise and rushing can trigger a trauma response. Slow down and explain first." },
      { k: "B", t: "Explain what you\u2019re going to do first, go slowly, and respect their pace and any \u201cno.\u201d", correct: true, fb: "Right. Predictability, consent, and pace create the safety trauma-informed care is built on." },
      { k: "C", t: "Do it without comment so you don\u2019t make it awkward.", correct: false, fb: "Silence and surprise touch can feel unsafe. Explain, go slow, and respect their response." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person is refusing to get dressed and getting more upset. What\u2019s the trauma-informed response?",
    options: [
      { k: "A", t: "Physically dress them to stay on schedule.", correct: false, fb: "Force repeats the powerlessness at the root of trauma. Slow down and offer control." },
      { k: "B", t: "Slow down, offer choices (which shirt, a few minutes first), and give them a sense of control.", correct: true, fb: "Right. Choice and patience restore control, which calms and heals." },
      { k: "C", t: "Tell them they\u2019ll miss breakfast if they don\u2019t hurry.", correct: false, fb: "Coercion escalates and erodes trust. Offer choice and go at their pace." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Avoiding re-traumatization \u2014 and your own wellbeing",
    lead: "Part of trauma-informed care is not adding new harm \u2014 and taking care of yourself so you can keep showing up well.",
    facts: [
      { t: "Avoid triggers and power struggles.", b: "Don\u2019t corner, force, shame, or surprise." },
      { t: "Don\u2019t take it personally.", b: "A trauma reaction is about their history, not about you." },
      { t: "Watch your own stress.", b: "This work takes a toll \u2014 care for yourself so you can keep caring well." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What can re-traumatize \u2014 and what to do instead", "Yelling, force, restraint, cornering, sudden touch, shaming, power struggles, and unpredictability can all re-open old wounds. Instead: stay calm, give space and choices, explain and go slow, and protect the person\u2019s dignity even in hard moments. When you must set a limit, do it calmly and kindly, not punitively."],
      ["Secondary stress and self-care", "Supporting people who\u2019ve been through a lot can affect you too \u2014 it\u2019s sometimes called secondary or vicarious stress, and it\u2019s real. Notice if you\u2019re feeling drained, on edge, numb, or carrying it home. Talk to your supervisor, lean on healthy support, take your breaks, and use available resources. Caring for yourself isn\u2019t selfish \u2014 it\u2019s what lets you keep showing up well."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A person lashes out at you verbally during a stressful moment. The trauma-informed view is:",
    options: [
      { k: "A", t: "They\u2019re disrespecting me and need to be corrected.", correct: false, fb: "Reading it as a personal attack leads to escalation. It\u2019s usually a stress response, not about you." },
      { k: "B", t: "This is likely a stress or survival response tied to their history, not a personal attack \u2014 stay calm and don\u2019t escalate.", correct: true, fb: "Right. Not taking it personally lets you stay calm and keep the person safe." },
      { k: "C", t: "I should respond sharply so they learn not to do it.", correct: false, fb: "Responding in kind escalates and can re-traumatize. Stay calm." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "You\u2019ve been supporting someone through a really hard stretch and notice you feel drained, on edge, and are carrying it home. What\u2019s the healthy response?",
    options: [
      { k: "A", t: "Push it down and power through \u2014 it\u2019s just part of the job.", correct: false, fb: "Ignoring it leads to burnout, which hurts you and the people you support." },
      { k: "B", t: "Recognize it as secondary stress, talk to your supervisor or a trusted support, take your breaks, and use available resources.", correct: true, fb: "Right. Looking after yourself is what lets you keep doing this work well." },
      { k: "C", t: "Stop caring so it stops affecting you.", correct: false, fb: "Numbing out isn\u2019t the answer \u2014 healthy support and self-care are." },
    ] },
];

const W_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "Take it seriously",
    lead: "Suicide is one of the hardest things you may face in this work, and the people you support can be at higher risk. The most important thing to know: take any sign seriously, every time. You don\u2019t have to be a therapist \u2014 you have to notice, respond with care, and get the right help.",
    callout: { v: "info", t: "Asking does not \u201cplant the idea\u201d", b: "A common fear is that asking about suicide makes it worse. It doesn\u2019t. Asking directly and calmly lowers distress and opens the door to help. <b>Silence is the real danger, not the question.</b>" },
    facts: [
      { t: "Take every sign seriously.", b: "Never dismiss talk of suicide as \u201cjust attention.\u201d" },
      { t: "Warning signs vary.", b: "They show up in words, mood, and behavior." },
      { t: "Higher risk is common here.", b: "Isolation, loss, depression, pain, and life changes all add to it." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Warning signs to watch for", "Talking about wanting to die, being a burden, having no reason to live, or feeling hopeless or trapped; withdrawing from people and activities; big changes in mood, sleep, or appetite; giving away possessions; saying goodbye; increased agitation; or a sudden calm after a stretch of deep depression. Any of these is a reason to take action."],
      ["Why the people you support may be at higher risk", "Depression, isolation, chronic pain or illness, major life changes, grief and loss, and a history of trauma all raise risk \u2014 and many people you support carry several of these. Some may also have a harder time putting distress into words, so changes in behavior matter even more."],
      ["The biggest myth", "Many people worry that asking someone whether they\u2019re thinking about suicide will give them the idea or make it worse. It does not. Asking directly and calmly actually lowers distress and opens the door to help. The danger is in staying silent, not in asking."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "A person quietly says, \u201cSometimes I feel like everyone would be better off without me.\u201d What do you do?",
    options: [
      { k: "A", t: "Brush it off so you don\u2019t make it a bigger deal than it is.", correct: false, fb: "Never brush this off. It\u2019s a serious warning sign that needs a calm, caring response and action." },
      { k: "B", t: "Take it seriously, stay calm and present, and respond with care \u2014 this is a warning sign that calls for action.", correct: true, fb: "Right. Statements like this are always taken seriously. Stay with them and move toward getting help." },
      { k: "C", t: "Tell them not to be so negative.", correct: false, fb: "That shuts the person down and dismisses real distress. Take it seriously and stay present." },
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "You\u2019re worried a person may be suicidal but afraid that asking directly will \u201cplant the idea.\u201d What\u2019s correct?",
    options: [
      { k: "A", t: "Don\u2019t ask \u2014 you might make it worse.", correct: false, fb: "This is the common myth. Asking does not increase risk \u2014 not asking leaves the person alone with it." },
      { k: "B", t: "Ask directly and calmly \u2014 asking does not increase risk, and it opens the door to help.", correct: true, fb: "Right. A direct, caring question is one of the most helpful things you can do." },
      { k: "C", t: "Hint around it without ever using the word.", correct: false, fb: "Vague hints leave room for misunderstanding. A clear, calm, direct question is better." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "How to respond: ask, listen, stay, connect",
    lead: "When you\u2019re worried someone may be suicidal, four things guide you: ask directly, listen without judgment, stay with them, and connect them to help.",
    callout: { v: "crit", t: "Immediate danger is 911", b: "If a person has just harmed themselves or is in immediate danger, <b>call 911 now and stay with them.</b> Do not leave them alone." },
    facts: [
      { t: "Ask directly.", b: "Calmly and caringly \u2014 it\u2019s okay to ask if they\u2019re thinking about suicide." },
      { t: "Listen without judgment.", b: "Let them talk; don\u2019t argue, lecture, or minimize." },
      { t: "Stay with them.", b: "Don\u2019t leave a person at risk alone; reduce access to anything that could cause harm." },
      { t: "Connect to help.", b: "A mental health professional, the 988 Lifeline, or 911 for immediate danger." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Asking directly \u2014 and what to say", "It\u2019s okay, and helpful, to ask plainly: \u201cAre you thinking about suicide?\u201d Ask calmly and without judgment. If they say yes, stay calm, thank them for telling you, keep listening, and stay with them while you get help. You don\u2019t need the perfect words \u2014 your steady, caring presence is what matters most."],
      ["Listen and take it seriously", "Let the person talk, and really listen. Don\u2019t argue, debate whether their feelings make sense, rush to fix it, lecture, or act shocked. Don\u2019t promise to keep it secret. Reflect that you hear them, that you care, and that they don\u2019t have to face this alone."],
      ["Stay, and reduce access to means of harm", "Don\u2019t leave a person who may be at risk alone \u2014 stay with them, or make sure someone safe does, until professional help is engaged. Calmly reduce their access to anything that could be used to cause harm, and keep yourself and others safe. Your presence genuinely keeps them safer."],
      ["Who to connect them to", "The 988 Suicide and Crisis Lifeline (call or text 988) reaches trained counselors any time. Also loop in the person\u2019s mental health professional, an on-call clinician, or a mobile crisis team per your agency\u2019s plan. For immediate, life-threatening danger, call 911. Then notify your supervisor and follow the person\u2019s safety plan if they have one."],
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person has just harmed themselves, or is in immediate danger of doing so, right now. What do you do?",
    options: [
      { k: "A", t: "Call the therapist\u2019s office and wait for a callback.", correct: false, fb: "Far too slow for immediate danger. Immediate, life-threatening risk is always 911." },
      { k: "B", t: "Call 911 immediately, stay with them, keep them and yourself safe, and follow the dispatcher\u2019s guidance.", correct: true, fb: "Right. Immediate danger means 911 now \u2014 and don\u2019t leave them alone." },
      { k: "C", t: "Leave to go find your supervisor.", correct: false, fb: "Don\u2019t leave a person in immediate danger alone. Call 911 and stay with them." },
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "A person tells you they\u2019re thinking about suicide and begs you to promise not to tell anyone. What\u2019s the right response?",
    options: [
      { k: "A", t: "Promise secrecy so they keep trusting you, and handle it yourself.", correct: false, fb: "You can\u2019t keep this secret \u2014 they need more help than one person can give. Promising silence leaves them at risk." },
      { k: "B", t: "Don\u2019t promise secrecy \u2014 stay with them, gently be honest that you need to get them support, and connect them to help.", correct: true, fb: "Right. Be caring and honest: you\u2019re not keeping this secret because you want them to be safe and supported." },
      { k: "C", t: "Promise to keep it secret only if they promise to stay safe.", correct: false, fb: "Don\u2019t bargain with secrecy. Stay with them, be honest, and connect them to professional help." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "After, documentation, and your own wellbeing",
    lead: "Once an immediate crisis is handled, there\u2019s follow-up \u2014 and these situations affect you, too.",
    facts: [
      { t: "Follow up and document.", b: "Report to your supervisor, document the facts, and engage the care team." },
      { t: "Don\u2019t go it alone afterward.", b: "The person needs ongoing professional support, not just one conversation." },
      { t: "Care for yourself.", b: "Responding to a suicidal crisis is heavy \u2014 reach out for support." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Follow-up and documentation", "Once the person is safe, make sure the right people know \u2014 your supervisor, the person\u2019s mental health professional, and the care team \u2014 so ongoing support is in place. Document what happened factually: what you saw or were told, what you did, and who you contacted. One good response isn\u2019t the end; the person needs continued professional care and a safety plan."],
      ["Taking care of yourself", "Supporting someone through a suicidal crisis is one of the heaviest things in this work. It\u2019s normal to feel shaken, sad, or anxious afterward. Talk to your supervisor, lean on people you trust, and use available supports. The 988 Lifeline is there for you, too. Looking after yourself isn\u2019t weakness \u2014 it\u2019s how you keep doing this work."],
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "A person was in crisis earlier and is now calmer. What\u2019s the right follow-up?",
    options: [
      { k: "A", t: "Consider it resolved \u2014 they seem fine now.", correct: false, fb: "Feeling calmer isn\u2019t the same as being out of risk. Ongoing professional support is essential." },
      { k: "B", t: "Make sure their care team and a mental health professional are engaged, follow their safety plan, document it, and keep supporting them.", correct: true, fb: "Right. One conversation isn\u2019t enough \u2014 the person needs continued care and a plan, and the team needs to know." },
      { k: "C", t: "Avoid mentioning it again so you don\u2019t upset them.", correct: false, fb: "Don\u2019t let it drop. Quiet, caring follow-up and professional support are what keep them safe." },
    ] },
];

const N_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "How diseases spread, and why prevention matters",
    lead: "Communicable diseases \u2014 illnesses that spread from person to person, like colds, flu, COVID, and stomach bugs \u2014 can spread quickly in care settings, and the people you support may be more vulnerable to getting seriously ill. Preventing spread is an everyday part of your job.",
    callout: { v: "info", t: "The most powerful tool is the simplest", b: "The single best thing you can do to prevent the spread of disease is also the easiest: <b>wash your hands, often and well.</b>" },
    facts: [
      { t: "Diseases spread in predictable ways.", b: "Touch, droplets, surfaces, and bodily fluids." },
      { t: "The people you support can be more vulnerable.", b: "Age, health conditions, and shared living raise risk." },
      { t: "Prevention is daily habits.", b: "Hand hygiene, cleaning, and not working sick." },
    ],
    dropHeading: "Go further",
    drops: [
      ["How communicable diseases spread", "Common routes: direct contact (touching an infected person or their bodily fluids), droplets (coughs and sneezes), contaminated surfaces and objects, and the fecal-oral route (germs from stool reaching the mouth, often via unwashed hands). Knowing how something spreads tells you how to stop it \u2014 mostly hand hygiene, barriers, and cleaning."],
      ["Why the people you support can be higher risk", "Shared living spaces, close personal care, older age, chronic health conditions, weakened immune systems, and difficulty reporting symptoms all make people more likely to catch \u2014 and to be harmed by \u2014 infections. A minor bug for you can be serious for them, which is why prevention isn\u2019t optional."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "What is the single most effective everyday way to prevent the spread of disease?",
    options: [
      { k: "A", t: "Taking vitamins.", correct: false, fb: "Vitamins don\u2019t prevent spread. Handwashing is the proven, everyday front line." },
      { k: "B", t: "Washing your hands often and thoroughly.", correct: true, fb: "Right. Good hand hygiene is the simplest, most powerful infection-prevention habit there is." },
      { k: "C", t: "Avoiding the people you support whenever possible.", correct: false, fb: "Avoiding people isn\u2019t the answer \u2014 good hygiene and precautions let you support them safely." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Standard precautions",
    lead: "Infection prevention runs on \u201cstandard precautions\u201d \u2014 basic practices you use with everyone, all the time, because you can\u2019t always tell who\u2019s carrying something.",
    facts: [
      { t: "Hand hygiene.", b: "Before and after care, after the bathroom, before food, after gloves." },
      { t: "Gloves and PPE.", b: "Wear gloves for bodily fluids; use masks/gowns as needed; remove and discard properly." },
      { t: "Treat all bodily fluids as infectious.", b: "Blood, urine, stool, vomit, saliva \u2014 every time." },
      { t: "Clean and disinfect.", b: "High-touch surfaces and spills, with the right products." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Handwashing, done right", "Wet hands, apply soap, and scrub all surfaces \u2014 palms, backs, between fingers, under nails \u2014 for at least 20 seconds, then rinse and dry. Wash before and after personal care, before handling food, after the bathroom, after coughing or sneezing, and after removing gloves. When soap and water aren\u2019t available, use sanitizer \u2014 but soap and water is best, especially for visible dirt or stomach bugs."],
      ["Gloves, PPE, and standard precautions", "Standard precautions means treating everyone\u2019s blood and bodily fluids as if they could be infectious, every time. Wear gloves whenever you might contact bodily fluids, broken skin, or contaminated items; use a mask or gown when splashing or respiratory illness is a risk. Gloves are single-use \u2014 change them between tasks and between people, and wash your hands after taking them off. Gloves don\u2019t replace handwashing."],
      ["Cleaning, disinfecting, and spills", "Clean high-touch surfaces (doorknobs, handrails, counters, bathrooms) regularly, and clean up spills of bodily fluids promptly using gloves and the proper disinfectant, following the product\u2019s directions and your agency\u2019s procedure. Dispose of contaminated materials safely. Cleaning removes germs; disinfecting kills them \u2014 both matter."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "You just finished a personal-care task while wearing gloves. What do you do after removing them?",
    options: [
      { k: "A", t: "Nothing \u2014 the gloves kept your hands clean.", correct: false, fb: "Hands can get contaminated as you take gloves off. Gloves never replace handwashing." },
      { k: "B", t: "Wash your hands \u2014 gloves don\u2019t replace handwashing, and hands can be contaminated when removing them.", correct: true, fb: "Right. Always wash after removing gloves, before moving on to the next task or person." },
      { k: "C", t: "Reuse the same gloves for the next task to save time.", correct: false, fb: "Gloves are single-use. Reusing them spreads germs between tasks and people." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "Why do you treat every person\u2019s bodily fluids as potentially infectious?",
    options: [
      { k: "A", t: "Because you should assume everyone is sick and keep your distance.", correct: false, fb: "It\u2019s not about avoiding people \u2014 it\u2019s about using safe practices consistently with everyone." },
      { k: "B", t: "Because you can\u2019t always tell who\u2019s carrying an infection, so the safe practice is the same with everyone, every time.", correct: true, fb: "Right \u2014 that\u2019s exactly what \u201cstandard precautions\u201d means." },
      { k: "C", t: "Only people who look sick need precautions.", correct: false, fb: "People can be contagious without looking sick. Use precautions with everyone." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Don\u2019t spread it: when sick, and reporting",
    lead: "Prevention also means not becoming the source \u2014 staying home when you\u2019re sick, and catching illness early.",
    facts: [
      { t: "Don\u2019t work sick.", b: "Fever, vomiting, diarrhea, or a contagious illness \u2014 stay home and follow policy." },
      { t: "Cover coughs and sneezes.", b: "Into your elbow or a tissue, then wash your hands." },
      { t: "Watch for illness in others.", b: "Notice signs in the people you support and report early." },
      { t: "Keep up screening and vaccines.", b: "Whatever your role and agency require." },
    ],
    dropHeading: "Go further",
    drops: [
      ["When you\u2019re the one who\u2019s sick", "If you have a fever, vomiting, diarrhea, a bad cough, or other signs of a contagious illness, don\u2019t come in around vulnerable people \u2014 follow your agency\u2019s call-out policy. Pushing through a sickness can put the people you support at real risk. Cover coughs and sneezes with your elbow or a tissue, and wash your hands often."],
      ["Spotting and reporting illness early", "Watch the people you support for signs of illness \u2014 fever, coughing, vomiting, diarrhea, rash, fatigue, or just \u201cnot themselves.\u201d Report it early so they can get care and so spread can be contained (extra cleaning, keeping a sick person comfortable and separated as appropriate). Early reporting protects everyone in a shared setting."],
      ["Vaccinations, screening, and outbreaks", "Keep up with the health screenings and vaccinations your role and agency require \u2014 they protect you and the people you support. During an outbreak (a stomach bug or respiratory illness going around a home), follow your agency\u2019s and public-health guidance closely: more cleaning, more hand hygiene, PPE, and steps to limit spread."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "You wake up on a workday with vomiting and a fever. What\u2019s the right call?",
    options: [
      { k: "A", t: "Go in anyway \u2014 you don\u2019t want to leave them short-staffed.", correct: false, fb: "Coming in sick can spread serious illness to vulnerable people. Staffing is solved another way." },
      { k: "B", t: "Stay home and follow your agency\u2019s call-out policy \u2014 coming in sick puts vulnerable people at risk.", correct: true, fb: "Right. Protecting the people you support means not bringing a contagious illness to them." },
      { k: "C", t: "Go in but just try to avoid touching anyone.", correct: false, fb: "Illnesses spread through droplets and surfaces, not just touch. Stay home and follow policy." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "You notice a person you support has diarrhea and seems feverish. Beyond caring for them, what\u2019s an important step?",
    options: [
      { k: "A", t: "Keep it to yourself unless it gets much worse.", correct: false, fb: "Don\u2019t wait \u2014 early reporting gets them care and helps prevent spread to others." },
      { k: "B", t: "Report it early so they get care and steps can be taken to prevent spread to others in the home.", correct: true, fb: "Right. Reporting early protects the person and everyone else in a shared setting." },
      { k: "C", t: "Stop all cleaning so you don\u2019t disturb them.", correct: false, fb: "The opposite \u2014 careful cleaning and hygiene matter more when someone is sick. Report it and keep up precautions." },
    ] },
];

const M_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "Who you support: ID/RC and ABI",
    lead: "The people you support are eligible for services because they have an intellectual disability, a related condition, or an acquired brain injury. Understanding what these mean \u2014 and what they don\u2019t \u2014 helps you support each person as a whole person, not a diagnosis.",
    callout: { v: "info", t: "The person comes first", b: "A diagnosis tells you a little; the person tells you everything. These categories explain eligibility and some support needs, but <b>every person is an individual first.</b>" },
    facts: [
      { t: "Intellectual disability (ID).", b: "Differences in intellectual functioning and adaptive skills that begin before adulthood." },
      { t: "Related conditions (RC).", b: "Other conditions causing similar functional impairments (e.g., cerebral palsy, autism)." },
      { t: "Acquired brain injury (ABI).", b: "Brain injury that happens after birth \u2014 from trauma, stroke, illness, or lack of oxygen." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Intellectual disability (ID)", "An intellectual disability involves differences in intellectual functioning (learning, reasoning, problem-solving) and adaptive skills (everyday living, communication, social skills), beginning before adulthood. It spans a wide spectrum \u2014 people have very different abilities, support needs, and strengths. It\u2019s lifelong, but people learn, grow, and live full lives with the right support."],
      ["Related conditions (RC)", "\u201cRelated conditions\u201d are conditions such as cerebral palsy, autism, or certain neurological conditions that cause impairments similar to intellectual disability and affect how a person functions. The label matters for eligibility; what matters for your work is understanding each person\u2019s actual abilities and support needs."],
      ["Acquired brain injury (ABI)", "An ABI is damage to the brain that happens after birth \u2014 from a traumatic injury (a car accident or fall), a stroke, an infection, a tumor, or loss of oxygen. Unlike a lifelong intellectual disability, an ABI changes a person who had different abilities before, which can affect their identity, relationships, and emotions as well as their thinking and physical function."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "What is a key difference between an intellectual disability and an acquired brain injury?",
    options: [
      { k: "A", t: "They\u2019re the same thing with different names.", correct: false, fb: "They\u2019re different. The timing and cause set them apart." },
      { k: "B", t: "An intellectual disability begins before adulthood, while an acquired brain injury happens later in life from an injury, stroke, or illness.", correct: true, fb: "Right. ABI changes someone who lived with different abilities before \u2014 which shapes how you support them." },
      { k: "C", t: "ABI is always mild and ID is always severe.", correct: false, fb: "Both vary widely in severity. That\u2019s not the difference \u2014 onset and cause are." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "How it can affect daily life",
    lead: "ID, related conditions, and ABI can affect thinking, communication, movement, emotions, and daily living \u2014 but in very different ways from person to person. Your job is to learn how it shows up for each individual.",
    facts: [
      { t: "Thinking and learning.", b: "May need more time, repetition, or simpler steps." },
      { t: "Communication.", b: "Some use few or no words, or use devices, signs, or behavior." },
      { t: "Physical and medical.", b: "Some have mobility, seizure, swallowing, or other health needs." },
      { t: "Emotional and social.", b: "Frustration, anxiety, and difficulty with change are common." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Common ways support needs show up", "People may need extra time to process and respond, instructions broken into simple steps, help with daily living, support to communicate, help managing emotions or transitions, or assistance with medical and mobility needs. Two people with the same diagnosis can need completely different support \u2014 always learn the individual."],
      ["What\u2019s different about supporting someone with an ABI", "Because an ABI happens to someone who lived without it before, they may remember their former abilities and grieve what changed. ABI can bring memory and attention problems, fatigue, impulsivity, mood swings, or trouble controlling emotions \u2014 not because the person is \u201cdifficult,\u201d but because of the injury. Patience, routine, and understanding go a long way."],
      ["Behavior makes sense in context", "Across ID, related conditions, and ABI, behavior that seems puzzling usually has a reason \u2014 difficulty communicating a need, frustration, pain, sensory overload, or the effects of a brain injury. This ties straight to positive behavior support: understand the why, support the need."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "Two people you support both have autism. What\u2019s the right assumption about their support needs?",
    options: [
      { k: "A", t: "They\u2019ll need the same things since they share a diagnosis.", correct: false, fb: "A shared diagnosis doesn\u2019t mean shared needs. People with the same label can be very different." },
      { k: "B", t: "They may have very different abilities and needs \u2014 learn each person as an individual.", correct: true, fb: "Right. The diagnosis is a starting point; the individual is what you actually support." },
      { k: "C", t: "Neither of them will be able to communicate.", correct: false, fb: "That\u2019s a stereotype. Communication varies enormously \u2014 learn how each person communicates." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person with an acquired brain injury becomes frustrated and tearful about things they used to do easily. What\u2019s a helpful understanding?",
    options: [
      { k: "A", t: "They\u2019re being dramatic and should get over it.", correct: false, fb: "That dismisses real grief. An ABI can bring genuine loss and changes in emotion." },
      { k: "B", t: "An ABI can affect emotions and bring real grief over lost abilities \u2014 respond with patience and understanding.", correct: true, fb: "Right. Understanding the injury\u2019s effects lets you respond with compassion instead of judgment." },
      { k: "C", t: "Their feelings have nothing to do with the injury.", correct: false, fb: "They often do \u2014 ABI affects emotions and brings grief over what changed. Meet it with patience." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "The mindset: person-first, strengths, dignity",
    lead: "How you think about the people you support shapes how you treat them. This whole field is built on seeing the person first.",
    callout: { v: "info", t: "Person-first", b: "It\u2019s a \u201cperson with a disability,\u201d not a \u201cdisabled person\u201d defined by it. The person comes before the diagnosis \u2014 in your language and your attitude." },
    facts: [
      { t: "Person-first language and thinking.", b: "The individual, not the label." },
      { t: "Focus on strengths and abilities.", b: "What they can do, like, and want." },
      { t: "Presume competence.", b: "Assume people can understand, learn, and decide \u2014 and support them to." },
      { t: "Dignity and high expectations.", b: "Treat adults as adults; aim high, not low." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Person-first language and presuming competence", "Say \u201ca person with a disability,\u201d \u201ca person who uses a wheelchair,\u201d \u201ca person with autism\u201d \u2014 the person leads, the diagnosis follows. And presume competence: assume the person can understand, has preferences, and can grow, even if they communicate differently or need a lot of support. Talk *to* people, not about them in front of them, and never talk down to an adult."],
      ["Strengths, dignity, and high expectations", "Every person has strengths, interests, and things they\u2019re good at \u2014 build your support around those, not just around deficits. Hold high expectations: people tend to rise to what\u2019s expected of them. Treat every adult with the dignity any adult deserves, and remember the goal is a full, self-determined life in the community \u2014 which ties straight back to their rights and to DSPD\u2019s mission."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "Which of these reflects person-first thinking?",
    options: [
      { k: "A", t: "\u201cThe autistic one in room 2.\u201d", correct: false, fb: "That defines the person by a label. Lead with the person." },
      { k: "B", t: "\u201cMaria, who has autism.\u201d", correct: true, fb: "Right \u2014 the person first, the diagnosis second." },
      { k: "C", t: "\u201cMy disabled client.\u201d", correct: false, fb: "That puts the disability before the person. Use person-first language." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "A person communicates very little with words and needs a lot of support. What\u2019s the right mindset?",
    options: [
      { k: "A", t: "Assume they can\u2019t understand and make all decisions for them.", correct: false, fb: "That\u2019s the opposite of presuming competence \u2014 and it strips away their voice and rights." },
      { k: "B", t: "Presume competence \u2014 assume they understand and have preferences, talk to them directly, and support their communication and choices.", correct: true, fb: "Right. Presume competence and support the person to understand and decide as much as possible." },
      { k: "C", t: "Talk about them to other staff as if they\u2019re not there.", correct: false, fb: "Never. Talk to people directly and respectfully \u2014 presume they understand." },
    ] },
];

const Q_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "DSPD\u2019s mission \u2014 and your part in it",
    lead: "You work inside a system built around one mission. DSPD \u2014 the Utah Division of Services for People with Disabilities, part of the Department of Health and Human Services \u2014 exists \u201cto promote opportunities and provide supports for people with disabilities to lead self-determined lives.\u201d As a direct support professional, you are how that mission reaches a person\u2019s daily life.",
    callout: { v: "info", t: "The mission in one phrase: self-determined lives", b: "Everything you do should help the person you support have <b>more choice, more control, and a fuller life in their community.</b>" },
    facts: [
      { t: "DSPD\u2019s mission.", b: "Promote opportunities and supports for people with disabilities to lead self-determined lives." },
      { t: "Part of Utah DHHS.", b: "DSPD oversees home and community-based services for thousands of Utahns." },
      { t: "You are the mission in action.", b: "The daily support you give is where it becomes real." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Who DSPD is and who it serves", "DSPD is the Utah Division of Services for People with Disabilities, within the Department of Health and Human Services. It oversees home and community-based services for thousands of Utahns with intellectual disabilities and related conditions, acquired brain injuries, and physical disabilities. Most services are delivered not by the state directly but by contracted provider agencies \u2014 like the one you work for \u2014 and their direct support professionals."],
      ["What \u201cself-determined lives\u201d means", "A self-determined life is one the person directs themselves \u2014 making their own choices, setting their own goals, taking everyday risks, and being part of their community, just like anyone else. The point of DSPD services isn\u2019t simply to keep people safe and cared for; it\u2019s to support them to live the life they choose. Your job is to support that life, not to run it for them."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "In one phrase, what is DSPD\u2019s mission centered on?",
    options: [
      { k: "A", t: "Keeping people with disabilities safe and out of the way.", correct: false, fb: "Safety matters, but it\u2019s not the mission. DSPD is about self-determined lives, not separation." },
      { k: "B", t: "Supporting people with disabilities to lead self-determined lives.", correct: true, fb: "Right \u2014 that\u2019s the heart of everything DSPD and you do." },
      { k: "C", t: "Making decisions on behalf of people with disabilities.", correct: false, fb: "The opposite \u2014 the goal is to support the person\u2019s own choices, not replace them." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Self-determination: freedom, authority, support, responsibility",
    lead: "DSPD\u2019s philosophy of self-determination rests on four principles. They sound abstract, but they show up in tiny daily moments \u2014 who decides what\u2019s for dinner, how a person spends their time, who\u2019s in their life.",
    facts: [
      { t: "Freedom.", b: "To make informed choices from the available options." },
      { t: "Authority.", b: "To have real say over the resources and supports in their life." },
      { t: "Support.", b: "To build relationships and natural supports, not just paid ones." },
      { t: "Responsibility.", b: "To take everyday risks and give back to their community." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The four principles in everyday support", "Freedom: the person chooses \u2014 what to wear, eat, do, and work toward. Authority: they have genuine say over their own supports and resources, not just token choices. Support: you help them build friendships, family ties, and community connections \u2014 natural supports that matter beyond paid staff. Responsibility: they get to take ordinary risks, learn from them, and contribute. Your role is to widen these, never to shrink them."],
      ["\u201cDignity of risk\u201d and why it matters", "Being safe doesn\u2019t mean being wrapped in cotton wool. Everyone has the right to take ordinary risks \u2014 to try, to fail, to learn, to make a choice others wouldn\u2019t. Over-protecting a person \u201cfor their own good\u201d takes away their dignity and their growth. Your job is to support informed choices and manage genuine dangers \u2014 not to remove all risk from a person\u2019s life."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "A person wants to choose their own weekend activity, but it\u2019s not what you would pick for them. What does self-determination call for?",
    options: [
      { k: "A", t: "Decide for them \u2014 you know what\u2019s good for them.", correct: false, fb: "That replaces their choice with yours. Self-determination means it\u2019s their call." },
      { k: "B", t: "Support their informed choice \u2014 it\u2019s their life and their right to choose.", correct: true, fb: "Right. Offer information and support, then honor the choice they make." },
      { k: "C", t: "Only let them choose from things you approve of.", correct: false, fb: "That\u2019s a token choice, not real freedom. Support genuine, informed choice." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person wants to try something new that carries some ordinary risk \u2014 like learning to ride public transit on their own. What\u2019s the DSPD-aligned approach?",
    options: [
      { k: "A", t: "Forbid it \u2014 it\u2019s safer if they don\u2019t.", correct: false, fb: "Removing all risk also removes dignity and growth. That\u2019s not the goal." },
      { k: "B", t: "Support them to try it with the right preparation and support \u2014 dignity of risk means people get to take ordinary chances and grow.", correct: true, fb: "Right. Prepare, support, and manage genuine dangers \u2014 but let the person live and learn." },
      { k: "C", t: "Do it for them so nothing can go wrong.", correct: false, fb: "Doing it for them takes away the very independence the mission is about." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Person-centered, and a real life in the community",
    lead: "Two more ideas run through everything DSPD does: support is person-centered, and the goal is a real life in the community.",
    facts: [
      { t: "Person-centered.", b: "Support is built around the person through their Person-Centered Support Plan (PCSP)." },
      { t: "Community integration.", b: "The goal is a full life in the community, not apart from it." },
      { t: "Your daily role.", b: "Follow the plan, honor choices, and connect people to community life." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The Person-Centered Support Plan (PCSP)", "Each person has a Person-Centered Support Plan \u2014 a document built with them (and the people who matter to them) that captures their goals, preferences, and the supports they receive. It\u2019s the roadmap for your work: it reflects what the person wants their life to look like and how staff help them get there. Know the PCSP for each person you support, and deliver what it describes."],
      ["Community integration and your part in it", "DSPD\u2019s aim is for people to live, work, and take part in the community alongside everyone else \u2014 not segregated from it. As a DSP, you\u2019re often the bridge: supporting someone to shop, work, volunteer, see friends, pursue hobbies, and be a visible part of their neighborhood. Every time you help a person connect to community life, you\u2019re delivering the core of DSPD\u2019s mission."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "What is the Person-Centered Support Plan (PCSP), and how should you treat it?",
    options: [
      { k: "A", t: "Optional paperwork you can ignore in day-to-day work.", correct: false, fb: "It\u2019s the opposite of optional \u2014 it\u2019s the roadmap for the person\u2019s support." },
      { k: "B", t: "The person-built roadmap of their goals and supports \u2014 know it and deliver what it describes.", correct: true, fb: "Right. The PCSP guides your work for each person; learn it and follow it." },
      { k: "C", t: "A document only the office cares about.", correct: false, fb: "It directly shapes your daily support. Know each person\u2019s plan." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "Which best reflects DSPD\u2019s goal of community integration?",
    options: [
      { k: "A", t: "Keeping the people you support mostly at home, separate from the community.", correct: false, fb: "That\u2019s segregation, the opposite of the goal." },
      { k: "B", t: "Supporting people to work, socialize, and take part in the community alongside everyone else.", correct: true, fb: "Right \u2014 a full, integrated community life is exactly what DSPD aims for." },
      { k: "C", t: "Doing only group activities with other people with disabilities.", correct: false, fb: "Integration means being part of the broader community, not kept separate within it." },
    ] },
];

const R_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "What Medicaid is, and where your work fits",
    lead: "The services you provide are paid for by Medicaid. You don\u2019t need to be a billing expert, but understanding where the money comes from helps you see why documentation, eligibility, and following the plan matter so much.",
    callout: { v: "info", t: "Medicaid is public money", b: "The services you deliver are funded by taxpayers through a Medicaid program with strict rules \u2014 which is why accuracy and honesty in your work aren\u2019t just good practice, <b>they\u2019re required.</b>" },
    facts: [
      { t: "Medicaid.", b: "A joint federal-and-state program that pays for health and long-term services for eligible people." },
      { t: "HCBS waivers.", b: "Special Medicaid programs that fund support in homes and the community instead of institutions." },
      { t: "Your services are waiver-funded.", b: "The support you give is paid for through these waivers." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Medicaid and HCBS waivers, briefly", "Medicaid is a joint federal-state program that covers health care and long-term supports for people who meet eligibility rules. \u201cHome and Community-Based Services\u201d (HCBS) waivers are a special kind of Medicaid program: they waive the old requirement that long-term care happen in an institution, and instead fund services that let people live in their own homes and communities. That\u2019s the funding that makes your job \u2014 and community living \u2014 possible."],
      ["Why HCBS waivers exist", "For a long time, Medicaid mainly paid for care in institutions. HCBS waivers were created so people could get support in the community instead \u2014 which is both what people overwhelmingly prefer and what the law (the ADA and the Olmstead decision) supports. The waiver model is the financial backbone of the whole community-based system you work in."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "Who ultimately pays for the services you provide?",
    options: [
      { k: "A", t: "The person\u2019s family, out of pocket.", correct: false, fb: "Generally no \u2014 waiver services are funded by Medicaid, not family payments." },
      { k: "B", t: "Medicaid \u2014 a joint federal-state public program, through HCBS waivers.", correct: true, fb: "Right. Public Medicaid dollars fund the services, which is why the rules are strict." },
      { k: "C", t: "Your provider agency, from its own funds.", correct: false, fb: "The agency is paid by Medicaid for authorized services \u2014 it isn\u2019t the ultimate funder." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "Utah\u2019s DSPD waivers and eligibility",
    lead: "In Utah, DSPD operates a set of Medicaid HCBS waivers, and each person you support qualifies for one of them. The waiver a person is on shapes which services they can receive.",
    facts: [
      { t: "DSPD operates three HCBS waivers.", b: "Community Supports (ID/related conditions), Acquired Brain Injury, and Physical Disabilities." },
      { t: "Level of care.", b: "A person must need institution-level care, but receives it in the community instead." },
      { t: "Services follow the waiver and the plan.", b: "What a person can receive depends on their waiver and their PCSP." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The DSPD waivers (Utah)", "DSPD is the operating agency for three Medicaid HCBS waivers: the Community Supports Waiver (for people with intellectual disabilities or related conditions), the Acquired Brain Injury Waiver, and the Physical Disabilities Waiver. Each funds a range of services \u2014 residential support, day supports, respite, supported employment, behavior supports, and more. Not every service is on every waiver. (Utah periodically updates and amends these waivers, so check current DSPD information for specifics.)"],
      ["Eligibility, level of care, and the waiting list", "To receive waiver services, a person must meet disability, financial (Medicaid), and \u201clevel of care\u201d criteria \u2014 meaning they need the kind of care an institution provides, but get it in the community. Demand is greater than funding, so Utah has a waiting list, and people enter services based on need and time waiting. You generally won\u2019t handle eligibility yourself, but knowing this explains why services are carefully assessed and tied to each person\u2019s plan."],
      ["Agency-based vs. self-administered services", "Utah lets people choose how to receive services: through a provider agency (like yours) or through Self-Administered Services (SAS), where the person and family direct supports more directly. Either way, the same Medicaid rules and person-centered principles apply."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "Which three Medicaid HCBS waivers does DSPD operate?",
    options: [
      { k: "A", t: "Medicare, Medicaid, and private insurance waivers.", correct: false, fb: "Those aren\u2019t DSPD waivers \u2014 and Medicare is a different program entirely." },
      { k: "B", t: "The Community Supports Waiver, the Acquired Brain Injury Waiver, and the Physical Disabilities Waiver.", correct: true, fb: "Right \u2014 those are the three HCBS waivers DSPD operates in Utah." },
      { k: "C", t: "Only one general disability waiver.", correct: false, fb: "There are three distinct DSPD waivers, each for different needs." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "What does the \u201clevel of care\u201d requirement mean for waiver eligibility?",
    options: [
      { k: "A", t: "The person must already live in an institution.", correct: false, fb: "No \u2014 the point of waivers is to serve people in the community instead of an institution." },
      { k: "B", t: "The person needs the level of care an institution would provide, but receives it in the community instead.", correct: true, fb: "Right. That\u2019s exactly what the waiver \u201cwaives\u201d \u2014 the institutional setting, not the level of need." },
      { k: "C", t: "The person needs no real support.", correct: false, fb: "The opposite \u2014 they must need a significant level of care to qualify." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Why this matters to you: documentation and integrity",
    lead: "Here\u2019s the part that touches your daily work most: because this is public money with strict rules, what you document and how honestly you work directly affects the program and the people it serves.",
    callout: { v: "crit", t: "Document only what actually happened", b: "Record services exactly as they happened. Falsifying or \u201crounding up\u201d service records is <b>Medicaid fraud</b> \u2014 it\u2019s illegal, it can cost the agency the funding people depend on, and you have a duty to report it." },
    facts: [
      { t: "Accurate documentation.", b: "Your notes and time records are the basis for billing Medicaid \u2014 they must be true." },
      { t: "Deliver what\u2019s authorized.", b: "Provide the services in the person\u2019s plan, as approved." },
      { t: "Integrity protects people.", b: "Honest billing keeps funds flowing to the people who need them." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Documentation is part of the funding chain", "When you record the support you provided, that documentation is what justifies the Medicaid payment for it. If records are inaccurate \u2014 padded, copied, or written for services that didn\u2019t happen \u2014 that\u2019s false billing, even if it seems small. Write what truly happened, when it happened, accurately and on time. Good documentation isn\u2019t busywork; it\u2019s how the whole system stays honest and funded."],
      ["Fraud, waste, and your duty", "Because these are public Medicaid dollars, fraud, waste, and abuse of the funds are taken seriously and must be reported \u2014 in Utah, to the Office of Inspector General. Never falsify records or go along with someone who asks you to. This connects directly to your training on reporting fraud, waste, and abuse: integrity in documentation is where it starts."],
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "Why must your service documentation be completely accurate?",
    options: [
      { k: "A", t: "It\u2019s just internal paperwork with no real consequences.", correct: false, fb: "It has major consequences \u2014 your records are the basis for billing public funds." },
      { k: "B", t: "Your records are the basis for billing Medicaid \u2014 inaccurate records are false billing, which is fraud.", correct: true, fb: "Right. Accurate documentation is part of the funding chain and a legal requirement." },
      { k: "C", t: "Only the numbers matter, not whether the service happened.", correct: false, fb: "Whether the service actually happened is exactly what matters. Document the truth." },
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "A coworker suggests documenting a full shift of support that was actually cut short, \u201csince it\u2019s basically the same.\u201d What\u2019s correct?",
    options: [
      { k: "A", t: "Go along with it \u2014 it\u2019s a small difference.", correct: false, fb: "There\u2019s no \u201csmall\u201d false record. Billing for time not worked is fraud." },
      { k: "B", t: "Document only what actually happened \u2014 anything else is false billing, and you have a duty to report fraud.", correct: true, fb: "Right. Record the truth, and report pressure to do otherwise." },
      { k: "C", t: "Round up just this once.", correct: false, fb: "Even once is false billing. Document exactly what happened." },
    ] },
];

const T_STEPS: Step[] = [
  { type: "lesson", kicker: "Lesson 1 of 3", title: "What the Settings Rule is, and why it exists",
    lead: "The HCBS Settings Rule is a federal Medicaid rule (from CMS, finalized in 2014) that sets requirements for where and how home and community-based services are provided. Its purpose is simple and powerful: people receiving Medicaid HCBS should have full access to community life and the same basic rights as anyone else.",
    callout: { v: "info", t: "A real home and a real community \u2014 not an institution", b: "People <b>keep their rights</b>; they don\u2019t check them at the door because they receive services. A person\u2019s home and day setting should feel like a home and a community." },
    facts: [
      { t: "A federal CMS rule (2014).", b: "Applies to all Medicaid HCBS waiver settings, including Utah\u2019s DSPD waivers." },
      { t: "The goal.", b: "Settings that are integrated in the community and support full access to it." },
      { t: "Rooted in rights.", b: "Aligned with the ADA and the Supreme Court\u2019s Olmstead decision." },
    ],
    dropHeading: "Go further",
    drops: [
      ["Where the rule came from, and what it covers", "For decades, Medicaid long-term care mostly meant institutions. As people moved into community services, CMS finalized the HCBS Settings Rule in 2014 to make sure those settings were truly community-based \u2014 not just smaller institutions. It applies to the settings where HCBS waiver services are delivered: homes, day programs, and employment settings. Because Utah\u2019s DSPD waivers are Medicaid HCBS waivers, the settings you work in must comply."],
      ["Institution vs. community \u2014 the difference the rule draws", "An institutional setting controls people\u2019s lives: fixed schedules, no privacy, no real choice, separation from the wider community. A community setting does the opposite: the person has privacy, choice, and control, and is part of the broader community. The rule is about making sure \u201chome and community-based\u201d actually means that, in real life, for each person."],
    ] },
  { type: "check", kicker: "Knowledge check 1 of 5",
    stem: "What is the core purpose of the HCBS Settings Rule?",
    options: [
      { k: "A", t: "To make group homes run on a strict, uniform schedule.", correct: false, fb: "That\u2019s institutional thinking \u2014 the rule pushes the opposite way." },
      { k: "B", t: "To ensure people receiving HCBS have full access to community life and keep their rights \u2014 settings should feel like a home and community, not an institution.", correct: true, fb: "Right. Community access, rights, choice, and a real home are the whole point." },
      { k: "C", t: "To move everyone back into institutions.", correct: false, fb: "The rule exists to prevent exactly that \u2014 it\u2019s about community living." },
    ] },
  { type: "lesson", kicker: "Lesson 2 of 3", title: "The rights the rule guarantees",
    lead: "The Settings Rule spells out specific rights every person has in their HCBS setting. As a DSP, you uphold these every day \u2014 they\u2019re not privileges to be earned or taken away.",
    facts: [
      { t: "Privacy, dignity, and respect.", b: "Including freedom from coercion and restraint." },
      { t: "Choice and autonomy.", b: "Over daily life: what and when to eat, what to do, how to spend time." },
      { t: "A real home.", b: "Privacy in their bedroom, the ability to lock their door, control of their own space." },
      { t: "Visitors and access.", b: "The freedom to have visitors and to come and go." },
    ],
    dropHeading: "Go further",
    drops: [
      ["The specific rights in a residential setting", "Under the rule, a person in their home has the right to: privacy, dignity, and respect; freedom from coercion and restraint; choice about daily activities, their physical environment, and who they spend time with; control of their own schedule and resources; to choose what and when to eat; to have visitors at any time; privacy in their bedroom, including the ability to lock their door; and the protections of a lease or similar legally enforceable agreement. These are baseline rights \u2014 not rewards."],
      ["Choice of services and providers", "The rule also says people get to choose \u2014 the setting they live in (from real options, including non-disability-specific ones), the services they receive, and who provides them. Support is directed by the person through their person-centered plan, reflecting their own goals and preferences, not a one-size-fits-all routine."],
      ["When a right is limited \u2014 the high bar", "Any restriction of these rights (for example, limiting access to food for a documented medical reason) is only allowed when it\u2019s justified by a specific assessed need, written into the person\u2019s plan with safeguards, time-limited, and regularly reviewed \u2014 never done casually, for staff convenience, or as punishment. If you think a person\u2019s rights are being limited without that justification, raise it."],
    ] },
  { type: "check", kicker: "Knowledge check 2 of 5",
    stem: "Under the Settings Rule, a person\u2019s ability to have visitors and to lock their bedroom door is:",
    options: [
      { k: "A", t: "A privilege staff can grant or remove based on behavior.", correct: false, fb: "No \u2014 these are protected rights, not behavior rewards." },
      { k: "B", t: "A baseline right protected by the rule.", correct: true, fb: "Right. Privacy, locking one\u2019s door, and having visitors are guaranteed, not earned." },
      { k: "C", t: "Only allowed in some homes.", correct: false, fb: "These rights apply across HCBS settings \u2014 they\u2019re a baseline everywhere the rule applies." },
    ] },
  { type: "check", kicker: "Knowledge check 3 of 5",
    stem: "A person wants a snack outside of set mealtimes in their own home. Under the Settings Rule, what\u2019s right?",
    options: [
      { k: "A", t: "Deny it \u2014 meals are only at scheduled times.", correct: false, fb: "Absent a specific documented need, deciding what and when to eat is the person\u2019s right." },
      { k: "B", t: "Support their choice \u2014 deciding what and when to eat is a protected right; any limit needs a specific, assessed, documented justification.", correct: true, fb: "Right. Food choice is protected; restrictions require real justification in the plan." },
      { k: "C", t: "Make them earn snacks through good behavior.", correct: false, fb: "Rights aren\u2019t earned through behavior. Food access isn\u2019t a reward." },
    ] },
  { type: "check", kicker: "Knowledge check 4 of 5",
    stem: "When is it acceptable to restrict a right guaranteed by the Settings Rule?",
    options: [
      { k: "A", t: "Whenever it\u2019s more convenient for staff.", correct: false, fb: "Never for convenience. That\u2019s exactly what the rule prohibits." },
      { k: "B", t: "Only when justified by a specific assessed need, written into the plan with safeguards, time-limited, and reviewed \u2014 never casually or as punishment.", correct: true, fb: "Right. The bar is high, individualized, documented, and regularly reviewed." },
      { k: "C", t: "Any time a staff member decides it\u2019s best.", correct: false, fb: "A staff member\u2019s say-so isn\u2019t enough \u2014 it takes an assessed, documented, reviewed justification." },
    ] },
  { type: "lesson", kicker: "Lesson 3 of 3", title: "Living the rule as a DSP",
    lead: "The Settings Rule isn\u2019t just paperwork the agency handles \u2014 it lives or dies in how you treat people every shift.",
    facts: [
      { t: "Honor choice and privacy.", b: "Knock, ask, offer options, respect \u201cno.\u201d" },
      { t: "Don\u2019t institutionalize daily life.", b: "Avoid rigid, one-size-fits-all routines that suit staff over people." },
      { t: "Support community access.", b: "Help people get out, connect, and take part." },
      { t: "Speak up.", b: "If a setting or practice is taking away rights, raise it." },
    ],
    dropHeading: "Go further",
    drops: [
      ["What compliance looks like on a shift", "Knock before entering a person\u2019s room. Offer real choices about food, activities, and routine. Respect privacy during personal care and with belongings, mail, and relationships. Support people to go into the community, not just stay in. Treat the home as the person\u2019s home, where you are a guest and a support \u2014 not a facility you run. These everyday habits are what the rule actually means."],
      ["Your voice protects rights", "You\u2019re often the one who sees whether rights are honored day to day. If you notice a setting running like an institution \u2014 rigid schedules, denied visitors, no privacy, choices taken away without justification \u2014 say something to your supervisor or through your agency\u2019s channels. Upholding the Settings Rule is part of protecting the rights and dignity you\u2019ve trained on throughout."],
    ] },
  { type: "check", kicker: "Knowledge check 5 of 5",
    stem: "Which of these reflects living out the Settings Rule on shift?",
    options: [
      { k: "A", t: "Entering a person\u2019s bedroom without knocking and setting one fixed schedule everyone must follow.", correct: false, fb: "That\u2019s institutional practice \u2014 the opposite of the rule." },
      { k: "B", t: "Knocking first, offering real choices, respecting privacy, and supporting community access.", correct: true, fb: "Right \u2014 that\u2019s the rule in everyday action." },
      { k: "C", t: "Keeping everyone home for the staff\u2019s convenience.", correct: false, fb: "Convenience doesn\u2019t override a person\u2019s right to community access." },
    ] },
];

export const TRAINING_TOPICS: Topic[] = [
  { code: "A", title: "When to call 911", category: "Emergencies & health", status: "ready",
    estMin: 10,
    intro: "Knowing when to call 911 \u2014 and acting fast without second-guessing \u2014 is one of the most important things you do. This covers what counts as a life-threatening emergency, how to tell a 911 situation from one for a doctor or nurse, and exactly how to make the call.",
    steps: A_STEPS,
    attest: "I attest that I have completed this training, understand when a situation requires calling 911, how to recognize life-threatening emergencies, and how to make the call, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "B", title: "When to call a medical professional", category: "Emergencies & health", status: "ready",
    estMin: 9,
    intro: "Not every health concern is a 911 emergency, but many need a medical professional\u2019s attention \u2014 a nurse, doctor, on-call clinician, pharmacist, or Poison Control. This covers when and who to call for non-emergency medical situations, and how to communicate and document clearly.",
    steps: B_STEPS,
    attest: "I attest that I have completed this training, understand when to contact a medical professional for non-emergency health concerns, who to contact, and how to communicate and document clearly, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "C", title: "When to call a mental health professional", category: "Emergencies & health", status: "ready",
    estMin: 9,
    intro: "Sometimes a person\u2019s struggle is emotional or psychological rather than physical. This covers how to recognize when someone needs mental health support, who to contact, the line between a crisis and a 911 emergency, and how to respond with calm and care.",
    steps: C_STEPS,
    attest: "I attest that I have completed this training, understand how to recognize when a person needs mental health support, the difference between a crisis and a 911 emergency, who to contact, and how to respond with calm and care, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "E", title: "Basic orientation to seizure disorders", category: "Emergencies & health", status: "ready",
    estMin: 12,
    intro: "A broad, practical guide to what to do when anyone has a seizure: how to recognize the different kinds, how to keep the person safe, exactly when it becomes a 911 emergency, and how to care for them and document it afterward. You\u2019ll answer real situations along the way and sign off at the end.",
    steps: SEIZURE_STEPS,
    attest: "I attest that I have completed this training, understand how to recognize a seizure, keep a person safe, identify a 911 emergency, and provide care afterward, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "G", title: "Choking rescue maneuvers (Heimlich)", category: "Emergencies & health", status: "ready",
    estMin: 11,
    intro: "When someone is choking, seconds count. This covers how to tell mild choking from a true emergency, the common rescue maneuvers (back blows and abdominal thrusts), what to do if the person becomes unresponsive, and the follow-up care afterward. It\u2019s an orientation \u2014 your hands-on first-aid and CPR certification is where you practice the skills.",
    steps: G_STEPS,
    attest: "I attest that I have completed this training, understand how to recognize choking, perform common rescue maneuvers, respond if a person becomes unresponsive, and provide follow-up care, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "H", title: "Prevention of choking", category: "Emergencies & health", status: "ready",
    estMin: 10,
    intro: "Most choking is preventable. This covers why choking risk is higher for many people you support, the everyday prevention basics \u2014 texture, pace, position, and supervision \u2014 modified diets and thickened liquids, and how to spot a swallowing problem early.",
    steps: H_STEPS,
    attest: "I attest that I have completed this training, understand the causes of choking risk, how to prevent choking through diet texture, pacing, positioning, and supervision, and how to recognize and report swallowing problems, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "N", title: "Prevention of communicable diseases", category: "Emergencies & health", status: "ready",
    estMin: 10,
    intro: "The people you support can be more vulnerable to infections, and preventing spread is an everyday part of your job. This covers how communicable diseases spread, standard precautions \u2014 hand hygiene, gloves and PPE, cleaning \u2014 and how to avoid being the source by not working sick and reporting illness early.",
    steps: N_STEPS,
    attest: "I attest that I have completed this training, understand how communicable diseases spread, standard precautions including hand hygiene and PPE, and my responsibility not to work while contagious and to report illness early, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "I", title: "Positive behavior supports (R539-4)", category: "Behavior & care", status: "ready",
    estMin: 12,
    intro: "Positive behavior support means understanding what behavior is communicating and meeting needs before crises happen \u2014 it\u2019s always your first response. This covers why behavior is communication, how to prevent escalation, how to respond calmly and follow a behavior support plan, and the strict limits on restraint under Utah\u2019s rules.",
    steps: I_STEPS,
    attest: "I attest that I have completed this training, understand positive behavior support as the first response, how to prevent and respond to behavioral escalation, how to follow a behavior support plan, and the strict limits on restrictive interventions, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "U", title: "Crisis de-escalation strategies", category: "Behavior & care", status: "ready",
    estMin: 11,
    intro: "De-escalation helps a person who is upset or in crisis calm down and stay safe, without force \u2014 and it starts with staying calm yourself. This covers the de-escalation mindset, what helps and what makes things worse, keeping everyone safe, and when to get help.",
    steps: U_STEPS,
    attest: "I attest that I have completed this training, understand crisis de-escalation strategies, what helps and what escalates a situation, how to keep everyone safe, and when to get help, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "V", title: "Trauma-informed care", category: "Behavior & care", status: "ready",
    estMin: 11,
    intro: "Many people you support have experienced trauma, and it shapes how they respond to the world. This covers what trauma is and why it matters, the principles of safety, trust, and choice, how to avoid re-traumatizing someone, and how to care for your own wellbeing.",
    steps: V_STEPS,
    attest: "I attest that I have completed this training, understand what trauma is and how it affects the people I support, the principles of trauma-informed care, how to avoid re-traumatization, and the importance of my own wellbeing, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "W", title: "Suicide prevention", category: "Behavior & care", status: "ready",
    estMin: 11,
    intro: "Suicide prevention is some of the most important \u2014 and hardest \u2014 work you\u2019ll do. This covers recognizing warning signs, the truth about asking directly, how to respond by listening and staying with the person, connecting them to professional help and 988, when to call 911, and caring for yourself afterward.",
    steps: W_STEPS,
    attest: "I attest that I have completed this training, understand how to recognize warning signs of suicide, how to respond by asking directly, listening, staying with the person, and connecting them to help, when to call 911, and the importance of follow-up and my own wellbeing, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "D", title: "Incident reporting", category: "Rights & reporting", status: "ready",
    estMin: 10,
    intro: "Reporting incidents quickly and accurately protects the people you support and is required. This covers what counts as a reportable incident, how to report promptly with objective facts, the timing rules, and your responsibilities around confidentiality, not investigating yourself, and protection from retaliation.",
    steps: D_STEPS,
    attest: "I attest that I have completed this training, understand what incidents must be reported, how and when to report them, how to document objectively, and my responsibilities regarding confidentiality and good-faith reporting, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "F", title: "Notification when a person\u2019s whereabouts are unknown", category: "Rights & reporting", status: "ready",
    estMin: 9,
    intro: "When you can\u2019t account for where a person in your care is, every minute counts. This covers acting fast the moment you notice, the search-and-notification steps (including when to call 911), what to do once they\u2019re found, and how to document it.",
    steps: F_STEPS,
    attest: "I attest that I have completed this training, understand how to respond when a person\u2019s whereabouts are unknown, the notification steps including when to involve police and 911, and how to follow up and document, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "J", title: "Legal rights of persons & the ADA", category: "Rights & reporting", status: "ready",
    estMin: 11,
    intro: "The people you support keep all the rights everyone else has \u2014 a disability doesn\u2019t change that. This covers their everyday rights, what the Americans with Disabilities Act means for your work, and how rights can (and can\u2019t) be limited, plus your role as an advocate.",
    steps: J_STEPS,
    attest: "I attest that I have completed this training, understand the legal rights of the persons I support, how the Americans with Disabilities Act relates to those rights, and how rights restrictions and advocacy work, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "K", title: "Abuse, neglect & exploitation: prevention & reporting", category: "Rights & reporting", status: "ready",
    estMin: 12,
    intro: "Protecting the people you support from abuse, neglect, and exploitation is one of your most serious duties \u2014 and you are a mandatory reporter. This covers the three types of harm, the warning signs, and exactly how and where to report, including to Adult Protective Services and the police.",
    steps: K_STEPS,
    attest: "I attest that I have completed this training, understand how to recognize and help prevent abuse, neglect, and exploitation, that I am a mandatory reporter, and how and where to report including to protective services and the police, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "L", title: "Confidentiality & HIPAA", category: "Rights & reporting", status: "ready",
    estMin: 10,
    intro: "Everything you learn about a person you support is private. This covers what confidentiality and HIPAA require, the everyday habits that protect it, when sharing information is appropriate, and what to do if a breach happens.",
    steps: L_STEPS,
    attest: "I attest that I have completed this training, understand my confidentiality and HIPAA obligations, when information may and may not be shared, and how to report a breach, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "S", title: "Reporting fraud, waste & abuse to the OIG", category: "Rights & reporting", status: "ready",
    estMin: 9,
    intro: "Beyond protecting people from harm, you also help protect the Medicaid funds that pay for their services. This covers what fraud, waste, and abuse of the program look like, your duty to report them to the Utah Office of Inspector General, and the protections that come with reporting.",
    steps: S_STEPS,
    attest: "I attest that I have completed this training, understand what fraud, waste, abuse, and mismanagement of Medicaid funds look like, my duty to report them to the Utah Office of Inspector General, and the protections for good-faith reporting, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "M", title: "Orientation to ID/RC and ABI", category: "Foundations & compliance", status: "ready",
    estMin: 11,
    intro: "Understanding who you support \u2014 people with intellectual disabilities, related conditions, or acquired brain injuries \u2014 helps you see each person as an individual, not a diagnosis. This covers what ID/RC and ABI mean, how they can affect daily life, and the person-first, strengths-based mindset at the heart of this work.",
    steps: M_STEPS,
    attest: "I attest that I have completed this training, understand the basics of intellectual disabilities, related conditions, and acquired brain injury, how they can affect daily life, and the person-first, strengths-based, competence-presuming approach to support, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "P", title: "The agency\u2019s policies & procedures", category: "Foundations & compliance", status: "soon" },
  { code: "Q", title: "Introduction to DSPD philosophy & mission", category: "Foundations & compliance", status: "ready",
    estMin: 11,
    intro: "You work inside DSPD\u2019s mission: supporting people with disabilities to lead self-determined lives. This covers what that mission means, the four principles of self-determination (freedom, authority, support, responsibility), the dignity of risk, person-centered planning, and the goal of a full life in the community.",
    steps: Q_STEPS,
    attest: "I attest that I have completed this training, understand DSPD\u2019s mission and philosophy of self-determination, the principles of freedom, authority, support, and responsibility, the dignity of risk, person-centered support, and community integration, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "R", title: "DHHS Medicaid 101 (applicable portions)", category: "Foundations & compliance", status: "ready",
    estMin: 11,
    intro: "The services you provide are funded by Medicaid, and that shapes the rules you work under. This covers what Medicaid and HCBS waivers are, the three waivers DSPD operates in Utah, eligibility and level of care, and why accurate documentation and integrity matter so much in your daily work.",
    steps: R_STEPS,
    attest: "I attest that I have completed this training, understand that my services are funded through Medicaid HCBS waivers, the basics of the DSPD waivers and eligibility in Utah, and why accurate documentation and integrity are required, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "T", title: "HCBS Settings Rule", category: "Foundations & compliance", status: "ready",
    estMin: 11,
    intro: "The HCBS Settings Rule is the federal rule guaranteeing that people receiving home and community-based services keep their rights and have full access to community life. This covers what the rule is and why it exists, the specific rights it protects, the high bar for any restriction, and how you uphold it on every shift.",
    steps: T_STEPS,
    attest: "I attest that I have completed this training, understand the purpose of the HCBS Settings Rule, the rights it guarantees including privacy, choice, a real home, and community access, the strict limits on restricting those rights, and how I uphold the rule in daily practice, and that I was given the opportunity to ask questions and received adequate answers." },
  { code: "O", title: "Person-specific training", category: "Assigned per person", status: "pp" },
];

/* ───────────────────────── UI bits ───────────────────────── */
const card: React.CSSProperties = { background: "#fff", border: "1px solid #e4e7ef", borderRadius: 14, overflow: "hidden", maxWidth: 560, margin: "0 auto", boxShadow: "0 12px 40px rgba(11,17,38,.10)" };
const btn = (kind: "pri" | "out" | "dis"): React.CSSProperties => ({
  font: "inherit", fontSize: 13.5, fontWeight: 600, padding: "11px 18px", borderRadius: 10, cursor: kind === "dis" ? "not-allowed" : "pointer", border: kind === "out" ? "1px solid #cdd2e0" : "none",
  background: kind === "pri" ? GOLD : kind === "dis" ? "#eef0f5" : "#fff", color: kind === "pri" ? NAVY : kind === "dis" ? "#a3a8b8" : "#1C2A5E",
});

function Accordion({ drops }: { drops: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div>
      {drops.map(([t, b], i) => (
        <div key={i}>
          <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", textAlign: "left", font: "inherit", fontSize: 13, fontWeight: 600, color: "#1C2A5E", background: "#f7f8fb", border: "1px solid #e4e7ef", borderRadius: 10, padding: "11px 13px", marginBottom: 7, cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span>{t}</span><span>{open === i ? "\u25B4" : "\u25BE"}</span>
          </button>
          {open === i && <div style={{ fontSize: 12.8, color: "#42485a", lineHeight: 1.6, padding: "2px 4px 12px" }} dangerouslySetInnerHTML={{ __html: b }} />}
        </div>
      ))}
    </div>
  );
}

function Check({ step, onPass }: { step: CheckStep; onPass: () => void }) {
  const [done, setDone] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = step.options.find(o => o.k === picked);
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#b07819" }}>{step.kicker}</div>
      <div style={{ fontSize: 15.5, fontWeight: 600, color: INK, margin: "5px 0 14px", lineHeight: 1.4 }}>{step.stem}</div>
      {step.options.map(o => {
        const isPicked = picked === o.k;
        const border = isPicked ? (o.correct ? "#1D9E75" : "#e29a9a") : "#e4e7ef";
        const bg = isPicked ? (o.correct ? "#e1f5ee" : "#fdeded") : "#fff";
        return (
          <button key={o.k} disabled={done} onClick={() => { setPicked(o.k); if (o.correct) setDone(true); }}
            style={{ width: "100%", textAlign: "left", font: "inherit", fontSize: 13.5, padding: "12px 13px", border: `1px solid ${border}`, borderRadius: 12, background: bg, cursor: done ? "default" : "pointer", color: "#2a3040", marginBottom: 9, display: "flex", gap: 10, lineHeight: 1.45, opacity: done && !o.correct ? .5 : 1 }}>
            <b style={{ color: "#6b7180" }}>{o.k}.</b><span>{o.t}</span>
          </button>
        );
      })}
      {chosen && !chosen.correct && <div style={{ fontSize: 12.5, color: "#854f0b", background: "#faeeda", border: "1px solid #fac775", borderRadius: 11, padding: "11px 13px", lineHeight: 1.5 }}>{chosen.fb} Try again.</div>}
      {chosen && chosen.correct && (
        <>
          <div style={{ fontSize: 12.5, color: "#0f6e56", background: "#e1f5ee", border: "1px solid #9fe1cb", borderRadius: 11, padding: "11px 13px", lineHeight: 1.5 }}>{chosen.fb}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><button style={btn("pri")} onClick={onPass}>Continue</button></div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Module engine ───────────────────────── */
export function TrainingModule({
  topic,
  onExit,
  onComplete,
}: {
  topic: Topic;
  onExit: () => void;
  onComplete?: (signature: string) => Promise<void> | void;
}) {
  const flow: ({ type: "intro" } | Step | { type: "attest" } | { type: "complete" })[] =
    [{ type: "intro" }, ...(topic.steps || []), { type: "attest" }, { type: "complete" }];
  const checks = (topic.steps || []).filter(s => s.type === "check").length;
  const lessons = (topic.steps || []).filter(s => s.type === "lesson").length;
  const [i, setI] = useState(0);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const step = flow[i] as any;
  const pct = Math.round((i / (flow.length - 1)) * 100);
  const next = () => setI(i + 1), back = () => setI(i - 1);
  const submitAttestAndContinue = async () => {
    if (submitting) return;
    try {
      setSubmitting(true);
      if (onComplete) await onComplete(name.trim());
      setI(i + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", ...card }}>
      <div style={{ background: NAVY, padding: "13px 17px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 26, height: 26, background: GOLD, clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)" }} />
          <div><div style={{ color: GOLD, fontSize: 10, fontWeight: 600, letterSpacing: ".1em" }}>Hive Launchpad · code {topic.code}</div><div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{topic.title}</div></div>
        </div>
      </div>
      <div style={{ height: 5, background: "#eef0f5" }}><div style={{ height: "100%", width: pct + "%", background: GOLD, transition: "width .35s" }} /></div>

      <div style={{ padding: 20, minHeight: 400, color: "#2a3040" }}>
        {step.type === "intro" && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#b07819" }}>Code {topic.code}</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: INK, margin: "3px 0 8px" }}>{topic.title}</div>
            <div style={{ fontSize: 12, color: "#8a8f9e", marginBottom: 14 }}>About {topic.estMin} minutes · {lessons} lessons, {checks} scenarios, then you sign</div>
            <div style={{ background: "#f7f8fb", border: "1px solid #e4e7ef", borderRadius: 12, padding: "13px 14px", fontSize: 13.5, lineHeight: 1.6 }}>{topic.intro}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
              <button style={btn("out")} onClick={onExit}>All topics</button>
              <button style={btn("pri")} onClick={next}>Begin</button>
            </div>
          </>
        )}

        {step.type === "lesson" && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: TEAL }}>{step.kicker}</div>
            <div style={{ fontSize: 21, fontWeight: 700, color: INK, margin: "3px 0 8px" }}>{step.title}</div>
            {step.lead && <div style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 13 }}>{step.lead}</div>}
            {step.callout && (
              <div style={{ borderRadius: 12, padding: "12px 14px", marginBottom: 6, border: `1px solid ${step.callout.v === "crit" ? "#f3c6c6" : "#b9d6f2"}`, background: step.callout.v === "crit" ? "#fdeded" : "#eaf3fc" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: step.callout.v === "crit" ? "#a32d2d" : "#185fa5" }}>{step.callout.t}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 5, color: step.callout.v === "crit" ? "#7a2222" : "#1c4e80" }} dangerouslySetInnerHTML={{ __html: step.callout.b }} />
              </div>
            )}
            {step.facts?.map((f: Fact, n: number) => (
              <div key={n} style={{ display: "flex", gap: 11, fontSize: 13.5, lineHeight: 1.5, margin: "0 0 11px" }}>
                <span style={{ color: TEAL, flex: "0 0 auto", marginTop: 1 }}>{"\u25C6"}</span>
                <div><b style={{ color: INK }}>{f.t}</b> {f.b}</div>
              </div>
            ))}
            {step.dropHeading && <div style={{ fontSize: 11, fontWeight: 700, color: TEAL, textTransform: "uppercase", letterSpacing: ".06em", margin: "16px 0 9px" }}>{step.dropHeading}</div>}
            {step.drops && <Accordion drops={step.drops} />}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
              <button style={btn("out")} onClick={back}>Back</button>
              <button style={btn("pri")} onClick={next}>Continue</button>
            </div>
          </>
        )}

        {step.type === "check" && <Check step={step as CheckStep} onPass={next} />}

        {step.type === "attest" && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".1em", textTransform: "uppercase", color: "#4e1f81" }}>Attestation</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: INK, margin: "4px 0 14px" }}>Confirm and sign</div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "#f7f8fb", border: "1px solid #e4e7ef", borderRadius: 12, padding: "13px 14px", cursor: "pointer" }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2, width: 17, height: 17, accentColor: "#1C2A5E" }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>{topic.attest}</span>
            </label>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#8a8f9e", marginBottom: 5 }}>Type your full name to sign</div>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jordan Rivera" style={{ width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 13.5, padding: "10px 12px", border: "1px solid #cdd2e0", borderRadius: 10 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18 }}>
              <button style={btn("out")} onClick={back}>Back</button>
              <button style={btn(agree && name.trim().length > 1 && !submitting ? "pri" : "dis")} disabled={!(agree && name.trim().length > 1) || submitting} onClick={submitAttestAndContinue}>{submitting ? "Saving…" : "Complete topic \u2713"}</button>
            </div>
          </>
        )}

        {step.type === "complete" && (
          <>
            <div style={{ textAlign: "center", paddingTop: 6 }}>
              <div style={{ width: 48, height: 48, margin: "0 auto", borderRadius: "50%", background: "#e1f5ee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, color: "#0f6e56" }}>\u2713</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: INK, marginTop: 12 }}>Topic complete</div>
              <div style={{ fontSize: 12.5, color: "#8a8f9e", marginTop: 4 }}>Signed by {name || "\u2014"} · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {[[`${checks}/${checks}`, "knowledge checks", "#0f6e56"], [topic.code, "topic code", "#1C2A5E"], ["\u2713", "attestation", "#b07819"]].map(([n, l, c], k) => (
                <div key={k} style={{ flex: 1, background: "#f7f8fb", border: "1px solid #e4e7ef", borderRadius: 11, padding: 11, textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{n}</div><div style={{ fontSize: 11, color: "#8a8f9e" }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: TEAL, textAlign: "center", marginTop: 13 }}>Logged to the staff training record — timestamped for audit.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><button style={btn("pri")} onClick={onExit}>All topics</button></div>
          </>
        )}
      </div>
    </div>
  );
}

export type { Topic, Step, LessonStep, CheckStep, Callout, Fact };

