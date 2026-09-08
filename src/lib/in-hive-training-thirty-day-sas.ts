/**
 * Extra SAS 30-day essential topics + multi-beat scenarios appended to SOW modules.
 * Invented scenarios. No agency branding. Medical items stay conservative.
 */
import type { Step, Topic } from "@/components/training/hive-training-engine";

const CPR_DISCLAIMER =
  "This orientation is <b>not</b> a Cardiopulmonary Resuscitation (CPR) or First Aid certificate. Your agency purchases that class separately. Follow the written plan and get certified before you perform rescue skills you have not been trained to do.";

export const SCENARIO_STEPS_BY_CODE: Record<string, Step[]> = {
  A: [
    {
      type: "scenario",
      kicker: "Decision chain · 3 beats",
      title: "Evening in the kitchen",
      setup:
        "You are the only staff in the home. Use only the facts in each beat. Do not assume an emergency until the facts support one.",
      beats: [
        {
          fact: "Reese is sitting at the table, speaking in full sentences, and breathing evenly. They say their stomach feels a little off after dinner.",
          options: [
            {
              k: "A",
              t: "Call 911 immediately for any stomach complaint.",
              correct: false,
              fb: "Even breathing and full sentences are not a 911 picture. Stay nearby and use the nurse or on-call line if it continues.",
            },
            {
              k: "B",
              t: "Stay nearby, offer what the plan allows, and contact the nurse or on-call medical line if it continues or worsens.",
              correct: true,
              fb: "Right. This can settle. Document what you see. Escalate if the picture changes.",
            },
            {
              k: "C",
              t: "Give a medication from another person’s bottle because it helps nausea.",
              correct: false,
              fb: "Never share medications. Follow this person’s orders only.",
            },
          ],
        },
        {
          fact: "Twenty minutes later Reese is pale, sweating, and holding the center of their chest. They say the pressure is moving into the left arm.",
          options: [
            {
              k: "A",
              t: "Wait another twenty minutes to see if it passes.",
              correct: false,
              fb: "Chest pressure spreading to an arm is a 911 picture. Do not wait.",
            },
            {
              k: "B",
              t: "Call 911 now, stay with Reese, and note the time the chest pressure started.",
              correct: true,
              fb: "Correct. The facts changed. Call 911, stay, and write the start time.",
            },
            {
              k: "C",
              t: "Drive Reese to the clinic yourself so you do not bother emergency services.",
              correct: false,
              fb: "Do not drive a possible heart emergency yourself. Call 911.",
            },
          ],
        },
        {
          fact: "The 911 dispatcher is on the line. A coworker says to hang up and call the supervisor first.",
          options: [
            {
              k: "A",
              t: "Hang up and call the supervisor for permission.",
              correct: false,
              fb: "Stay on the line. Notify the supervisor after help is coming.",
            },
            {
              k: "B",
              t: "Stay on the line, follow the dispatcher, and keep Reese safe until help arrives.",
              correct: true,
              fb: "Right. The dispatcher is the help in this moment.",
            },
            {
              k: "C",
              t: "Leave Reese alone so you can unlock every door in the building.",
              correct: false,
              fb: "Stay with the person. Send someone else to meet responders if you can.",
            },
          ],
        },
      ],
    },
  ],
  B: [
    {
      type: "scenario",
      kicker: "Decision chain · 3 beats",
      title: "A change from baseline",
      setup: "Sam usually eats well and walks without help. Use only the facts given.",
      beats: [
        {
          fact: "Sam has a temperature of 101°F (38.3°C), is tired, is drinking fluids, and is answering questions.",
          options: [
            { k: "A", t: "Call 911 — any fever is an emergency.", correct: false, fb: "Alert, drinking, and breathing normally is usually a medical-line call, not 911." },
            {
              k: "B",
              t: "Contact the nurse or on-call medical line, follow their guidance, and document the temperature and what you see.",
              correct: true,
              fb: "Right. This is the middle ground: soon, not 911.",
            },
            { k: "C", t: "Wait until tomorrow without telling anyone.", correct: false, fb: "A new fever gets reported the same shift." },
          ],
        },
        {
          fact: "The nurse asks you to give the fever-reducing medication that is already ordered as needed, encourage fluids, and call back if Sam gets worse.",
          options: [
            { k: "A", t: "Give a different person’s fever medication because the bottle is closer.", correct: false, fb: "Only this person’s ordered medication." },
            {
              k: "B",
              t: "Follow the nurse’s instructions exactly, watch Sam, and write down the time and what you did.",
              correct: true,
              fb: "Correct. Follow the clinician. Document.",
            },
            { k: "C", t: "Double the dose so it works faster.", correct: false, fb: "Never change a dose on your own." },
          ],
        },
        {
          fact: "Two hours later Sam is harder to wake, breathing is faster, and they no longer answer simple questions.",
          options: [
            { k: "A", t: "Keep waiting because the nurse already knows about the fever.", correct: false, fb: "The picture changed. This is no longer a wait-and-see fever." },
            {
              k: "B",
              t: "Call 911 now. Harder to wake and faster breathing are emergency facts.",
              correct: true,
              fb: "Right. Escalate when the facts escalate.",
            },
            { k: "C", t: "Give another dose without calling anyone.", correct: false, fb: "Do not stack doses or skip 911 when they are hard to wake." },
          ],
        },
      ],
    },
  ],
  F: [
    {
      type: "scenario",
      kicker: "Decision chain · 3 beats",
      title: "You cannot account for Priya",
      setup: "Priya was in the living room. You return from the kitchen and she is not there.",
      beats: [
        {
          fact: "You do not see Priya in the living room, hallway, or bathroom you just passed. It has been less than one minute since you last saw her.",
          options: [
            { k: "A", t: "Wait thirty minutes. She probably went for a walk.", correct: false, fb: "The clock starts when you notice. Do not wait." },
            {
              k: "B",
              t: "Start looking in likely rooms and the yard now, and notify your supervisor immediately.",
              correct: true,
              fb: "Right. Search and notify at the same time. Follow the agency missing-person procedure.",
            },
            { k: "C", t: "Post her name and photo on social media so neighbors can help.", correct: false, fb: "Do not post protected information. Use the agency and police process." },
          ],
        },
        {
          fact: "A quick search of the home and fenced yard does not find her. Her jacket is gone. It is getting dark.",
          options: [
            { k: "A", t: "Keep searching alone for an hour before telling anyone else.", correct: false, fb: "After the home search, follow the procedure — that usually includes 911 / police." },
            {
              k: "B",
              t: "Call 911 / police as the agency procedure requires, keep searching as directed, and give a description and last-seen facts.",
              correct: true,
              fb: "Correct. Last seen, clothing, and direction of travel matter.",
            },
            { k: "C", t: "Drive around the city without telling dispatch where you are going.", correct: false, fb: "Stay coordinated. Random driving can miss the search plan." },
          ],
        },
        {
          fact: "A neighbor walks Priya back to the porch. Priya is unhurt and quiet.",
          options: [
            { k: "A", t: "Send everyone home and skip the report because she is fine.", correct: false, fb: "Found-safe still needs notification, a check for injury, and an incident report." },
            {
              k: "B",
              t: "Tell 911 / the supervisor she is found, check for injury, stay with her, and document facts only.",
              correct: true,
              fb: "Right. Close the search, then document what you saw — not guesses about why she left.",
            },
            { k: "C", t: "Scold her at the door so she will not do it again.", correct: false, fb: "Shame is not the procedure. Safety, notify, document." },
          ],
        },
      ],
    },
  ],
};

const PG_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Parents and guardians are part of the team — on the written list",
    lead: "A parent or guardian is a person with legal authority, or a family contact the record names. You call the people the file lists — not every relative who asks, and not a neighbor who “usually knows.”",
    callout: {
      v: "info",
      t: "Do this first",
      b: "Before you work alone, know <b>who is on this person’s contact list</b> and when the plan says to call them. If the list is missing, ask your supervisor. Do not invent a contact.",
    },
    facts: [
      { t: "Use the record.", b: "The person-centered support plan, emergency contacts, and guardianship papers (if any) say who to call." },
      { t: "Legal guardian is not always the parent.", b: "Some adults have a guardian. Some do not. Follow what is written." },
      { t: "The person still has a voice.", b: "Unless a written, approved limit says otherwise, the person can ask you to wait or to let them make the call." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "When a call is usually required",
        "Injury, illness, a trip to urgent care or the emergency department, a missing-person event, a rights restriction incident, or any event the agency procedure names. The plan may also ask you to call after a seizure, a medication error, or a hospital discharge.",
      ],
      [
        "When you do not call a family member",
        "Do not share health details with a cousin, coworker’s spouse, or social-media contact who is not listed. That is a confidentiality problem, not courtesy.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "Client Noor has a small scrape that you cleaned and covered. The plan says to notify the guardian the same day for any injury. What do you do?",
    options: [
      { k: "A", t: "Skip the call — it is only a scrape.", correct: false, fb: "The written plan sets the rule, not your sense that it is small." },
      { k: "B", t: "Notify the guardian listed in the record, give facts, and document the call.", correct: true, fb: "Right. Follow the plan’s notification rule." },
      { k: "C", t: "Text a group chat of neighbors so someone tells the family.", correct: false, fb: "Use the listed contact through the agency process." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "What you say — and what you do not guess",
    lead: "When you call, stick to facts: what you saw, what you did, where you are, and what happens next. You are not diagnosing.",
    facts: [
      { t: "Facts only.", b: "“She fell in the kitchen at 4:10. There is a bruise on the left forearm. We called the nurse line.”" },
      { t: "Do not editorialize.", b: "Do not say they were “being difficult” or “did it on purpose.”" },
      { t: "911 still comes first.", b: "In a life-threatening emergency you call 911, then the listed parent or guardian as the procedure says." },
    ],
  },
  {
    type: "scenario",
    kicker: "Decision chain · 3 beats",
    title: "Who gets the update",
    setup: "Micah’s record lists a legal guardian and a sibling who is not a contact.",
    beats: [
      {
        fact: "Micah asked you to tell “my sister” about a dentist appointment. The sister is not on the contact list.",
        options: [
          { k: "A", t: "Call the sister — family is family.", correct: false, fb: "If they are not listed, you do not share. Ask your supervisor how to handle the request." },
          {
            k: "B",
            t: "Do not call the sister. Follow the listed contacts and ask your supervisor how to handle Micah’s request.",
            correct: true,
            fb: "Correct. Listing exists for a reason.",
          },
          { k: "C", t: "Post the appointment time on a family Facebook group.", correct: false, fb: "Never post protected information." },
        ],
      },
      {
        fact: "The nurse line sends Micah to urgent care for a possible sprain. The guardian is listed for medical updates.",
        options: [
          { k: "A", t: "Wait until you have a diagnosis next week.", correct: false, fb: "The guardian needs the facts now: where you are going and why." },
          {
            k: "B",
            t: "Call the listed guardian with facts — what you saw, where you are going, and who is with Micah.",
            correct: true,
            fb: "Right. Facts, not a diagnosis.",
          },
          { k: "C", t: "Let urgent care figure out who to call.", correct: false, fb: "You still make the agency-required notification." },
        ],
      },
      {
        fact: "Micah is alert, the ankle is wrapped, and they want to go home. The guardian asks you to change the pain medication dose tonight.",
        options: [
          { k: "A", t: "Change the dose because the guardian asked.", correct: false, fb: "Guardians do not rewrite medication orders on a phone call. Follow the written order and the nurse." },
          {
            k: "B",
            t: "Do not change the dose. Follow the written order and tell the guardian you will pass the request to the nurse or supervisor.",
            correct: true,
            fb: "Correct. Notification is not a new prescription.",
          },
          { k: "C", t: "Give leftover medication from a previous injury.", correct: false, fb: "Only current orders." },
        ],
      },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "After hours and disagreements",
    lead: "If you cannot reach the listed contact, follow the agency after-hours chain. If a parent or guardian disagrees with a staff action, stay factual, do not argue, and loop in your supervisor.",
    facts: [
      { t: "Leave a clear message if allowed.", b: "Name, callback number, and that this is about their family member’s care — then document the attempt." },
      { t: "Do not bargain.", b: "You cannot promise a policy exception to end an angry call." },
      { t: "Document attempts.", b: "Time called, who answered, and what you said." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "You cannot reach the listed guardian after two tries, and the nurse has already given guidance. What next?",
    options: [
      { k: "A", t: "Give up — you tried.", correct: false, fb: "Use the after-hours chain in the agency procedure." },
      { k: "B", t: "Follow the agency after-hours chain, keep trying as that procedure says, and document each attempt.", correct: true, fb: "Right." },
      { k: "C", t: "Call a coworker’s personal friend who “knows the family.”", correct: false, fb: "Not a listed contact." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "A parent who is not the legal guardian asks why their adult child was at the clinic. The parent is not on the contact list.",
    options: [
      { k: "A", t: "Give a short medical summary because they are a parent.", correct: false, fb: "Parent is not automatically a contact for an adult. Follow the list." },
      { k: "B", t: "Do not share details. Direct them to the listed guardian or your supervisor.", correct: true, fb: "Correct. Confidentiality holds." },
      { k: "C", t: "Confirm the clinic visit but skip the diagnosis.", correct: false, fb: "Confirming the visit is still health information." },
    ],
  },
];

const PO_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Poison Control is a medical resource — not a wait-and-see line",
    lead: "The national Poison Control number in the United States is 1-800-222-1222. It is staffed by specialists who tell you what to do after a possible poisoning or overdose. This orientation does not replace emergency care.",
    callout: {
      v: "crit",
      t: "Call 911 first when",
      b: "the person is not breathing, is unconscious, is seizing, has severe trouble breathing, or collapsed after a known ingestion. Then call Poison Control as directed. Do not wait on hold instead of 911.",
    },
    facts: [
      { t: "Save the number.", b: "1-800-222-1222 — know where it lives in the home and in the person’s plan." },
      { t: "Bring the container.", b: "Name, strength, and how much is missing help the specialist." },
      { t: "Do not guess a home remedy.", b: "Do not make them vomit, drink oil, or “sleep it off” unless a specialist or 911 tells you to." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "What counts as a possible poisoning",
        "Swallowed cleaner, the wrong medication or extra pills, a plant or berry, a button battery, a chemical on the skin or in the eyes, or an unknown substance. Pica (eating non-food items) raises this risk for some people.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "You find an open bottle of all-purpose cleaner on the floor. Client Devon is awake, talking, and says they “tasted it.” What is the best first medical call if they are breathing normally?",
    options: [
      { k: "A", t: "Make them vomit, then wait.", correct: false, fb: "Do not induce vomiting unless a specialist tells you to." },
      { k: "B", t: "Call Poison Control (1-800-222-1222) with the product name and what you saw, unless 911 signs appear.", correct: true, fb: "Right — if they are awake and breathing, Poison Control is the specialist line." },
      { k: "C", t: "Give milk and go back to the shift.", correct: false, fb: "Do not treat with food or drink unless directed." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "Wrong medication is a poison event until a clinician says otherwise",
    lead: "An extra pill, someone else’s pill, or a chewable vitamin a child-sized dose was not meant for — these are Poison Control or nurse-line events. Do not “watch overnight” without guidance.",
    facts: [
      { t: "Count what is missing.", b: "Compare the bottle to what should be there." },
      { t: "Do not hide it.", b: "Medication errors are incidents. Report them." },
      { t: "This is not a full medication-pass certificate.", b: CPR_DISCLAIMER },
    ],
  },
  {
    type: "scenario",
    kicker: "Decision chain · 3 beats",
    title: "Pills on the counter",
    setup: "You work in a staffed home. A weekly pill organizer is open on the kitchen counter.",
    beats: [
      {
        fact: "Client Alex is awake and sitting up. Two tablets from another person’s organizer are missing. Alex says they “might have taken them.” Breathing is normal.",
        options: [
          { k: "A", t: "Wait until bedtime to see if they get sleepy.", correct: false, fb: "Unknown extra medication is a same-shift specialist call." },
          {
            k: "B",
            t: "Call Poison Control or the nurse line with the medication names and how many may be missing. Do not induce vomiting.",
            correct: true,
            fb: "Correct. Stay with Alex and follow the specialist.",
          },
          { k: "C", t: "Give activated charcoal from a first-aid kit without calling.", correct: false, fb: "Do not give treatments unless directed." },
        ],
      },
      {
        fact: "While you are on the phone, Alex’s words slur and they slump in the chair. You cannot keep them sitting upright.",
        options: [
          { k: "A", t: "Finish the Poison Control hold music before doing anything else.", correct: false, fb: "Unresponsive or slumping is 911 now." },
          {
            k: "B",
            t: "Call 911 now, keep the airway safe as you are trained, and tell Poison Control that emergency services are coming.",
            correct: true,
            fb: "Right. The facts changed to an emergency.",
          },
          { k: "C", t: "Walk them outside for fresh air and skip 911.", correct: false, fb: "Do not walk a slumping person outside." },
        ],
      },
      {
        fact: "Emergency responders are on the way. A coworker wants to throw away the organizer so “it looks cleaner.”",
        options: [
          { k: "A", t: "Throw it away — less clutter helps.", correct: false, fb: "The organizer is evidence of what may have been taken." },
          {
            k: "B",
            t: "Keep the organizer and bottles for responders. Document facts. Do not clean away the scene.",
            correct: true,
            fb: "Correct.",
          },
          { k: "C", t: "Refill the organizer so the count looks right.", correct: false, fb: "Never alter the count after an error." },
        ],
      },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "Chemicals, eyes, and skin",
    lead: "If a chemical is in the eyes or on the skin, follow the product label and Poison Control. Often that means rinsing with water for a long time — but call and confirm. Get the person away from fumes.",
    facts: [
      { t: "Move to fresh air.", b: "If fumes are strong, leave the room and take the person with you if you can do it safely." },
      { t: "Rinse if directed.", b: "Do not use another chemical to “neutralize” it." },
      { t: "Report it.", b: "This is an incident even if they “seem fine.”" },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "A cleaner splashes into a client’s eye. They are yelling and holding their face. What do you do?",
    options: [
      { k: "A", t: "Put leftover antibiotic ointment in the eye.", correct: false, fb: "Do not put ointment in an eye after a chemical splash unless a clinician says so." },
      { k: "B", t: "Start rinsing with clean water if you can do it safely, call Poison Control or 911 based on how they look, and do not use another chemical.", correct: true, fb: "Right. Rinse, call, do not neutralize." },
      { k: "C", t: "Wait to see if it stops burning.", correct: false, fb: "Chemical in an eye is time-sensitive." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "Poison Control tells you to watch for sleepiness and to call 911 if the person cannot be woken. Two hours later they will not wake to voice or a gentle shoulder touch. What do you do?",
    options: [
      { k: "A", t: "Let them sleep — Poison Control already knows.", correct: false, fb: "They gave you a 911 trigger. Use it." },
      { k: "B", t: "Call 911 now and stay with them.", correct: true, fb: "Correct." },
      { k: "C", t: "Give caffeine to wake them.", correct: false, fb: "Do not add stimulants." },
    ],
  },
];

const EV_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Get out, stay out, call for help",
    lead: "Fire, smoke, a gas smell, or a disaster warning is not a time to finish the dishes. Your job is to get people out along the planned route, account for everyone, and call 911 for fire or a life-threatening scene.",
    callout: {
      v: "crit",
      t: "Do not go back in",
      b: "Once you are out, you do not re-enter a burning or smoke-filled building for belongings, pets, or “one more check” unless a firefighter tells you to.",
    },
    facts: [
      { t: "Know two ways out.", b: "Every home should have a primary exit and a backup. Walk them before you work alone." },
      { t: "Close doors behind you if you can.", b: "A closed door can slow smoke. Do not lock people in." },
      { t: "Meeting place.", b: "The plan names a spot — a tree, a mailbox, a neighbor’s porch. Count heads there." },
    ],
    dropHeading: "Go further",
    drops: [
      [
        "Wheelchairs, oxygen, and extra time",
        "If someone needs help to evacuate, that help is part of the plan — not an improvisation during smoke. If you have not practiced their exit, ask your supervisor before you are the only staff.",
      ],
      [
        "This is not a fire-marshal certificate",
        "Agencies also run drills and keep extinguisher training. This module is orientation: get people out, call 911, follow the written emergency procedure.",
      ],
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "You smell smoke and see haze in the hallway. Clients are in their bedrooms. What is the first priority?",
    options: [
      { k: "A", t: "Find the source and throw water on it yourself.", correct: false, fb: "Do not hunt the fire. Get people out and call 911." },
      { k: "B", t: "Alert everyone, help them out along the planned route, go to the meeting place, and call 911.", correct: true, fb: "Right. Out, account, call." },
      { k: "C", t: "Open all windows to “air it out” and stay inside.", correct: false, fb: "Opening windows can feed a fire. Get out." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "Alarms, extinguishers, and when not to fight a fire",
    lead: "A fire extinguisher is for a small, contained fire if you are trained, you have a clear exit behind you, and people are already moving out. If you have any doubt, get out and let the fire department fight it.",
    facts: [
      { t: "Smoke alarm sounding.", b: "Treat it as real. Get people out. Do not silence it and go back to sleep." },
      { t: "Carbon monoxide alarm.", b: "Get everyone into fresh air and call 911. Do not look for the source in a closed garage." },
      { t: "Gas smell.", b: "No switches, no phones inside if the procedure says so — leave and call from a safe place." },
    ],
  },
  {
    type: "scenario",
    kicker: "Decision chain · 3 beats",
    title: "Toast, then smoke",
    setup: "It is early evening. Two clients are in the living room. You are in the kitchen.",
    beats: [
      {
        fact: "The toaster is smoking. There are no flames. The room is still clear enough to see the back door.",
        options: [
          { k: "A", t: "Unplug the toaster if you can do it without reaching over flames, get people away from the smoke, and decide whether this is still a 911 / evacuate event.", correct: true, fb: "A smoking appliance can still become a fire. Get people back, cut power if safe, and do not stand there inhaling smoke." },
          { k: "B", t: "Pour water into the toaster while it is still plugged in.", correct: false, fb: "Water and live electricity are a shock hazard." },
          { k: "C", t: "Ignore it — toast always smokes.", correct: false, fb: "Visible smoke gets action." },
        ],
      },
      {
        fact: "Flames are now coming from the toaster and the cabinet above. Smoke is dropping toward head height.",
        options: [
          { k: "A", t: "Stay to finish the extinguisher so you do not look like you panicked.", correct: false, fb: "Cabinet fire with dropping smoke is get-out time." },
          {
            k: "B",
            t: "Get everyone out to the meeting place and call 911. Do not go back for phones or wallets.",
            correct: true,
            fb: "Correct.",
          },
          { k: "C", t: "Send a client back in for the pet bird.", correct: false, fb: "Do not send anyone back in. Tell firefighters about the pet." },
        ],
      },
      {
        fact: "You are at the mailbox meeting place. One client is missing from the count. Smoke is pouring from the front door.",
        options: [
          { k: "A", t: "Run back inside to search bedrooms.", correct: false, fb: "Tell 911 they are missing. Do not re-enter." },
          {
            k: "B",
            t: "Tell 911 immediately that one person is unaccounted for, describe them, and stay out. Do not re-enter.",
            correct: true,
            fb: "Right. Firefighters search. You stay out.",
          },
          { k: "C", t: "Drive away to the office so you can write the report.", correct: false, fb: "Stay at the meeting place until responders have the count." },
        ],
      },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "Weather, earthquake, and agency disaster plans",
    lead: "Your agency has a written emergency procedure for fire, missing person, and disasters. Orientation means you know where that document is and that you follow it instead of a previous employer’s habit.",
    facts: [
      { t: "Severe weather.", b: "Move away from windows if the plan says so. Take medications, the contact list, and the go-bag if you have time and it is safe." },
      { t: "Earthquake.", b: "Drop, cover, and hold on if you can. After shaking stops, get people out if the building is unsafe." },
      { t: "Accountability.", b: "The same rule as fire: know who you support and where they are." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "A carbon monoxide alarm is sounding. Everyone is awake and walking. What do you do?",
    options: [
      { k: "A", t: "Open the oven to “air out the house” and stay inside.", correct: false, fb: "Get into fresh air and call 911." },
      { k: "B", t: "Get everyone outside or to fresh air and call 911.", correct: true, fb: "Right." },
      { k: "C", t: "Remove the alarm battery so it stops.", correct: false, fb: "Never silence a carbon monoxide alarm and stay put." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "You have never walked the backup exit with this client, and you are about to be the only staff overnight. What should you do before that shift?",
    options: [
      { k: "A", t: "Assume you will figure it out if something happens.", correct: false, fb: "Evacuation is practiced before the emergency." },
      { k: "B", t: "Ask your supervisor to review this home’s emergency procedure and this person’s exit needs before you work alone.", correct: true, fb: "Correct." },
      { k: "C", t: "Plan to carry them even though you have not been shown a safe method.", correct: false, fb: "Do not invent a carry. Use the written plan." },
    ],
  },
];

const MD_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Orientation only — not a medication-pass certificate",
    lead: "You must know this person’s allergies, diet texture, and how medications affect the shift. You do not invent doses. Many agencies require a separate medication-administration certificate before you pass medications.",
    callout: {
      v: "crit",
      t: "Disclaimer",
      b: CPR_DISCLAIMER + " The same rule applies to medication administration: follow agency credentialing.",
    },
    facts: [
      { t: "Allergies.", b: "Food, latex, medications, bee stings — and what the plan says to do, including when to use a prescribed epinephrine auto-injector if you are trained and the plan allows." },
      { t: "Diet texture.", b: "Pureed, minced, thickened liquids — serve only what is ordered. A sandwich is not “close enough.”" },
      { t: "Never share meds.", b: "One person’s prescription is not a household supply." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "The kitchen sent a regular sandwich. The record says Client Nora is prescribed pureed food. What do you do?",
    options: [
      { k: "A", t: "Serve it — she will probably be fine.", correct: false, fb: "Wrong texture is a choking risk." },
      { k: "B", t: "Do not serve it. Get the prescribed texture before she eats.", correct: true, fb: "Right." },
      { k: "C", t: "Cut it into small cubes and call that puree.", correct: false, fb: "Cubes are not puree. Follow the order." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "The five rights — even when you are only observing",
    lead: "If you are allowed to assist with medications, the five rights are: right person, right medication, right dose, right route, right time. If any one is unclear, stop and ask. If you are not credentialed to pass medications, you still watch for side effects and report them.",
    facts: [
      { t: "Right person.", b: "Use the identifier the agency requires — not “I know everyone.”" },
      { t: "As needed (PRN).", b: "As-needed medication still needs a reason that matches the order. Write the reason." },
      { t: "Refused or dropped.", b: "Do not hide a refusal. Document and tell the nurse or supervisor." },
    ],
  },
  {
    type: "scenario",
    kicker: "Decision chain · 3 beats",
    title: "Dinner and a new rash",
    setup: "You are supporting Client Luis at dinner. His record lists a peanut allergy and a puree diet.",
    beats: [
      {
        fact: "A new staff member set a jar of peanut sauce on the table “for flavor.” Luis has not tasted it yet.",
        options: [
          { k: "A", t: "Leave it — he can decide.", correct: false, fb: "A known peanut allergy means the sauce does not stay on the table." },
          {
            k: "B",
            t: "Remove the peanut sauce, serve only what the diet and allergy list allow, and remind the team.",
            correct: true,
            fb: "Correct. Prevention first.",
          },
          { k: "C", t: "Let him have a taste to “test” the allergy.", correct: false, fb: "Never test an allergy on purpose." },
        ],
      },
      {
        fact: "Luis’s lips look swollen and he says his throat feels tight. He is still talking.",
        options: [
          { k: "A", t: "Wait ten minutes to see if it fades.", correct: false, fb: "Throat tightness after a possible allergen is emergency territory." },
          {
            k: "B",
            t: "Follow his allergy / anaphylaxis plan (including prescribed epinephrine if you are trained and the plan says so) and call 911.",
            correct: true,
            fb: "Right. Plan plus 911. This is not a wait.",
          },
          { k: "C", t: "Give someone else’s leftover antihistamine from a purse.", correct: false, fb: "Only this person’s ordered medications." },
        ],
      },
      {
        fact: "911 is coming. Luis’s plan includes an epinephrine auto-injector you have been shown how to use. A coworker says not to use it because you are not a nurse.",
        options: [
          { k: "A", t: "Never use the auto-injector — only nurses may.", correct: false, fb: "If the written plan and your training say you may, you follow the plan while 911 is coming." },
          {
            k: "B",
            t: "If you are trained and the current plan directs staff to use it, use it as trained and tell 911 what you gave and when.",
            correct: true,
            fb: "Correct. Training plus the written plan. Then document.",
          },
          { k: "C", t: "Give two extra injectors “to be sure.”", correct: false, fb: "Follow the plan’s dose. Do not stack extras on your own." },
        ],
      },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "Side effects you report the same shift",
    lead: "New rash, unusual sleepiness, vomiting after a dose, unsteady walking, or a refusal of food and fluid after a medication change — write it down and call the nurse or on-call line. Do not hold a dose as punishment.",
    facts: [
      { t: "Look-alike, sound-alike.", b: "If two bottles look similar, stop and check with a second person or the nurse." },
      { t: "Controlled counts.", b: "If the agency counts controlled medications, you do not “fix” a count by replacing pills." },
      { t: "Ask for the credential.", b: "If you have not been signed off to pass medications here, say so and do not pass them." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "You are not signed off to administer medications at this agency. The regular med-pass staff called out. What do you do?",
    options: [
      { k: "A", t: "Pass the morning pills anyway so the clients are not late.", correct: false, fb: "No credential, no pass." },
      { k: "B", t: "Tell your supervisor immediately that you are not credentialed and do not pass medications.", correct: true, fb: "Right." },
      { k: "C", t: "Have a client hand the pills to the others while you watch.", correct: false, fb: "That is still an unauthorized pass." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "A client’s prescribed liquid is “nectar-thick.” The kitchen sent thin juice. What do you do?",
    options: [
      { k: "A", t: "Serve the thin juice — they are thirsty.", correct: false, fb: "Thin liquid can be a choking / aspiration risk when thick is ordered." },
      { k: "B", t: "Do not serve thin liquid. Get the prescribed thickness or the nurse’s direction first.", correct: true, fb: "Correct." },
      { k: "C", t: "Add random powder from an unlabeled can.", correct: false, fb: "Only the thickener and amount the order names." },
    ],
  },
];

const PB_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Utah Administrative Code Rule R539 — what you must never do",
    lead: "Positive behavior supports come first. Utah Administrative Code Rule R539 sets limits on behavior methods in Division of Services for People with Disabilities services. You do not invent punishments. You do not use prohibited techniques because a shift is hard.",
    callout: {
      v: "crit",
      t: "Prohibited examples (orientation)",
      b: "Corporal punishment; aversive shocks; withholding food, sleep, or bathroom access as punishment; degrading language; unauthorized restraint; seclusion that is not in an approved plan; and any hold you have not been certified to use. If it is not in the written, approved plan, you do not add it.",
    },
    facts: [
      { t: "Rights are not privileges.", b: "You cannot take away community access or the phone because it is easier." },
      { t: "Certification is separate.", b: "Mandt, SOAR, Crisis Prevention Institute, or similar programs are separate classes. This module does not certify you to restrain anyone." },
      { t: "Report prohibited methods.", b: "If you see them, you report — same as other harm." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "A coworker says to lock the snack cabinet tonight because the client “ate too much at lunch.” There is no approved restriction.",
    options: [
      { k: "A", t: "Lock it — staff convenience is enough.", correct: false, fb: "An unwritten food lock is a prohibited / unauthorized restriction." },
      { k: "B", t: "Do not lock it. Follow what is written. Report a real nutrition concern through the proper process.", correct: true, fb: "Right." },
      { k: "C", t: "Lock it and write a note tomorrow.", correct: false, fb: "A later note does not make it legal." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "Restraint is not a mood — it is a last-resort, trained act",
    lead: "Physical intervention, if it exists at all for this person, lives in a certified program and a written plan. Orientation means: you do not grab, pin, or “escort hard” because you are frustrated.",
    facts: [
      { t: "Walk away from the power struggle when you can.", b: "Space, quiet, and the written support strategy come first." },
      { t: "Imminent harm is different.", b: "If someone is about to run into traffic, you still use the least force needed to keep them safe and you report it." },
      { t: "After any hold.", b: "Medical check, incident report, supervisor — even if “nothing happened.”" },
    ],
  },
  {
    type: "scenario",
    kicker: "Decision chain · 3 beats",
    title: "The television argument",
    setup: "Client Theo wants the volume louder. House guidelines say evenings stay quieter for a roommate.",
    beats: [
      {
        fact: "Theo is pacing and raising his voice about the television volume. No one is being hit. The roommate is in another room.",
        options: [
          { k: "A", t: "Use a hold to make him sit down.", correct: false, fb: "Voice and pacing are not a reason to restrain." },
          {
            k: "B",
            t: "Follow the behavior support plan — offer space, a quiet activity or headphones if the plan allows, and stay calm.",
            correct: true,
            fb: "Right. Positive supports first.",
          },
          { k: "C", t: "Take away dinner as a consequence.", correct: false, fb: "Withholding food as punishment is prohibited." },
        ],
      },
      {
        fact: "Theo knocks a plastic cup off the table. It does not hit anyone. He then sits on the couch and goes quiet.",
        options: [
          { k: "A", t: "Pin his arms to “teach a lesson.”", correct: false, fb: "The moment of risk passed. A hold now is punishment, not safety." },
          {
            k: "B",
            t: "Give space, keep the environment safe, and document what you saw without adding a punishment.",
            correct: true,
            fb: "Correct. The situation settled. Do not escalate.",
          },
          { k: "C", t: "Refuse his morning outing tomorrow as payback.", correct: false, fb: "Unapproved restriction of community access is not a staff consequence." },
        ],
      },
      {
        fact: "A coworker later says, “Next time just spray him with water. It works at my other job.”",
        options: [
          { k: "A", t: "Try it once to see.", correct: false, fb: "Aversive sprays are prohibited. Another job’s habit is not the rule here." },
          {
            k: "B",
            t: "Do not use it. Tell the coworker it is not allowed, and report the suggestion if your procedure requires it.",
            correct: true,
            fb: "Right.",
          },
          { k: "C", t: "Use it only when supervisors are gone.", correct: false, fb: "Hidden aversives are still prohibited." },
        ],
      },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "If you see a prohibited method",
    lead: "You are a mandatory reporter for abuse. A prohibited behavior method can be abuse or neglect. You do not need proof beyond a reasonable suspicion. You do not investigate on your own.",
    facts: [
      { t: "Protect the person.", b: "Get them safe. Then report." },
      { t: "Agency process plus Adult Protective Services.", b: "Suspicion of abuse, neglect, or exploitation goes to the required outside report — not only a hallway chat." },
      { t: "No retaliation.", b: "Good-faith reporting is protected. You still document facts." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "You see a staff member withhold a client’s lunch because the client swore. What must you do?",
    options: [
      { k: "A", t: "Laugh it off — swearing should have a consequence.", correct: false, fb: "Withholding food as punishment is prohibited and may be neglect." },
      { k: "B", t: "Get the person food, and report through the required channels including Adult Protective Services if the procedure says so.", correct: true, fb: "Correct." },
      { k: "C", t: "Wait for a second incident so you have a pattern.", correct: false, fb: "One incident is enough to report." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "You have not completed a certified crisis-intervention course. A client is sitting on the floor crying. What is true?",
    options: [
      { k: "A", t: "You may use any hold you saw in a video.", correct: false, fb: "Videos do not certify you." },
      { k: "B", t: "You use the written support strategies, keep people safe, and do not apply a restraint technique you are not certified to use.", correct: true, fb: "Right." },
      { k: "C", t: "Crying always requires a physical escort out of the room.", correct: false, fb: "Crying is not a restraint criterion." },
    ],
  },
];

const CB_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Burnout is a safety issue — not a loyalty test",
    lead: "Caregiver burnout is exhaustion that does not get better with one night of sleep. It can show up as numbness, irritability, dread of the shift, or cutting corners. People you support get hurt when staff are running on empty.",
    facts: [
      { t: "It is common.", b: "Direct-support work is demanding. Naming it is professional, not weak." },
      { t: "It is not solved by “trying harder.”", b: "Sleep, time off, supervision, and using your leave are part of the job." },
      { t: "Substance use on shift is never the fix.", b: "If you cannot work safely, you say so and you do not come in impaired." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "You notice you have started snapping at clients and skipping documentation because you are exhausted. What is the responsible move?",
    options: [
      { k: "A", t: "Push through and tell no one — it is just part of the job.", correct: false, fb: "Hiding it raises risk. Talk to your supervisor." },
      { k: "B", t: "Tell your supervisor you are not safe to keep this pace, and use the supports the agency offers.", correct: true, fb: "Right." },
      { k: "C", t: "Take it out on the person who needs the most support.", correct: false, fb: "The person is not the problem." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "What you can do on a hard week",
    lead: "You cannot fix staffing by yourself. You can take breaks you are given, ask for a huddle, swap a task when the plan allows, and use employee assistance or your own clinician if you have one.",
    facts: [
      { t: "Breaks are not theft.", b: "If the schedule includes a break, take it when coverage allows." },
      { t: "Secondary trauma.", b: "Hearing about harm or seeing a crisis can stay with you. That is a reason to debrief, not to tough it out alone." },
      { t: "Coworkers.", b: "Check on each other without gossiping about clients." },
    ],
  },
  {
    type: "scenario",
    kicker: "Decision chain · 3 beats",
    title: "The extra shift",
    setup: "You already worked a long stretch. The on-call supervisor asks you to stay another eight hours.",
    beats: [
      {
        fact: "You are so tired you already misread a medication time once this morning and caught it before giving it. The supervisor wants you to stay over.",
        options: [
          { k: "A", t: "Stay anyway and hope you do not make another error.", correct: false, fb: "You already had a near miss. Fatigue is a safety fact." },
          {
            k: "B",
            t: "Say you are not safe to stay over after the near miss, and ask them to find other coverage.",
            correct: true,
            fb: "Correct. Naming the near miss is responsible.",
          },
          { k: "C", t: "Stay and skip documenting so you can rest on the clock.", correct: false, fb: "Skipping documentation is not rest. It is a second risk." },
        ],
      },
      {
        fact: "A coworker says, “If you leave, you do not care about the clients.”",
        options: [
          { k: "A", t: "Accept that and stay out of guilt.", correct: false, fb: "Guilt is not a staffing plan." },
          {
            k: "B",
            t: "Do not accept the guilt frame. Safe staffing is the agency’s duty. You still hand off clearly if you leave.",
            correct: true,
            fb: "Right.",
          },
          { k: "C", t: "Walk out without a handoff.", correct: false, fb: "You still give a factual handoff if you cannot stay." },
        ],
      },
      {
        fact: "You get home and cannot stop replaying a difficult incident. You are not a danger to yourself. Sleep is not coming.",
        options: [
          { k: "A", t: "Drink until you pass out so you can work tomorrow.", correct: false, fb: "That is not a wellness plan and it can make work unsafe." },
          {
            k: "B",
            t: "Use employee assistance, your own clinician, or a trusted supervisor debrief — and do not work impaired.",
            correct: true,
            fb: "Correct. Get support. Stay safe for the next shift.",
          },
          { k: "C", t: "Call a client’s family to talk it through.", correct: false, fb: "Do not process staff stress with a family using the person’s details." },
        ],
      },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "When burnout becomes harm",
    lead: "If exhaustion turns into yelling, rough handling, skipped care, or coming to work impaired, that is no longer only a wellness issue — it can be abuse or neglect. Get help before it gets there. If you see it in someone else, you report.",
    facts: [
      { t: "Mandatory reporting still applies.", b: "A burned-out coworker is not an excuse to stay silent about harm." },
      { t: "You can ask for a caseload or schedule conversation.", b: "That is a professional request." },
      { t: "988 is for you too.", b: "If you are in a mental-health crisis, you can call 988. If you are in immediate danger, call 911." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "A coworker is coming to shift smelling of alcohol. What do you do?",
    options: [
      { k: "A", t: "Cover for them — they had a hard week.", correct: false, fb: "Impaired staff are a safety emergency for the people you support." },
      { k: "B", t: "Do not let them work with clients. Notify the supervisor immediately through the agency process.", correct: true, fb: "Right." },
      { k: "C", t: "Give them extra coffee and hope it passes.", correct: false, fb: "Coffee does not make impaired care safe." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "You feel numb and dread every shift, but you have not harmed anyone. What is true?",
    options: [
      { k: "A", t: "You should ignore it until you make a mistake.", correct: false, fb: "Ask for help before a mistake." },
      { k: "B", t: "Talk to your supervisor or a clinician now. Burnout is easier to treat before it becomes an incident.", correct: true, fb: "Correct." },
      { k: "C", t: "Take a client’s anti-anxiety medication “just once.”", correct: false, fb: "Never take a client’s medication." },
    ],
  },
];

const DC_STEPS: Step[] = [
  {
    type: "lesson",
    kicker: "Lesson 1 of 3",
    title: "Department of Health and Human Services conduct — you represent the work",
    lead: "Utah Department of Health and Human Services (DHHS) contractors and their staff follow a code of conduct: honesty, no exploitation, no conflicts you hide, and respect for the people who use services. Your agency also has a critical-incident policy. Orientation means you know both exist and where to read them.",
    callout: {
      v: "info",
      t: "Separate signature",
      b: "Many agencies also assign a <b>DHHS Code of Conduct — Signed</b> obligation. This module does not replace that signature. It teaches what the rules are for.",
    },
    facts: [
      { t: "No gifts-for-favors.", b: "Do not accept money, expensive gifts, or side jobs from a person you support." },
      { t: "No dual relationships you hide.", b: "Dating a client, hiring them for your side business, or becoming their landlord is a conflict. Ask before it happens." },
      { t: "Honesty in billing and notes.", b: "You do not document a service you did not provide. That is fraud." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 1 of 3",
    stem: "A client’s parent offers you $100 cash “to take extra shifts off the books.” What do you do?",
    options: [
      { k: "A", t: "Take it — extra help is good.", correct: false, fb: "Off-book pay is a conduct and fraud problem." },
      { k: "B", t: "Decline, explain that staff cannot take side payment, and report the offer through the agency process.", correct: true, fb: "Right." },
      { k: "C", t: "Take it if you split it with your supervisor.", correct: false, fb: "Splitting it does not make it allowed." },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 2 of 3",
    title: "Critical incidents — know the agency policy before you need it",
    lead: "A critical incident is an event the state or the agency treats as high-priority: death, missing person, alleged abuse, a serious injury, a police response, a medication error with harm, or other events the policy lists. You report on the timeline the policy names — often the same day, sometimes within hours.",
    facts: [
      { t: "Read the list.", b: "Ask where the current critical-incident policy lives. Do not rely on a previous job’s list." },
      { t: "Facts, time, notifications.", b: "Who you called, when, and what you saw." },
      { t: "Do not investigate.", b: "You preserve information. Investigators and Adult Protective Services handle the rest." },
    ],
  },
  {
    type: "scenario",
    kicker: "Decision chain · 3 beats",
    title: "After a fall",
    setup: "Client June slipped in the bathroom. She is sitting up and talking. There is a cut on her forehead.",
    beats: [
      {
        fact: "June is alert. The cut has stopped bleeding with pressure. She says she hit her head on the sink.",
        options: [
          { k: "A", t: "Clean it, skip every call, and hope no one asks.", correct: false, fb: "A head injury after a fall is at least a medical-line and incident event — often critical." },
          {
            k: "B",
            t: "Give first aid you are trained to give, contact the nurse or on-call line, notify the listed guardian if the plan says so, and start the incident report.",
            correct: true,
            fb: "Correct. Do not hide a head injury.",
          },
          { k: "C", t: "Drive her to your house to rest so the agency does not find out.", correct: false, fb: "That is concealment, not care." },
        ],
      },
      {
        fact: "The nurse sends her to the emergency department for a head-injury check. A coworker says, “Do not write that she hit her head — it looks bad.”",
        options: [
          { k: "A", t: "Leave the head injury out of the report.", correct: false, fb: "Omitting a material fact is a conduct and documentation failure." },
          {
            k: "B",
            t: "Write the facts — she hit her head on the sink, what you saw, who you called. Do not soften it.",
            correct: true,
            fb: "Right. Honest notes.",
          },
          { k: "C", t: "Write that a stranger caused it so the home is not blamed.", correct: false, fb: "Do not invent a cause." },
        ],
      },
      {
        fact: "June returns the same night with a normal scan. The critical-incident policy still lists “unwitnessed head injury with emergency department visit.”",
        options: [
          { k: "A", t: "Skip the critical-incident notice because the scan was normal.", correct: false, fb: "The policy names the event type, not the happy ending." },
          {
            k: "B",
            t: "Complete the critical-incident steps the policy requires, even though the scan was normal.",
            correct: true,
            fb: "Correct.",
          },
          { k: "C", t: "Wait 30 days to see if she has symptoms.", correct: false, fb: "Critical-incident clocks are short." },
        ],
      },
    ],
  },
  {
    type: "lesson",
    kicker: "Lesson 3 of 3",
    title: "Social media, photos, and “just being helpful”",
    lead: "Posting a photo of a person you support, even a kind story, can break confidentiality and the code of conduct. Fundraising posts that name a client are not yours to make. If you are unsure, do not post.",
    facts: [
      { t: "No photos without the agency process.", b: "Consent forms, if they exist, are specific. Your personal account is not the process." },
      { t: "No diagnosing in public.", b: "Do not explain a client’s disability in a review, a group chat, or a story." },
      { t: "Report conduct you see.", b: "A coworker posting a client photo is a report, not a private warning only." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 2 of 3",
    stem: "You want to post a smiling photo from a community outing on your personal account to “show the good work.” There is no photo-release process completed for this. What do you do?",
    options: [
      { k: "A", t: "Post it with a first name only.", correct: false, fb: "A face is still identifying." },
      { k: "B", t: "Do not post it. Follow the agency media / consent process or do not share.", correct: true, fb: "Right." },
      { k: "C", t: "Post it in a “private” story — that is not really public.", correct: false, fb: "Stories spread. Do not post." },
    ],
  },
  {
    type: "check",
    kicker: "Knowledge check 3 of 3",
    stem: "A critical incident happened at 2:00 p.m. The policy says notify the designated manager the same calendar day. It is 8:00 p.m. and you have not called. What is correct?",
    options: [
      { k: "A", t: "Wait until the next staff meeting next week.", correct: false, fb: "Same calendar day means tonight." },
      { k: "B", t: "Notify the designated manager now and document the time.", correct: true, fb: "Correct. Late is still now — then write why it was late." },
      { k: "C", t: "Only tell a friend at another agency.", correct: false, fb: "That is not the policy path and it can break confidentiality." },
    ],
  },
];

export const THIRTY_DAY_SAS_TOPICS: Topic[] = [
  {
    code: "PG",
    title: "When to call a parent or guardian",
    category: "Emergencies & health",
    status: "ready",
    estMin: 10,
    intro: "Parents and guardians get factual updates when the written plan and agency procedure say so. This covers who is on the list, what you say, and when 911 still comes first.",
    steps: PG_STEPS,
    attest: "I attest that I have completed this training, understand when and how to notify a listed parent or guardian, and that I will not share information with people who are not on the record.",
  },
  {
    code: "PO",
    title: "When to call poison control",
    category: "Emergencies & health",
    status: "ready",
    estMin: 10,
    intro: "Poison Control (1-800-222-1222) is the specialist line for ingestions and chemical exposures when the person is not in a 911 emergency. This is orientation — follow the specialist and your agency procedure.",
    steps: PO_STEPS,
    attest: "I attest that I have completed this training, understand when to call Poison Control versus 911, and that I will not use home remedies unless a specialist directs them.",
  },
  {
    code: "EV",
    title: "Emergency evacuation, fire, and disaster",
    category: "Emergencies & health",
    status: "ready",
    estMin: 11,
    intro: "Get people out, account for them, call 911, and do not go back in. This covers fire, carbon monoxide, and how to find this agency’s disaster procedure before you work alone.",
    steps: EV_STEPS,
    attest: "I attest that I have completed this training, understand evacuation priorities, and that I will review this home’s emergency procedure before working alone.",
  },
  {
    code: "MD",
    title: "Medications, allergies, and dietary orientation",
    category: "Emergencies & health",
    status: "ready",
    estMin: 11,
    intro: "Allergies, diet texture, and medication safety on the shift. This is not a medication-pass or Cardiopulmonary Resuscitation (CPR) certificate — those are separate.",
    steps: MD_STEPS,
    attest: "I attest that I have completed this orientation, understand I must follow written allergy, diet, and medication orders, and that I will not pass medications unless this agency has credentialed me.",
  },
  {
    code: "PB",
    title: "Prohibited behavior methods (Rule R539)",
    category: "Behavior & care",
    status: "ready",
    estMin: 11,
    intro: "Utah Administrative Code Rule R539 limits what staff may do. Positive supports first. No unauthorized restraint, aversives, or punishment that takes away food, sleep, or rights.",
    steps: PB_STEPS,
    attest: "I attest that I have completed this training, understand prohibited behavior methods, and that I will report them. This module does not certify me to use restraint.",
  },
  {
    code: "CB",
    title: "Caregiver burnout and staff wellness",
    category: "Rights & reporting",
    status: "ready",
    estMin: 9,
    intro: "Burnout is a safety issue. This covers early signs, how to ask for help, and when fatigue or impairment becomes a reportable risk to the people you support.",
    steps: CB_STEPS,
    attest: "I attest that I have completed this training, understand caregiver burnout as a safety issue, and that I will not work impaired.",
  },
  {
    code: "DC",
    title: "DHHS Code of Conduct and critical incidents",
    category: "Foundations & compliance",
    status: "ready",
    estMin: 10,
    intro: "Utah Department of Health and Human Services conduct rules and this agency’s critical-incident policy: honesty, no hidden conflicts, fast reporting, no social-media photos of people you support.",
    steps: DC_STEPS,
    attest: "I attest that I have completed this training, understand Department of Health and Human Services conduct expectations and critical-incident reporting, and that I will read this agency’s current policy.",
  },
];
