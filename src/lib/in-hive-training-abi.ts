import type { Step, Topic } from "@/components/training/hive-training-engine";

const A_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "The brain is the organ of behavior",
    lead: "An acquired brain injury (ABI) is damage to the brain after birth — from a blow, a stroke, lack of oxygen, infection, a tumor, or other injury. It can change how a person thinks, feels, and acts. Those changes are brain-based, not a moral failing.",
    callout: {
      v: "info",
      t: "Remember",
      b: "Behavior that looks “sudden” or “rude” may be impulsivity, fatigue, or a missed cue — not a choice to disrespect you.",
    },
    facts: [
      { t: "Injury location matters.", b: "Frontal areas often affect planning and impulse control. Other areas affect memory, speech, or movement." },
      { t: "The same person can vary by hour.", b: "Fatigue, noise, pain, and missed sleep make symptoms worse." },
      { t: "Personality is not erased.", b: "The person is still themselves — with new barriers. Use their name." },
    ],
    diagram: "brain-areas",
    dropHeading: "Go further",
    drops: [
      [
        "Common behavior changes",
        "Irritability, crying or laughing that does not match the moment, saying things without a filter, walking away from a task, or seeming unmotivated. Slowed thinking can look like refusal. Ask what the plan says before you label it “noncompliance.”",
      ],
      [
        "What helps",
        "A calm voice, one request at a time, extra time, a quieter space, and rest. Matching their intensity usually makes it worse.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 4",
    stem: "Client Diego swears and walks out of a store after a long outing. Staff say he is being difficult on purpose. What is the better frame?",
    options: [
      { k: "A", t: "Punish the outing so he learns.", correct: false, fb: "Punishment does not repair impulse control. Check fatigue and the plan." },
      { k: "B", t: "Treat it as a possible brain-injury effect — stay calm, keep him safe, and follow his written supports.", correct: true, fb: "Right. Behavior can be a brain effect. Safety and the plan come first." },
      { k: "C", t: "Argue with him in the aisle until he apologizes.", correct: false, fb: "A public argument raises stress and usually makes impulsivity worse." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "Triggers you can actually reduce",
    lead: "You cannot rebuild a brain on a shift. You can reduce the load that makes symptoms explode.",
    facts: [
      { t: "Fatigue is a trigger.", b: "Build rest before the person is exhausted." },
      { t: "Overstimulation is a trigger.", b: "Noise, crowds, and rushed instructions stack up." },
      { t: "Surprises are a trigger.", b: "Preview the next step. Use the same words the plan uses." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "Irritability vs. an emergency",
        "Irritability that you can still redirect is a support moment. Immediate danger to the person or someone else is a safety moment — get help, and call 911 if needed.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 4",
    stem: "A client with ABI is sharp in the morning and melts down after a noisy lunch. What should you try first, if the plan allows it?",
    options: [
      { k: "A", t: "Keep the same pace all day so they “build stamina.”", correct: false, fb: "Pushing through fatigue often causes the behavior you are trying to prevent." },
      { k: "B", t: "Offer rest and a quieter space, and split hard tasks into the morning when they do better.", correct: true, fb: "Right. Work with the brain’s energy, not against it." },
      { k: "C", t: "Take away the next meal as a consequence.", correct: false, fb: "Withholding food is not a support strategy and can be a rights issue." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "What you never do",
    lead: "Shame, sarcasm, and “just try harder” do not repair executive function. They add stress.",
    callout: {
      v: "crit",
      t: "Do this first",
      b: "If you feel yourself getting angry, <b>pause</b>. Get a colleague or your supervisor. Do not take the injury personally.",
    },
    facts: [
      { t: "No humiliation.", b: "Do not mock slurred speech or a forgotten word." },
      { t: "No surprise restraints.", b: "Restraint is never a teaching tool. Follow only trained, authorized last-resort rules." },
      { t: "Document what you saw.", b: "Facts help the team adjust supports. Opinions about “attitude” do not." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 4",
    stem: "A client repeats the same question every few minutes. A coworker says, “He just wants attention.” What do you do?",
    options: [
      { k: "A", t: "Ignore him so he stops.", correct: false, fb: "Memory problems are not the same as attention-seeking. Use the plan’s cue." },
      { k: "B", t: "Answer calmly, use the written memory support (a note, a schedule), and do not shame the repeat.", correct: true, fb: "Exactly. External memory supports beat irritation." },
      { k: "C", t: "Tell him he already asked and walk away mid-sentence.", correct: false, fb: "Abrupt withdrawal can escalate anxiety and behavior." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 4 of 4",
    stem: "You feel insulted by something a client with ABI said. What is the professional move?",
    options: [
      { k: "A", t: "Lecture them about respect until they apologize.", correct: false, fb: "A lecture rarely fixes disinhibition and can escalate the moment." },
      { k: "B", t: "Stay calm, keep everyone safe, follow the plan, and talk with your supervisor later if you need support.", correct: true, fb: "Right. Do not take the injury personally. Get support for yourself after." },
      { k: "C", t: "Give the same insult back so they learn how it feels.", correct: false, fb: "That is not support and it is not safe." },
    ],
  },
];

const B_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Hospital to home is a cliff unless the team is ready",
    lead: "Leaving the hospital or rehab unit is not the end of recovery. It is a change of setting. The person may still have medical appointments, therapy goals, new medications, and a family that is exhausted.",
    callout: {
      v: "info",
      t: "Remember",
      b: "Your job is to follow the <b>discharge and community plan</b>, not to invent a new hospital on the living-room couch.",
    },
    facts: [
      { t: "Read the discharge papers.", b: "Appointments, restrictions, who to call, and warning signs." },
      { t: "Know the names.", b: "Support coordinator, therapists, and the medical contact listed for this person." },
      { t: "The first weeks are fragile.", b: "Sleep, routines, and a quiet environment matter more than a packed calendar." },
    ],
    diagram: "hospital-to-community",
    dropHeading: "Utah-facing resources (examples, not a complete list)",
    drops: [
      [
        "Who typically stays involved",
        "The person’s support coordinator, treating providers, and — when the family wants it — family. Community brain-injury groups such as the Brain Injury Alliance of Utah exist to help people find information and peer support. You do not diagnose. You help the person get to the people named in their plan.",
      ],
      [
        "When to use 911 vs. the clinic",
        "Sudden collapse, trouble breathing, a first or prolonged seizure, or a sudden big change in alertness is 911. Medication questions and “this seems off but they are stable” go to the medical professional the plan names.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "Client Hoa is discharged yesterday. You cannot find the follow-up appointment list. What do you do?",
    options: [
      { k: "A", t: "Skip appointments until someone complains.", correct: false, fb: "Missed follow-up is a safety problem. Find the list." },
      { k: "B", t: "Ask your supervisor where the discharge papers are and get the appointment list before you work alone.", correct: true, fb: "Right. Transition support starts with the actual papers." },
      { k: "C", t: "Book random clinic visits yourself.", correct: false, fb: "Do not invent a medical schedule. Use the discharge plan." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "What “community support” actually looks like",
    lead: "Community support is ordinary life with extra scaffolding: the right ride, the right reminder, the right rest, and the right people on the phone.",
    facts: [
      { t: "Therapy carry-over.", b: "If therapy gave home exercises or communication strategies, use those — do not replace them with a trend you saw online." },
      { t: "One change at a time.", b: "New home, new staff, and a new routine in the same week is a lot of brain load." },
      { t: "Write down who you called.", b: "The next shift should not have to rediscover the same dead end." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "A family member asks for brain-injury community resources in Utah. What is an honest staff response?",
    options: [
      { k: "A", t: "“There is nothing after the hospital.”", correct: false, fb: "There are coordinators and community organizations. Do not close that door." },
      { k: "B", t: "Point them to the support coordinator and known groups such as the Brain Injury Alliance of Utah — and do not invent a clinic.", correct: true, fb: "Right. Direct, do not invent." },
      { k: "C", t: "Tell them to only use the emergency room for every question.", correct: false, fb: "The ER is for emergencies, not every resource question." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "Handoffs that do not drop the person",
    lead: "Transitions fail when information lives in one staff member’s head. Write the facts.",
    callout: {
      v: "crit",
      t: "Call when",
      b: "A new weakness, a sudden severe headache, repeated vomiting, or a big drop in alertness after a recent injury or surgery is <b>urgent medical</b> — not “wait and see until Monday.”",
    },
    facts: [
      { t: "Medications can change at discharge.", b: "Use the current list, not last month’s memory." },
      { t: "Equipment comes with instructions.", b: "Helmets, braces, swallow restrictions — follow them." },
      { t: "The family may know the old baseline.", b: "Listen, then still verify against the current plan." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "Two days after hospital discharge, a client has a sudden severe headache, vomits, and is harder to wake. What do you do?",
    options: [
      { k: "A", t: "Wait until the scheduled clinic visit next week.", correct: false, fb: "This is urgent. Do not wait." },
      { k: "B", t: "Call 911 (or the emergency contact the plan names for this exact situation) and stay with them.", correct: true, fb: "Right. Sudden severe headache plus vomiting plus reduced alertness is emergency territory." },
      { k: "C", t: "Give an extra pain pill from an old bottle.", correct: false, fb: "Never add a dose on your own." },
    ],
  },
];

const C_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Function is a list of tasks, not a label",
    lead: "“Functional impact” means what the person can and cannot do today: walking, talking, remembering, cooking, managing money, handling a crowd. One strong skill does not prove the others.",
    callout: {
      v: "info",
      t: "Remember",
      b: "If they can walk to the car, they may still be unsafe with a stove, a checkbook, or a busy parking lot.",
    },
    facts: [
      { t: "Cognition.", b: "Memory, attention, problem-solving, and speed of thinking." },
      { t: "Physical.", b: "Balance, weakness, vision, fatigue, and seizures for some people." },
      { t: "Communication and emotion.", b: "Finding words, reading faces, and regulating feelings." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "Hidden disability",
        "Some people look “fine” and still cannot sequence a shower or remember a new bus route. Do not withdraw support because they look typical.",
      ],
      [
        "Support the task, do not take the life",
        "Do the unsafe step with them, not instead of them, unless the plan says you must take over that step.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "A client with ABI walks independently but burned a pan last week and cannot keep track of cash. What is the staff takeaway?",
    options: [
      { k: "A", t: "Walking means they need no support in the kitchen or with money.", correct: false, fb: "Function is task-specific." },
      { k: "B", t: "Support the kitchen and money tasks that are hard, even if walking is strong.", correct: true, fb: "Right. Ability in one area does not transfer automatically." },
      { k: "C", t: "Take over every task so they never practice.", correct: false, fb: "The goal is support, not erasure of remaining skills." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "Build the environment around the skill",
    lead: "Good ABI support often looks like furniture and habits: lists on the counter, one instruction, a stool in the shower, a quieter store, a rest after therapy.",
    facts: [
      { t: "One step at a time.", b: "“Get dressed” may need to be “shirt, then pants.”" },
      { t: "Write it down.", b: "A whiteboard beats a spoken list that vanishes." },
      { t: "Protect energy.", b: "The important appointment may need a blank morning first." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "Client Maya gets overwhelmed in a loud grocery store and then cannot finish the list. What is a functional support?",
    options: [
      { k: "A", t: "Stay longer so she “gets used to it” with no other change.", correct: false, fb: "Flooding a sensory system is not a plan." },
      { k: "B", t: "Use a shorter list, a quieter time, and written cues — if her plan allows those supports.", correct: true, fb: "Right. Change the load, not just the willpower." },
      { k: "C", t: "Do all shopping without her from now on.", correct: false, fb: "Removing every outing can isolate her. Adjust the outing." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "Safety without stealing adulthood",
    lead: "Some risks are unacceptable (an unsupervised stove for someone who forgets burners). Some risks are part of a full life (a supported outing). The written plan draws that line — not your comfort.",
    callout: {
      v: "crit",
      t: "Do this first",
      b: "If a task looks newly unsafe, <b>stop the task, keep the person safe, and report it</b>. Do not quietly invent a permanent ban.",
    },
    facts: [
      { t: "Report a new deficit.", b: "The team may need a therapy or plan update." },
      { t: "Do not hide mistakes.", b: "A near-burn is information." },
      { t: "Practice the safe version.", b: "Stay present for the hot step; fade only when the plan says to." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "You notice a client with ABI is newly leaving the stove on. What do you do?",
    options: [
      { k: "A", t: "Say nothing so they do not feel embarrassed.", correct: false, fb: "A fire risk must be reported." },
      { k: "B", t: "Stay with the cooking for now, document what you saw, and tell your supervisor so the plan can be updated.", correct: true, fb: "Exactly. Safety now, team update next." },
      { k: "C", t: "Announce that they are never allowed in the kitchen again, with no team process.", correct: false, fb: "A permanent ban is a rights issue unless it goes through the proper process." },
    ],
  },
];

const D_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Health after ABI is not “set and forget”",
    lead: "People with brain injury can have seizures, headaches, sleep problems, hormone changes, constipation from inactivity, and higher risk from some medications. You are not the prescriber. You are the person who notices and reports.",
    callout: {
      v: "crit",
      t: "Call when",
      b: "A <b>first seizure</b>, a seizure lasting 5 minutes or more, sudden severe headache with vomiting or new weakness, or trouble waking is emergency care — 911 — unless a current written plan gives a different, specific instruction for that exact situation.",
    },
    facts: [
      { t: "Seizures can start after ABI.", b: "Use the same first-aid rules you learned in orientation: time it, side-lying, nothing in the mouth." },
      { t: "Blood thinners and other meds.", b: "Some people are on medications that make bleeding or drowsiness more dangerous. Know what to watch for." },
      { t: "Swallowing can change.", b: "Follow the current diet texture. Aspiration is a quiet killer." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "Do not change medications",
        "No extra dose, no skipped dose, no “she seems sleepy so I’ll hold it” unless a licensed professional tells you to in that moment. Report the sleepiness.",
      ],
      [
        "Pain and behavior",
        "New aggression can be a headache, a UTI, constipation, or a missed dose. Check the obvious physical causes and report. Do not jump to punishment.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 4",
    stem: "A client with ABI is unusually drowsy after a new medication started yesterday. What do you do?",
    options: [
      { k: "A", t: "Skip tonight’s dose so they are more fun on the outing.", correct: false, fb: "Do not change a dose on your own." },
      { k: "B", t: "Give the medication as ordered, keep them safe, and report the drowsiness to the nurse or supervisor.", correct: true, fb: "Right. Observe and report. Do not freelance the pharmacy." },
      { k: "C", t: "Double the morning coffee and say nothing.", correct: false, fb: "Caffeine is not a medication plan, and silence hides a side effect." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "Everyday health that staff actually control",
    lead: "Hydration, meals at the right texture, sleep, movement the plan allows, and getting to appointments — that is the staff-level health work.",
    facts: [
      { t: "Constipation and UTIs.", b: "Both can look like “behavior.” Report changes in bathroom habits and agitation." },
      { t: "Sleep.", b: "A wrecked sleep schedule makes cognition and mood worse." },
      { t: "Skin and falls.", b: "Weakness and impulsivity raise fall risk. Follow the mobility plan." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 4",
    stem: "A client with ABI who is usually pleasant is suddenly agitated and has not urinated much. What is a smart first thought?",
    options: [
      { k: "A", t: "They are choosing to be difficult.", correct: false, fb: "A sudden change plus low urine output can be medical." },
      { k: "B", t: "This could be a medical problem (for example a UTI). Report the change and follow medical guidance.", correct: true, fb: "Right. Look for a physical cause and report it." },
      { k: "C", t: "Take away community time as a consequence.", correct: false, fb: "Punishment does not treat a possible infection." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "Medications: the hard rules",
    lead: "ABI medications may include anti-seizure drugs, blood thinners, antidepressants, or muscle relaxants. Side effects can include bleeding, rash, severe sleepiness, or a new unsteady gait.",
    callout: {
      v: "info",
      t: "Remember",
      b: "If a pill looks different, <b>stop and check</b> before you give it. A new generic can be fine — a wrong bottle is not.",
    },
    facts: [
      { t: "Right person, right drug, right dose, right time.", b: "The same five-rights idea every time." },
      { t: "Know what you are not allowed to do.", b: "If you are not trained and authorized to give a medication, do not give it." },
      { t: "Document what was given and what you saw.", b: "The next person cannot guess." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 4",
    stem: "You cannot tell whether a client already received their noon anti-seizure medication. What do you do?",
    options: [
      { k: "A", t: "Give it anyway — missing a seizure med is worse.", correct: false, fb: "A double dose can also be dangerous. Do not guess." },
      { k: "B", t: "Do not guess. Check the record and call the nurse or supervisor before giving a dose.", correct: true, fb: "Right. Uncertain dose = stop and verify." },
      { k: "C", t: "Give half a pill as a compromise.", correct: false, fb: "Splitting a dose on your own is still changing the order." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 4 of 4",
    stem: "A client on a blood thinner falls and hits their head. They say they are “fine.” What do you do?",
    options: [
      { k: "A", t: "Take their word for it and skip any report.", correct: false, fb: "Head injury plus a blood thinner is not a shrug." },
      { k: "B", t: "Follow the emergency / medical process immediately — head trauma on a blood thinner is high risk even if they feel fine.", correct: true, fb: "Correct. Get medical guidance now." },
      { k: "C", t: "Give two extra blood-thinner pills “to be safe.”", correct: false, fb: "That makes bleeding worse. Never add a dose." },
    ],
  },
];

const E_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Two jobs, one person",
    lead: "Direct-care staff carry out the plan. Supervisors and clinicians set and change the plan. Both roles matter. Crossing the line — changing a therapy goal or a medication because you had an idea — is not support.",
    callout: {
      v: "info",
      t: "Remember",
      b: "If you see something important, <b>your job is to report it clearly</b>. That report is how rehab actually gets better.",
    },
    facts: [
      { t: "Direct-care.", b: "Daily support, safety, documentation, carry-over of strategies already in the plan." },
      { t: "Supervisory / clinical.", b: "Plan changes, team meetings, talking with therapists and doctors." },
      { t: "You are part of rehab.", b: "The 20 minutes after therapy, done the same way, matter as much as the therapy hour." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "What “carry-over” means",
        "If speech therapy taught a communication book, use the book on the shift. If occupational therapy taught a dressing sequence, use that sequence. Inventing a new method every day erases the practice.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "You think a client with ABI would do better if their medication time moved two hours. What do you do?",
    options: [
      { k: "A", t: "Move it yourself and see what happens.", correct: false, fb: "Medication times are a clinical order, not a staff experiment." },
      { k: "B", t: "Keep the ordered time, write down why you think a change might help, and tell your supervisor.", correct: true, fb: "Right. Observe and report. Do not rewrite the order." },
      { k: "C", t: "Ask the client to skip the dose when they have plans.", correct: false, fb: "That is still changing the medication." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "How to talk to the rest of the team",
    lead: "Supervisors and therapists need facts: what happened, when, what you tried, and what the result was. “He had a bad day” is not usable.",
    facts: [
      { t: "Be specific.", b: "“Refused shower” vs. “Stopped after the shirt, said the bathroom was too loud.”" },
      { t: "Do not diagnose.", b: "You can say “new limp.” You cannot say “he had a stroke” unless a clinician said so." },
      { t: "Pass family information up.", b: "Do not sit on a detail a parent told you." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "Therapy asked staff to use a written sequence for making lunch. A coworker says it takes too long. What do you do?",
    options: [
      { k: "A", t: "Drop the sequence so the shift goes faster.", correct: false, fb: "Skipping carry-over undoes the therapy." },
      { k: "B", t: "Keep using the written sequence and tell your supervisor if time is a real problem.", correct: true, fb: "Right. The strategy stays until the team changes it." },
      { k: "C", t: "Make lunch yourself every day so the client never practices.", correct: false, fb: "That removes the rehab, not the time pressure." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "When you must escalate",
    lead: "Some observations cannot wait for the monthly meeting.",
    callout: {
      v: "crit",
      t: "Call when",
      b: "New seizure, suspected stroke signs, a fall with head hit (especially on a blood thinner), or a person who cannot be kept safe in the moment — <b>get help now</b>.",
    },
    facts: [
      { t: "Safety first, then the note.", b: "You can write after the person is safe." },
      { t: "Do not wait to be popular.", b: "Reporting a concern about another staff member’s unsafe shortcut is part of the job." },
      { t: "Ask for supervision.", b: "If a situation is above your training, say so." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "You see a new memory problem this week that is not in the plan. What is your role?",
    options: [
      { k: "A", t: "Ignore it — therapists will notice eventually.", correct: false, fb: "You may be the only person who sees the daily change." },
      { k: "B", t: "Write what you saw, tell your supervisor, and keep using the strategies already in the plan.", correct: true, fb: "Exactly. Report and continue current supports." },
      { k: "C", t: "Start a therapy program you found in a video.", correct: false, fb: "Do not invent clinical treatment." },
    ],
  },
];

const F_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "The family met a different person at the hospital door",
    lead: "Families often describe two timelines: the person before the injury, and the person after. Grief, hope, anger, and love can show up in the same afternoon. That is not “being difficult.” That is what a life-changing injury does to a household.",
    callout: {
      v: "info",
      t: "Remember",
      b: "You did not know the “before.” They did. Listen more than you correct.",
    },
    facts: [
      { t: "They may be exhausted.", b: "Hospital weeks destroy sleep. Patience is a support." },
      { t: "They may disagree with the plan.", b: "Do not argue them down on the porch. Pass it to your supervisor." },
      { t: "They still have a relationship.", b: "Staff do not replace family unless the person and the plan say otherwise." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "Guilt and blame",
        "Some families blame themselves, a driver, or a hospital. You are not the judge. You can say, “I hear you,” and keep the person safe.",
      ],
      [
        "Overprotection vs. risk",
        "A parent may want zero community risk. The person may want more freedom. That tension goes to the team — not a staff lecture.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "A parent says, “This is not the same person who left for the hospital.” How should you respond?",
    options: [
      { k: "A", t: "Tell them to get over it — recovery is easy.", correct: false, fb: "That dismisses real grief." },
      { k: "B", t: "Listen. Families often grieve the change and are still partners in support.", correct: true, fb: "Right. Presence first." },
      { k: "C", t: "Ask them to stop visiting so staff can work.", correct: false, fb: "Cutting family off is not your call and often harms the person." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "How to be a partner, not a wall",
    lead: "Useful staff behavior: invite what they know, write it down, and do not promise a plan change you cannot make.",
    facts: [
      { t: "Ask what used to help.", b: "A song, a joke, a routine — then check it against today’s plan." },
      { t: "Share facts, not gossip.", b: "Follow confidentiality. Family access is not unlimited just because they ask." },
      { t: "Set the next step.", b: "“I will tell my supervisor today” is better than a vague “we’ll see.”" },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "A sister wants details about another client who lives in the same home. What do you do?",
    options: [
      { k: "A", t: "Share a little so she feels included.", correct: false, fb: "Another client’s information is not hers." },
      { k: "B", t: "Do not share the other person’s information. Offer to talk about her sibling within what you are allowed to share.", correct: true, fb: "Right. Confidentiality still applies." },
      { k: "C", t: "Tell her to look through the other person’s records on the table.", correct: false, fb: "Records are not open browsing." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "When family stress lands on staff",
    lead: "You may be the safe person they yell at. That still has limits. You do not have to accept abuse. You do have to stay professional and get your supervisor involved.",
    callout: {
      v: "crit",
      t: "Do this first",
      b: "If a visit becomes unsafe, <b>get the client out of the middle</b>, follow your agency’s visitor policy, and call your supervisor. Call 911 if there is immediate danger.",
    },
    facts: [
      { t: "Document the facts.", b: "Words used, time, who was there — not “they were crazy.”" },
      { t: "Care for yourself after.", b: "A hard family meeting is a reason to debrief, not to take it home in silence." },
      { t: "The client may feel torn.", b: "Do not force them to pick a side in the doorway." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "A family member wants you to change the written plan on the spot. What do you do?",
    options: [
      { k: "A", t: "Change it so the visit stays friendly.", correct: false, fb: "You cannot rewrite the plan in the doorway." },
      { k: "B", t: "Listen, write it down, and tell them you will pass it to your supervisor — the team changes the plan, not a single staff member.", correct: true, fb: "Exactly." },
      { k: "C", t: "Tell them their opinion does not matter.", correct: false, fb: "Their perspective matters. The process still has to be followed." },
    ],
  },
];

export const ABI_TOPICS: Topic[] = [
  {
    code: "A",
    title: "How brain injury can change behavior",
    category: "ABI",
    status: "ready",
    estMin: 10,
    intro:
      "Brain injury can change mood, impulse control, and energy. This topic covers what that looks like on a shift, what helps, and what makes it worse — without treating the person as a diagnosis.",
    steps: A_STEPS,
    attest: "",
  },
  {
    code: "B",
    title: "From hospital to community support",
    category: "ABI",
    status: "ready",
    estMin: 9,
    intro:
      "Leaving the hospital is a hard transition. This covers discharge papers, who stays involved, community resources, and the warning signs that mean you call for medical help.",
    steps: B_STEPS,
    attest: "",
  },
  {
    code: "C",
    title: "What “function” really means day to day",
    category: "ABI",
    status: "ready",
    estMin: 9,
    intro:
      "Walking does not prove someone can cook or manage money. This topic is about task-specific support, energy, and keeping people safe without taking over their life.",
    steps: C_STEPS,
    attest: "",
  },
  {
    code: "D",
    title: "Health and medication after brain injury",
    category: "ABI",
    status: "ready",
    estMin: 10,
    intro:
      "Seizures, headaches, swallowing, and medication side effects need a careful staff response. You observe and report. You do not change doses on your own.",
    steps: D_STEPS,
    attest: "",
  },
  {
    code: "E",
    title: "Your role and your supervisor’s role in rehab",
    category: "ABI",
    status: "ready",
    estMin: 8,
    intro:
      "Direct-care staff carry out the plan. Supervisors and clinicians change the plan. This topic shows how those jobs fit together and when you must escalate.",
    steps: E_STEPS,
    attest: "",
  },
  {
    code: "F",
    title: "The family’s side of a brain injury",
    category: "ABI",
    status: "ready",
    estMin: 8,
    intro:
      "Families often grieve the change and still want to help. This covers how to listen, what you may share, and what to do when a visit gets hard.",
    steps: F_STEPS,
    attest: "",
  },
];
