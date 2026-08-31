import type { Step } from "@/components/training/hive-training-engine";

/** SOW §1.8(4)(O) — teach WHAT you must know before working alone. */
export const O_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 4",
    title: "You cannot work alone on a guess",
    lead: "Every client is a specific person. Before you work alone with them, you must know the facts that keep them safe and honored — not a generic diagnosis summary from the internet, and not “I’ll figure it out on the shift.”",
    callout: {
      v: "crit",
      t: "Do this first",
      b: "If you have not reviewed this person’s records, <b>do not work alone with them yet</b>. Ask your supervisor where those records are and go through them.",
    },
    facts: [
      { t: "The duty is about this person.", b: "Two people with the same diagnosis can need completely different support." },
      { t: "It is required before working alone.", b: "Orientation is not a substitute for person-specific knowledge." },
      { t: "Ask where the file lives.", b: "Your agency stores it — there is no single magic product name. If you cannot find it, ask." },
    ],
    diagram: "eight-know",
    dropHeading: "The eight things you must know",
    drops: [
      [
        "1. Disability and how it affects this person",
        "Not the textbook definition — how <i>this</i> person moves, communicates, understands, and gets through a day. What helps. What overwhelms them.",
      ],
      [
        "2. Goals they are working on",
        "What they want in their life and what the current plan asks staff to support. If you do not know the goals, you cannot support them on purpose.",
      ],
      [
        "3. Medical and safety needs",
        "Allergies, diet texture, seizure plan, mobility, who to call, and what is an emergency for <i>them</i>.",
      ],
      [
        "4. Medications that affect your shift",
        "What is given, when, what you are and are not allowed to do, and what side effects to watch for. Never change a dose on your own.",
      ],
      [
        "5. The current plan and any behavior supports",
        "The written plan, support strategies, and any behavior support plan. Follow what is written — do not invent your own program.",
      ],
      [
        "6. Approved restrictions, if any",
        "If a right is limited, it must be written, approved, and time-limited. If it is not in the record, you do not add a restriction.",
      ],
      [
        "7. Your staff duties for this person",
        "What you document, what you never do, who you call, and what “working alone” is allowed to include.",
      ],
      [
        "8. DNR, POLST, and hospice — if they apply",
        "If those documents exist, you must know they exist and what they tell staff to do in an emergency. If you are unsure, ask before you work alone.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 5",
    stem: "Staff Riley is assigned to client Ava for the first time tonight, alone. Riley has not read Ava’s records. What should Riley do?",
    options: [
      { k: "A", t: "Start the shift anyway — most clients need the same things.", correct: false, fb: "Person-specific knowledge is required before working alone. A guess is not a plan." },
      { k: "B", t: "Review Ava’s records first — disability effects, medical and safety needs, the plan, staff duties, and any DNR/POLST or hospice information.", correct: true, fb: "Right. The eight areas are what you must know about this person, not a generic orientation." },
      { k: "C", t: "Ask a neighbor what Ava is like and skip the file.", correct: false, fb: "Neighbors are not the record. Use the documents your agency keeps for this person." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 4",
    title: "Medical, safety, and the plan",
    lead: "The medical and safety facts are not optional reading. They tell you how to prevent harm and what to do if something starts to go wrong.",
    callout: {
      v: "info",
      t: "Remember",
      b: "If two documents seem to disagree, <b>stop and ask</b>. Do not pick the version that is easier for the shift.",
    },
    facts: [
      { t: "Allergies and diet.", b: "Food, latex, medications — and the exact texture or liquid consistency if one is ordered." },
      { t: "Seizure, choking, and elopement risk.", b: "If any of these apply, know the person’s own plan, not only the general orientation." },
      { t: "Who to call.", b: "Nurse line, guardian, support coordinator, 911 — written for this person." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "The plan is the playbook",
        "The person’s current plan (and any behavior support plan or support strategies) tells you what staff actually do. Read the parts that apply to your shift before you are alone.",
      ],
      [
        "Restrictions have a high bar",
        "A lock, a blocked food, or a limited outing is only allowed if it is written and approved. “It’s easier this way” is never enough.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 5",
    stem: "You cannot find whether client Luis has a seizure action plan, and you are about to be the only staff with him. What do you do?",
    options: [
      { k: "A", t: "Assume he does not have one and start the shift.", correct: false, fb: "If you cannot find a safety plan, ask before you work alone — do not assume." },
      { k: "B", t: "Ask your supervisor where Luis’s records are and review the seizure and safety information before working alone.", correct: true, fb: "Exactly. Not finding it is a stop sign, not permission to guess." },
      { k: "C", t: "Search the internet for “typical seizure plan.”", correct: false, fb: "Generic advice is not this person’s plan." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 5",
    stem: "A coworker says, “Just lock the fridge tonight. She eats too much.” There is no written, approved restriction. What do you do?",
    options: [
      { k: "A", t: "Lock it — the coworker has been here longer.", correct: false, fb: "Staff cannot add a rights restriction on their own." },
      { k: "B", t: "Do not lock it. Follow what is written. If there is a real concern, report it so the team can use the proper process.", correct: true, fb: "Right. Unwritten restrictions are not allowed." },
      { k: "C", t: "Lock it and write a note after the shift.", correct: false, fb: "A note after the fact does not make an unauthorized restriction legal." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 4",
    title: "Your duties, and documents that change an emergency",
    lead: "Person-specific training also means knowing what YOU are responsible for — and whether this person has a DNR, POLST, or hospice plan that changes what staff do in a crisis.",
    callout: {
      v: "crit",
      t: "Call when",
      b: "If you are unsure whether a DNR or POLST applies, <b>ask before you work alone</b>. In a life-threatening emergency you still call 911 unless a current, valid document and your agency’s process say otherwise.",
    },
    facts: [
      { t: "Know your job for this person.", b: "What you document, what you never do, and who you notify." },
      { t: "DNR / POLST / hospice.", b: "If they apply, they must be current and you must know they exist." },
      { t: "Do not invent extra duties.", b: "If it is not in the record or your job description, ask." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "What “working alone” means",
        "Working alone means you are the staff member responsible in that moment. You need enough knowledge to keep the person safe without stopping to read the whole file for the first time.",
      ],
      [
        "Hospice and comfort care",
        "If the person is on hospice, the goals of care may emphasize comfort. That does not mean you ignore distress. It means you follow the written hospice and agency instructions and call the numbers listed.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 4 of 5",
    stem: "You hear that client June “might have a DNR,” but you have not seen the document. You are about to work alone. What is correct?",
    options: [
      { k: "A", t: "Assume there is a DNR and do not call 911 if she collapses.", correct: false, fb: "Never assume a DNR. You need the current document and your agency’s process." },
      { k: "B", t: "Confirm whether a current DNR, POLST, or hospice plan is on file before you work alone — and ask if you cannot find it.", correct: true, fb: "Right. These documents change emergency actions. Confirm them first." },
      { k: "C", t: "Ignore it — those papers are only for nurses.", correct: false, fb: "Direct-care staff must know if they apply, because you may be first on scene." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 4 of 4",
    title: "How to get ready, every time",
    lead: "Person-specific training is not a one-time story. Plans change. Before a first alone shift — and after a big change — go back to the record.",
    facts: [
      { t: "Use a simple checklist.", b: "The eight areas: disability effects, goals, medical/safety, medications, plan/supports, restrictions, your duties, DNR/POLST/hospice." },
      { t: "Write down questions.", b: "If something is missing, that is a question for your supervisor — not a blank you fill with a guess." },
      { t: "After a hospital stay or plan update.", b: "Review again. Yesterday’s knowledge may be outdated." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "What if the record is incomplete?",
        "Say so. “I cannot find her diet texture” is the correct sentence. Working alone without a required safety fact is the problem — not asking the question.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 5 of 5",
    stem: "Client Ava’s plan was updated yesterday after a hospital stay. You supported her last month. What do you do before working alone today?",
    options: [
      { k: "A", t: "Skip the file — you already know her.", correct: false, fb: "Plans change after a hospital stay. Last month’s knowledge may be wrong." },
      { k: "B", t: "Re-read the current record — especially medical/safety, the plan, and any new DNR/POLST or hospice information.", correct: true, fb: "Exactly. Person-specific training is current-file knowledge, not a memory of last month." },
      { k: "C", t: "Ask Ava to teach you her medications from memory and skip the record.", correct: false, fb: "The person may not be able to teach every safety fact. Use the current record." },
    ],
  },
];

/** SOW §1.8(4)(P) — the agency’s own documents, not a fake packet name. */
export const P_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Your agency has written rules. Use those.",
    lead: "Every provider is required to keep written personnel policies, operating procedures, emergency procedures, and related documents. Those papers — not a story you heard at another job — are what you follow here.",
    callout: {
      v: "info",
      t: "Do this first",
      b: "Ask your supervisor <b>where this agency’s policies live</b> and how staff are expected to read them. There is no universal packet name.",
    },
    facts: [
      { t: "Personnel policies.", b: "Job duties, timekeeping, conduct, and who you report to." },
      { t: "Operating procedures.", b: "How this agency handles transportation (if it provides it), grievances, and day-to-day work." },
      { t: "Emergency procedures.", b: "Injury, illness, mental-health decline, death, fire, and missing person — this agency’s version." },
    ],
    diagram: "policy-stack",
    dropHeading: "Go further",
    drops: [
      [
        "Why “we always did it this way” fails",
        "A previous employer’s habit is not this agency’s policy. If you are new, read the documents. If a coworker’s shortcut conflicts with the written policy, the written policy wins.",
      ],
      [
        "Human rights and health-support policies",
        "Your agency should also have a human-rights process and health-support procedures. Those tell you how rights restrictions, medications, and medical follow-up work here.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 4",
    stem: "Staff Jordan used a different incident form at a previous job. What should Jordan use here?",
    options: [
      { k: "A", t: "The old form — it is what they know.", correct: false, fb: "A previous job’s form is not this agency’s process." },
      { k: "B", t: "This agency’s written incident-reporting procedure and the form it names.", correct: true, fb: "Right. Follow this agency’s documents." },
      { k: "C", t: "No form — just a text to a friend.", correct: false, fb: "Incidents go through the agency process, not a private text." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "What those policies are for",
    lead: "Policies exist so staff do the same safe, legal thing on a Tuesday night that they would do on a Monday morning — even when the usual supervisor is not in the room.",
    callout: {
      v: "crit",
      t: "Remember",
      b: "If a policy and a person’s written plan seem to conflict, <b>do not pick a side alone</b>. Ask your supervisor. Do not ignore either document.",
    },
    facts: [
      { t: "Emergencies.", b: "Who you call, in what order, and what you write down." },
      { t: "Grievances.", b: "How a client or staff member raises a complaint without retaliation." },
      { t: "Your conduct.", b: "No gifts-for-favors, no money from a client, no purchases from staff." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "Transportation, if this agency provides it",
        "If you drive clients, the operating policy covers license, insurance, vehicle, and what to do in an accident. If you do not transport, you still need to know that you do not start driving, “just this once,” without being authorized.",
      ],
      [
        "When a policy is silent",
        "Silence is not permission. If the document does not cover the situation, call your supervisor. Write down what you were told.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 4",
    stem: "A client offers you $20 “for being nice.” Agency policy forbids accepting money. What do you do?",
    options: [
      { k: "A", t: "Take it and buy them a snack later.", correct: false, fb: "Accepting money from a client is not allowed." },
      { k: "B", t: "Decline, explain that staff cannot accept money, and follow the agency’s reporting process if needed.", correct: true, fb: "Right. The written policy — not the awkwardness of the moment — decides this." },
      { k: "C", t: "Take it if no one else sees.", correct: false, fb: "A hidden gift is still a policy violation." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 4",
    stem: "You cannot find the emergency procedure for a death in the home, and you are anxious about a hospice client. What is the right step now — before a crisis?",
    options: [
      { k: "A", t: "Wait until something happens, then improvise.", correct: false, fb: "Emergency procedures are read before the emergency." },
      { k: "B", t: "Ask your supervisor for this agency’s emergency procedures and read the sections that apply.", correct: true, fb: "Exactly. Find the document now." },
      { k: "C", t: "Copy a procedure from a different agency’s website.", correct: false, fb: "Another agency’s website is not your employer’s policy." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "How to stay current",
    lead: "Policies get updated. Your job is to know where the current set lives and to re-read when you are told it changed — not to memorize a rumor.",
    facts: [
      { t: "Know the location.", b: "Binder, shared folder, or whatever this agency uses. Ask once, then use it." },
      { t: "Re-read after an update.", b: "When leadership says a policy changed, read the new version." },
      { t: "Ask in writing if needed.", b: "“Where is the current emergency procedure?” is a professional question." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "Policies are not a substitute for 911",
        "A policy tells you the agency process. It does not replace calling 911 in a life-threatening emergency.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 4 of 4",
    stem: "Leadership says the grievance procedure was updated last week. You last read it at hire. What do you do?",
    options: [
      { k: "A", t: "Keep using the old steps — you already signed something once.", correct: false, fb: "An old read does not override a current policy." },
      { k: "B", t: "Read the current grievance procedure your agency just updated.", correct: true, fb: "Right. Current document, not the hire-day memory." },
      { k: "C", t: "Wait until a client complains, then look.", correct: false, fb: "Read it before you need it." },
    ],
  },
];
