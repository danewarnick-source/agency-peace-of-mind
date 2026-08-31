import type { ExamQuestion } from "./in-hive-training";
import type { InHiveCourseId } from "./in-hive-training";

const thirtyDayExam: ExamQuestion[] = [
  {
    id: "td-a1",
    topicCode: "A",
    stem: "You walk in and a client has collapsed and is not breathing. Staff Jordan is next to you. What do you do first?",
    options: [
      { k: "A", t: "Call your supervisor and wait for instructions.", correct: false },
      { k: "B", t: "Call 911 now, then begin CPR if you are trained and send someone for an AED.", correct: true },
      { k: "C", t: "Wait one minute to see if they start breathing again.", correct: false },
    ],
    sowCite: "1.8(4)(A)",
  },
  {
    id: "td-a2",
    topicCode: "A",
    stem: "Client Maya’s face droops on one side, one arm drifts down, and her speech is slurred. What do you do?",
    options: [
      { k: "A", t: "Have her lie down and reassess in an hour.", correct: false },
      { k: "B", t: "Call 911 immediately and note the time the symptoms started.", correct: true },
      { k: "C", t: "Give water and aspirin and wait to see if it passes.", correct: false },
    ],
    sowCite: "1.8(4)(A)",
  },
  {
    id: "td-b1",
    topicCode: "B",
    stem: "Client Sam has a fever of 101°F. He is tired but alert, drinking fluids, and breathing normally. What is the right call?",
    options: [
      { k: "A", t: "Call 911 — any fever is an emergency.", correct: false },
      { k: "B", t: "Contact the nurse or on-call medical line, follow their guidance, and document it.", correct: true },
      { k: "C", t: "Wait until tomorrow and see how he feels.", correct: false },
    ],
    sowCite: "1.8(4)(B)",
  },
  {
    id: "td-c1",
    topicCode: "C",
    stem: "Client Lena quietly says she feels hopeless and that everyone would be better off without her. She is not in immediate danger. What do you do?",
    options: [
      { k: "A", t: "Change the subject so you do not make it worse.", correct: false },
      { k: "B", t: "Take it seriously, stay with her, and contact a mental-health professional or 988.", correct: true },
      { k: "C", t: "Tell her to sleep on it and check in next week.", correct: false },
    ],
    sowCite: "1.8(4)(C)",
  },
  {
    id: "td-d1",
    topicCode: "D",
    stem: "Client Omar falls, gets a cut that needs first aid, and is otherwise stable. What is your reporting duty?",
    options: [
      { k: "A", t: "Only report it if a supervisor asks.", correct: false },
      { k: "B", t: "Report it promptly with facts — what you saw, when, who was involved, and what you did.", correct: true },
      { k: "C", t: "Wait until the end of the week so you can batch several events.", correct: false },
    ],
    sowCite: "1.8(4)(D)",
  },
  {
    id: "td-e1",
    topicCode: "E",
    stem: "Client Marcus has no known seizure history. He stiffens, loses consciousness, and begins convulsing. What is your first move?",
    options: [
      { k: "A", t: "Hold his arms and legs still so he does not hurt himself.", correct: false },
      { k: "B", t: "Clear the space, turn him on his side, cushion his head, note the time, and call 911 because it is a first seizure.", correct: true },
      { k: "C", t: "Put something soft between his teeth.", correct: false },
    ],
    sowCite: "1.8(4)(E)",
  },
  {
    id: "td-e2",
    topicCode: "E",
    stem: "A client with a known seizure disorder has been seizing for more than 5 minutes. What do you do?",
    options: [
      { k: "A", t: "Keep waiting — they have a history, so it will stop.", correct: false },
      { k: "B", t: "Call 911 now while keeping them safe on their side.", correct: true },
      { k: "C", t: "Call your supervisor first to ask whether 911 is needed.", correct: false },
    ],
    sowCite: "1.8(4)(E)",
  },
  {
    id: "td-f1",
    topicCode: "F",
    stem: "You cannot account for where client Priya is. What do you do first?",
    options: [
      { k: "A", t: "Wait 30 minutes to see if she comes back.", correct: false },
      { k: "B", t: "Start looking and notify your supervisor immediately — the clock starts when you notice.", correct: true },
      { k: "C", t: "Post about it on social media so more people can look.", correct: false },
    ],
    sowCite: "1.8(4)(F)",
  },
  {
    id: "td-g1",
    topicCode: "G",
    stem: "Client Ben cannot cough, speak, or breathe and is clutching his throat. What do you do?",
    options: [
      { k: "A", t: "Offer him water and tell him to relax.", correct: false },
      { k: "B", t: "Treat it as severe choking — get 911 coming and begin back blows and abdominal thrusts as trained.", correct: true },
      { k: "C", t: "Do a finger sweep even though you cannot see an object.", correct: false },
    ],
    sowCite: "1.8(4)(G)",
  },
  {
    id: "td-h1",
    topicCode: "H",
    stem: "Client Nora is prescribed pureed food. The kitchen sent a regular sandwich. What do you do?",
    options: [
      { k: "A", t: "Serve the sandwich — she will probably be fine.", correct: false },
      { k: "B", t: "Do not guess — confirm the prescribed texture and get the correct food before serving.", correct: true },
      { k: "C", t: "Cut the sandwich into small pieces and serve it.", correct: false },
    ],
    sowCite: "1.8(4)(H)",
  },
  {
    id: "td-i1",
    topicCode: "I",
    stem: "Client Theo starts pacing and raising his voice. You know his plan says to offer space and a quiet activity. What is the first response?",
    options: [
      { k: "A", t: "Use a hold to make him sit down.", correct: false },
      { k: "B", t: "Follow the plan — offer space and a quiet activity, and stay calm. Positive supports come first.", correct: true },
      { k: "C", t: "Take away dinner as a consequence.", correct: false },
    ],
    sowCite: "1.8(4)(I)",
  },
  {
    id: "td-j1",
    topicCode: "J",
    stem: "Staff Casey wants to lock the snack cabinet because it is easier on the shift. The client has no approved restriction. What is correct?",
    options: [
      { k: "A", t: "Lock it — staff convenience is a valid reason.", correct: false },
      { k: "B", t: "Do not restrict access on your own. Rights are not privileges, and any limit needs an approved process.", correct: true },
      { k: "C", t: "Lock it today and write a note tomorrow.", correct: false },
    ],
    sowCite: "1.8(4)(J)",
  },
  {
    id: "td-k1",
    topicCode: "K",
    stem: "You suspect a coworker is taking a client’s money. What must you do?",
    options: [
      { k: "A", t: "Keep watching until you can prove it.", correct: false },
      { k: "B", t: "Report your suspicion promptly — to your agency process and to Adult Protective Services and/or the police. Suspicion is enough.", correct: true },
      { k: "C", t: "Confront the coworker privately and leave it there.", correct: false },
    ],
    sowCite: "1.8(4)(K)",
  },
  {
    id: "td-k2",
    topicCode: "K",
    stem: "A client tells you another staff member yelled at them and shoved them. They are safe right now. What do you do?",
    options: [
      { k: "A", t: "Tell them not to make accusations without proof.", correct: false },
      { k: "B", t: "Take it seriously, report it through the required channels including APS/police as required, and do not investigate on your own.", correct: true },
      { k: "C", t: "Ask other staff to vote on whether it happened.", correct: false },
    ],
    sowCite: "1.8(4)(K)",
  },
  {
    id: "td-l1",
    topicCode: "L",
    stem: "A friend asks why a client you support was at the clinic yesterday. What do you say?",
    options: [
      { k: "A", t: "Share a short version because the friend means well.", correct: false },
      { k: "B", t: "Do not share — health information stays private unless the person needs to know for care, safety, or required business.", correct: true },
      { k: "C", t: "Confirm they were there but skip the details.", correct: false },
    ],
    sowCite: "1.8(4)(L)",
  },
  {
    id: "td-m1",
    topicCode: "M",
    stem: "A new staff member talks about “the ABI kid” in front of others. What is the better approach?",
    options: [
      { k: "A", t: "Diagnosis-first labels are fine if they are accurate.", correct: false },
      { k: "B", t: "Use the person’s name and person-first language. A diagnosis is one fact, not their identity.", correct: true },
      { k: "C", t: "Use nicknames so you do not have to say a diagnosis.", correct: false },
    ],
    sowCite: "1.8(4)(M)",
  },
  {
    id: "td-n1",
    topicCode: "N",
    stem: "You wake up with a fever and a cough on a workday. What should you do?",
    options: [
      { k: "A", t: "Go in anyway — the shift is short-staffed.", correct: false },
      { k: "B", t: "Stay home, notify your supervisor, and do not work while contagious.", correct: true },
      { k: "C", t: "Go in but avoid shaking hands.", correct: false },
    ],
    sowCite: "1.8(4)(N)",
  },
  {
    id: "td-o1",
    topicCode: "O",
    stem: "You are assigned to support client Ava for the first time this afternoon, alone. You have not reviewed her records. What must you do before working alone?",
    options: [
      { k: "A", t: "Start the shift and learn as you go — most people are similar.", correct: false },
      { k: "B", t: "Learn her specific disability effects, medical and safety needs, plan and supports, your duties, and any DNR/POLST or hospice information before you work alone.", correct: true },
      { k: "C", t: "Ask a coworker one question in the hallway and that is enough.", correct: false },
    ],
    sowCite: "1.8(4)(O)",
  },
  {
    id: "td-o2",
    topicCode: "O",
    stem: "Where do you find what you must know about a specific client before working alone?",
    options: [
      { k: "A", t: "A generic internet article about their diagnosis.", correct: false },
      { k: "B", t: "The records and documents your agency keeps for that person — ask your supervisor where they are if you cannot find them.", correct: true },
      { k: "C", t: "Social media posts from the family.", correct: false },
    ],
    sowCite: "1.8(4)(O)",
  },
  {
    id: "td-p1",
    topicCode: "P",
    stem: "You are not sure what your agency requires for incident reporting or emergencies. What is the right move?",
    options: [
      { k: "A", t: "Guess based on a previous job.", correct: false },
      { k: "B", t: "Read this agency’s written policies and ask your supervisor where those documents are.", correct: true },
      { k: "C", t: "Wait until something goes wrong, then ask.", correct: false },
    ],
    sowCite: "1.8(4)(P)",
  },
  {
    id: "td-q1",
    topicCode: "Q",
    stem: "Client Eli wants to try a community class that has some risk. The activity is legal and in his plan. What does DSPD philosophy point you toward?",
    options: [
      { k: "A", t: "Say no — risk should always be removed.", correct: false },
      { k: "B", t: "Support informed choice and dignity of risk, with the supports that keep him as safe as possible.", correct: true },
      { k: "C", t: "Decide for him because you know better.", correct: false },
    ],
    sowCite: "1.8(4)(Q)",
  },
  {
    id: "td-r1",
    topicCode: "R",
    stem: "You realize a timesheet would be easier if you billed a shift that did not happen. What is true?",
    options: [
      { k: "A", t: "Rounding up a little is normal and not a problem.", correct: false },
      { k: "B", t: "Billing for services that were not provided is Medicaid fraud. Record only what actually happened.", correct: true },
      { k: "C", t: "It is fine if a supervisor later initials it.", correct: false },
    ],
    sowCite: "1.8(4)(R)",
  },
  {
    id: "td-s1",
    topicCode: "S",
    stem: "You suspect someone is billing Medicaid for services that were not provided. Besides telling your supervisor, where can you report it?",
    options: [
      { k: "A", t: "Only to the client’s neighbor.", correct: false },
      { k: "B", t: "The Utah Office of Inspector General — oig.utah.gov/report-fraud/", correct: true },
      { k: "C", t: "A public social media page.", correct: false },
    ],
    sowCite: "1.8(4)(S)",
  },
  {
    id: "td-t1",
    topicCode: "T",
    stem: "Staff want to keep everyone home today because it is easier than supporting community access. What does the HCBS Settings Rule require?",
    options: [
      { k: "A", t: "Staff convenience can override community access.", correct: false },
      { k: "B", t: "People keep the right to community life, choice, and a real home — convenience is not a reason to take that away.", correct: true },
      { k: "C", t: "The rule only applies in hospitals.", correct: false },
    ],
    sowCite: "1.8(4)(T)",
  },
  {
    id: "td-u1",
    topicCode: "U",
    stem: "Client Rosa is yelling and pacing. You feel your own voice rising. What should you do?",
    options: [
      { k: "A", t: "Match her volume so she knows you are in charge.", correct: false },
      { k: "B", t: "Lower your own intensity, give space, and use the de-escalation steps you were trained to use.", correct: true },
      { k: "C", t: "Restrain her immediately so the yelling stops.", correct: false },
    ],
    sowCite: "1.8(4)(U)",
  },
  {
    id: "td-v1",
    topicCode: "V",
    stem: "A client startles and shuts down when a door slams. Staff say they are “overreacting.” What is the trauma-informed view?",
    options: [
      { k: "A", t: "Punish the reaction so it stops.", correct: false },
      { k: "B", t: "Treat it as a possible trauma response — offer safety, predictability, and choice instead of shame.", correct: true },
      { k: "C", t: "Ignore it because it is not a medical issue.", correct: false },
    ],
    sowCite: "1.8(4)(V)",
  },
  {
    id: "td-w1",
    topicCode: "W",
    stem: "You are worried a client may be thinking about suicide. What is true?",
    options: [
      { k: "A", t: "Do not ask directly — it plants the idea.", correct: false },
      { k: "B", t: "Ask directly, listen, stay with them, and connect them to help (988 or 911 if there is immediate danger).", correct: true },
      { k: "C", t: "Leave them alone so they can have privacy.", correct: false },
    ],
    sowCite: "1.8(4)(W)",
  },
  {
    id: "td-w2",
    topicCode: "W",
    stem: "A client has a plan and the means to harm themselves right now. What do you do?",
    options: [
      { k: "A", t: "Make a note and check in tomorrow.", correct: false },
      { k: "B", t: "Call 911, stay with them, and do not leave them alone.", correct: true },
      { k: "C", t: "Ask them to promise they will not do anything, then leave.", correct: false },
    ],
    sowCite: "1.8(4)(W)",
  },
];

const abiExam: ExamQuestion[] = [
  {
    id: "abi-a1",
    topicCode: "A",
    stem: "After a brain injury, client Diego suddenly swears and walks out of a store. What is the most accurate frame?",
    options: [
      { k: "A", t: "He is choosing to be rude and should be punished first.", correct: false },
      { k: "B", t: "Brain injury can change impulse control, mood, and judgment — stay calm, keep him safe, and follow his plan.", correct: true },
      { k: "C", t: "Brain injury only affects walking, never behavior.", correct: false },
    ],
    sowCite: "1.8(8)(A)",
  },
  {
    id: "abi-a2",
    topicCode: "A",
    stem: "Staff say a client with ABI is “lazy” because they need long rest after a short outing. What should you remember?",
    options: [
      { k: "A", t: "Fatigue and slower processing are common after brain injury — build in rest instead of pushing through.", correct: true },
      { k: "B", t: "If they can walk, they should keep the same pace as staff.", correct: false },
      { k: "C", t: "Rest is only for people with a fever.", correct: false },
    ],
    sowCite: "1.8(8)(A)",
  },
  {
    id: "abi-b1",
    topicCode: "B",
    stem: "A client is leaving the hospital after a brain injury to live in the community. What is your role as direct-care staff?",
    options: [
      { k: "A", t: "Replace the hospital team and change their medications yourself.", correct: false },
      { k: "B", t: "Follow the discharge and rehab plan, know who to call, and help with the community supports the team named.", correct: true },
      { k: "C", t: "Wait until they are fully recovered before offering any support.", correct: false },
    ],
    sowCite: "1.8(8)(B)",
  },
  {
    id: "abi-b2",
    topicCode: "B",
    stem: "The family asks who can help with brain-injury resources in Utah. What is a correct direction?",
    options: [
      { k: "A", t: "Tell them there are no community resources after hospital discharge.", correct: false },
      { k: "B", t: "Point them to the support coordinator and known community resources (for example Brain Injury Alliance of Utah) — do not invent a clinic.", correct: true },
      { k: "C", t: "Tell them to only call 911 for every question.", correct: false },
    ],
    sowCite: "1.8(8)(B)",
  },
  {
    id: "abi-c1",
    topicCode: "C",
    stem: "Client Hoa forgets steps of a familiar task and gets overwhelmed in noisy stores. What does that tell you?",
    options: [
      { k: "A", t: "They are not trying. End community outings.", correct: false },
      { k: "B", t: "Memory, attention, and sensory load can change after brain injury — use simple steps, cues, and quieter settings as the plan allows.", correct: true },
      { k: "C", t: "Functional impact only means using a wheelchair.", correct: false },
    ],
    sowCite: "1.8(8)(C)",
  },
  {
    id: "abi-c2",
    topicCode: "C",
    stem: "A client with ABI can walk but cannot safely manage money or a hot stove today. What is the staff takeaway?",
    options: [
      { k: "A", t: "If they walk, they can do every task without support.", correct: false },
      { k: "B", t: "Function is task-specific — support the skills that are hard, and do not assume one ability means all abilities.", correct: true },
      { k: "C", t: "Take over every task permanently so they never practice.", correct: false },
    ],
    sowCite: "1.8(8)(C)",
  },
  {
    id: "abi-d1",
    topicCode: "D",
    stem: "A client with ABI has a new severe headache, vomiting, and is harder to wake. What do you do?",
    options: [
      { k: "A", t: "Give an extra dose of their usual medication.", correct: false },
      { k: "B", t: "Treat it as urgent — call 911 or the medical professional their plan names. Do not change medications on your own.", correct: true },
      { k: "C", t: "Wait until the next scheduled clinic visit next month.", correct: false },
    ],
    sowCite: "1.8(8)(D)",
  },
  {
    id: "abi-d2",
    topicCode: "D",
    stem: "A client’s ABI medications make them drowsy and unsteady in the morning. What is the safe staff action?",
    options: [
      { k: "A", t: "Skip the dose so they are more alert for an outing.", correct: false },
      { k: "B", t: "Give medications exactly as ordered, watch for side effects, and report changes — never change a dose on your own.", correct: true },
      { k: "C", t: "Double the evening dose to make up for morning grogginess.", correct: false },
    ],
    sowCite: "1.8(8)(D)",
  },
  {
    id: "abi-e1",
    topicCode: "E",
    stem: "Who decides to change a rehab goal or a medication for a client with ABI?",
    options: [
      { k: "A", t: "Direct-care staff, if they have a good idea.", correct: false },
      { k: "B", t: "The clinical / supervisory team and the person’s providers. Direct-care staff follow the plan, observe, and report.", correct: true },
      { k: "C", t: "Whoever has been on shift the longest.", correct: false },
    ],
    sowCite: "1.8(8)(E)",
  },
  {
    id: "abi-e2",
    topicCode: "E",
    stem: "You notice a new memory problem during a shift. What is the staff role?",
    options: [
      { k: "A", t: "Ignore it — rehab is the therapist’s job only.", correct: false },
      { k: "B", t: "Write down what you saw, tell your supervisor, and keep using the strategies already in the plan.", correct: true },
      { k: "C", t: "Start a new therapy program you found online.", correct: false },
    ],
    sowCite: "1.8(8)(E)",
  },
  {
    id: "abi-f1",
    topicCode: "F",
    stem: "A parent says, “This is not the same person who left for the hospital.” How should staff respond?",
    options: [
      { k: "A", t: "Tell them to get over it — recovery is easy.", correct: false },
      { k: "B", t: "Listen. Families often grieve the change, still love the person, and are partners — do not dismiss them.", correct: true },
      { k: "C", t: "Ask them to stop visiting so staff can work.", correct: false },
    ],
    sowCite: "1.8(8)(F)",
  },
  {
    id: "abi-f2",
    topicCode: "F",
    stem: "A family member wants to share what used to calm the client before the injury. What should you do?",
    options: [
      { k: "A", t: "Ignore them — only professionals have useful information.", correct: false },
      { k: "B", t: "Listen, write it down, and pass it to your supervisor so the team can consider it.", correct: true },
      { k: "C", t: "Promise you will change the plan on the spot without telling anyone.", correct: false },
    ],
    sowCite: "1.8(8)(F)",
  },
];

export function examQuestionsFor(courseId: InHiveCourseId): ExamQuestion[] {
  return courseId === "thirty-day" ? thirtyDayExam : abiExam;
}

export function examTitleFor(courseId: InHiveCourseId): string {
  return courseId === "thirty-day"
    ? "30-day orientation competency exam"
    : "ABI competency exam";
}
