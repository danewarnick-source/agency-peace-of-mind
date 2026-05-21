
-- Ensure unique slug-ish identity for our seeded courses via title within global scope
DO $$
DECLARE
  v_program_id UUID;
  v_course_def JSONB;
  v_module_def JSONB;
  v_lesson_def JSONB;
  v_course_id UUID;
  v_module_id UUID;
  v_course_idx INT := 0;
  v_module_idx INT;
  v_lesson_idx INT;
  v_courses JSONB := '[
    {
      "title":"Emergency Response","category":"Health & Safety","duration":40,
      "description":"Recognize emergencies, call for help, and respond safely while protecting the people you support.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"Introduction & Learning Objectives","duration":5,
           "content":"## What you''ll learn\n- Recognize medical, environmental, and behavioral emergencies\n- Activate the chain of response (call, secure, document)\n- Apply scene safety and universal precautions\n- Communicate clearly with EMS and supervisors"},
          {"type":"text","title":"The Emergency Response Framework","duration":10,
           "content":"### Stay calm. Stay safe. Stay with the person.\n\n**Step 1 — Scene safety.** Survey for hazards before approaching.\n**Step 2 — Assess the person.** Check responsiveness, breathing, bleeding.\n**Step 3 — Call for help.** Dial 911 for life-threatening events; notify supervisor for all incidents.\n**Step 4 — Provide care within your scope.** First aid, CPR, AED — only if trained and currently certified.\n**Step 5 — Document.** Begin an incident report immediately after the scene is stable."},
          {"type":"callout","title":"Compliance Callout","duration":2,
           "data":{"variant":"warning","body":"Never leave the person alone during an active emergency unless your own safety is at risk. If you must leave, take the shortest path to summon help and return immediately."}},
          {"type":"knowledge_check","title":"Knowledge Check: Recognizing Emergencies","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"Which of these is a life-threatening emergency requiring 911?","choices":["Mild headache","Sudden chest pain with difficulty breathing","A small paper cut","Tiredness after lunch"],"correct":1,"explanation":"Chest pain with respiratory distress signals a possible cardiac event — call 911 immediately."},
             {"q":"True or false: You should always check scene safety before approaching a person in distress.","choices":["True","False"],"correct":0,"explanation":"Scene safety prevents you from becoming a second victim."},
             {"q":"After stabilizing an emergency, what comes next?","choices":["Go home","Document the incident","Post about it online","Wait until next shift"],"correct":1,"explanation":"Timely documentation is a regulatory requirement."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Sudden Fall","duration":5,
           "data":{"prompt":"A person you support trips and falls. They are conscious but holding their hip and crying. What do you do first?","choices":[
             {"label":"Help them stand up immediately","correct":false,"feedback":"Moving someone with a possible fracture can worsen the injury."},
             {"label":"Keep them still, assess for injury, call for help","correct":true,"feedback":"Correct — stabilize, assess, summon help, document."},
             {"label":"Ignore it and continue your task","correct":false,"feedback":"Unattended injuries violate duty of care."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I understand my responsibilities for recognizing, responding to, and documenting emergencies during my shift."}},
          {"type":"quiz","title":"Final Quiz: Emergency Response","duration":10,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"The FIRST priority in any emergency is:","choices":["Scene safety","Take photos","Call family","Finish your task"],"correct":0,"explanation":"Always check scene safety first."},
             {"q":"You may provide CPR only if you are:","choices":["Feeling confident","Currently certified","An adult","A supervisor"],"correct":1,"explanation":"Current certification is required to perform CPR."},
             {"q":"Which event ALWAYS requires 911?","choices":["A minor scrape","Unconsciousness lasting more than a few seconds","Slight cough","Hunger"],"correct":1,"explanation":"Loss of consciousness is a medical emergency."},
             {"q":"After the emergency, you must:","choices":["Wait a week to report","Document immediately","Skip the report if minor","Tell only coworkers"],"correct":1,"explanation":"All incidents must be documented per agency policy."},
             {"q":"True or false: It is acceptable to leave the person alone to find your phone in another building.","choices":["True","False"],"correct":1,"explanation":"Stay with the person; call for help in the safest way possible."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Incident Reporting","category":"Documentation","duration":35,
      "description":"Document what happened, when, where, and to whom — accurately, objectively, and within required timeframes.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"Why Incident Reporting Matters","duration":5,
           "content":"Incident reports protect the person you support, your team, and your agency. They satisfy DSPD reporting requirements and create a record that drives prevention."},
          {"type":"text","title":"What Must Be Reported","duration":8,
           "content":"### Reportable events include:\n- Injury (to anyone)\n- Medication errors\n- Property damage\n- Behavioral incidents requiring intervention\n- Allegations of abuse, neglect, or exploitation\n- Elopement or missing person\n- Hospitalization or 911 call\n\n### Report in your own words:\n- **Objective** facts only\n- **Time-stamped** entries\n- **Names and roles** of those involved\n- **Actions taken**"},
          {"type":"callout","title":"DSPD Reportable Incident","duration":2,
           "data":{"variant":"info","body":"Most reportable incidents must be entered into the state incident system within 24 hours; allegations of abuse require immediate reporting to APS and your supervisor."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"Which is NOT an objective statement?","choices":["She had a 1-inch cut on her left elbow","He seemed angry and mean","Blood pressure 138/86 at 14:05","Door was locked at 22:00"],"correct":1,"explanation":"\"Angry and mean\" is interpretation; describe the behavior instead."},
             {"q":"Most DSPD reportable incidents must be filed within:","choices":["1 hour","24 hours","1 week","30 days"],"correct":1,"explanation":"24-hour rule applies to most reportable events."},
             {"q":"True or false: It is acceptable to omit details if they make a coworker look bad.","choices":["True","False"],"correct":1,"explanation":"Falsifying or omitting facts is a serious compliance violation."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Medication Error","duration":5,
           "data":{"prompt":"You realize you gave a morning medication two hours late. The person seems fine. What do you do?","choices":[
             {"label":"Say nothing — no harm done","correct":false,"feedback":"All med errors must be reported, even without harm."},
             {"label":"Document the error, notify nurse and supervisor, complete an incident report","correct":true,"feedback":"Correct response."},
             {"label":"Re-administer the dose now to catch up","correct":false,"feedback":"Never re-dose without nurse direction."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will report incidents accurately, objectively, and within required timeframes."}},
          {"type":"quiz","title":"Final Quiz: Incident Reporting","duration":8,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"Incident reports should be written in:","choices":["Opinion","Objective fact","Pencil","Only if asked"],"correct":1,"explanation":"Stick to observable facts."},
             {"q":"True or false: Near-misses should also be reported.","choices":["True","False"],"correct":0,"explanation":"Near-misses help prevent future incidents."},
             {"q":"An allegation of abuse must be reported:","choices":["Within 30 days","Immediately","Never","Only if proven"],"correct":1,"explanation":"Immediate reporting is mandatory."},
             {"q":"Reports should include:","choices":["Times, names, observed facts, actions taken","Personal opinions","Rumors","Future predictions"],"correct":0,"explanation":"Objective, factual content."},
             {"q":"Falsifying a report can result in:","choices":["A bonus","Termination and license action","A vacation","Nothing"],"correct":1,"explanation":"Falsification is grounds for termination and regulatory action."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Seizure Awareness","category":"Health & Safety","duration":30,
      "description":"Identify seizure types, provide safe support during a seizure, and know when to call 911.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"What Is a Seizure?","duration":5,
           "content":"A seizure is a sudden surge of electrical activity in the brain. Seizures vary: some involve convulsions, others brief staring spells or confusion."},
          {"type":"text","title":"Safe Support During a Seizure","duration":8,
           "content":"### Do\n- Stay calm and time the seizure\n- Ease the person to the floor\n- Turn them on their side\n- Cushion the head\n- Clear nearby hazards\n- Stay until fully alert\n\n### Don''t\n- Put anything in the mouth\n- Restrain the person\n- Offer food or water until fully alert"},
          {"type":"callout","title":"Call 911 If…","duration":2,
           "data":{"variant":"warning","body":"Seizure lasts more than 5 minutes; another seizure follows quickly; person doesn''t wake up; injury occurs; first-time seizure; difficulty breathing; seizure in water."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"You should put something between the person''s teeth to prevent biting the tongue.","choices":["True","False"],"correct":1,"explanation":"Never put anything in the mouth — risk of injury and choking."},
             {"q":"After a tonic-clonic seizure, place the person:","choices":["Standing up","On their back","On their side","Upside down"],"correct":2,"explanation":"Recovery position protects the airway."},
             {"q":"Call 911 if a seizure lasts longer than:","choices":["30 seconds","1 minute","5 minutes","30 minutes"],"correct":2,"explanation":"5-minute rule for status epilepticus risk."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Sudden Seizure at Lunch","duration":5,
           "data":{"prompt":"During lunch, the person you support drops to the floor and begins convulsing. What do you do FIRST?","choices":[
             {"label":"Hold them down to stop the shaking","correct":false,"feedback":"Never restrain — risk of injury."},
             {"label":"Time the seizure, clear hazards, protect the head, turn on side","correct":true,"feedback":"Correct sequence."},
             {"label":"Put a spoon in their mouth","correct":false,"feedback":"Nothing in the mouth — ever."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will respond to seizures using safe positioning, timing, and the 5-minute 911 rule."}},
          {"type":"quiz","title":"Final Quiz: Seizure Awareness","duration":8,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"Best position during/after a tonic-clonic seizure:","choices":["Side","Back","Stomach","Standing"],"correct":0,"explanation":"Side / recovery position."},
             {"q":"True or false: Restrain the person to stop convulsions.","choices":["True","False"],"correct":1,"explanation":"Never restrain."},
             {"q":"Call 911 if the seizure lasts more than:","choices":["1 min","2 min","5 min","10 min"],"correct":2,"explanation":"5-minute rule."},
             {"q":"After the seizure, the person may feel:","choices":["Energized","Confused or tired","Hungry only","Nothing"],"correct":1,"explanation":"Postictal confusion is common."},
             {"q":"All seizures must be:","choices":["Ignored","Documented","Posted online","Recorded on phone"],"correct":1,"explanation":"Document every seizure event."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Choking Prevention","category":"Health & Safety","duration":25,
      "description":"Prevent and respond to choking events, including diet textures and the Heimlich maneuver.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"Choking Risk Factors","duration":5,
           "content":"People with dysphagia, dental issues, neurological conditions, or who eat too fast are at elevated risk. Always follow the person''s **diet order** and **mealtime support plan**."},
          {"type":"text","title":"Prevention Strategies","duration":6,
           "content":"- Verify diet texture (regular, mechanical soft, puree)\n- Verify liquid consistency (thin, nectar, honey)\n- Person sits upright 90°\n- Small bites, slow pace, no talking with mouth full\n- Remain present during the entire meal"},
          {"type":"callout","title":"Compliance Callout","duration":2,
           "data":{"variant":"warning","body":"Serving the wrong diet texture is a reportable incident. Always check the current diet order before each meal."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"Universal sign of choking:","choices":["Smiling","Hands at the throat","Sleeping","Waving"],"correct":1,"explanation":"Hands at the throat is the universal sign."},
             {"q":"If the person can cough forcefully, you should:","choices":["Encourage them to cough","Slap their back hard","Pour water in","Start Heimlich immediately"],"correct":0,"explanation":"A strong cough is the body''s best defense."},
             {"q":"True or false: You can change diet textures at your discretion.","choices":["True","False"],"correct":1,"explanation":"Only the clinician can change diet orders."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Silent Choking","duration":5,
           "data":{"prompt":"At dinner the person suddenly cannot speak, makes no sound, and grasps their throat. What do you do?","choices":[
             {"label":"Wait to see if they cough","correct":false,"feedback":"No sound = no air. Act now."},
             {"label":"Call for help and begin abdominal thrusts (if trained)","correct":true,"feedback":"Correct."},
             {"label":"Offer water","correct":false,"feedback":"Never offer water during a choking event."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will follow diet orders, supervise meals, and respond promptly to choking events."}},
          {"type":"quiz","title":"Final Quiz: Choking Prevention","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"During meals, the person should be positioned:","choices":["Lying down","Reclining","Upright 90°","Standing"],"correct":2,"explanation":"Upright reduces aspiration risk."},
             {"q":"True or false: Honey-thick liquids are thinner than nectar-thick.","choices":["True","False"],"correct":1,"explanation":"Honey is thicker than nectar."},
             {"q":"If the person can speak/cough strongly, you should:","choices":["Begin Heimlich","Encourage coughing","Lay them down","Give water"],"correct":1,"explanation":"Strong cough = effective airway."},
             {"q":"Wrong diet texture is a:","choices":["Suggestion","Reportable incident","Minor issue","Personal choice"],"correct":1,"explanation":"Always reportable."},
             {"q":"True or false: You should leave the person alone during meals to give privacy.","choices":["True","False"],"correct":1,"explanation":"Supervision is required for at-risk individuals."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Positive Behavior Supports","category":"Behavioral","duration":40,
      "description":"Use proactive, person-centered strategies to support meaningful behavior change without coercion.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"What Is PBS?","duration":6,
           "content":"Positive Behavior Supports (PBS) is an evidence-based approach that focuses on **why** behavior happens and uses prevention, teaching, and reinforcement to support a better quality of life."},
          {"type":"text","title":"Functions of Behavior","duration":8,
           "content":"Behavior usually serves one of four functions:\n1. **Escape** (avoid a task, place, or person)\n2. **Attention** (social interaction)\n3. **Tangible** (access to a preferred item/activity)\n4. **Sensory** (internal regulation)\n\nUnderstanding the function guides the support strategy."},
          {"type":"callout","title":"Best Practice","duration":2,
           "data":{"variant":"success","body":"Always pair prevention strategies with teaching new skills — replacement behaviors that meet the same function."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"PBS focuses primarily on:","choices":["Punishment","Understanding function and teaching skills","Restraint","Ignoring behavior"],"correct":1,"explanation":"Function-based, skill-building approach."},
             {"q":"True or false: All behavior communicates something.","choices":["True","False"],"correct":0,"explanation":"Behavior is communication."},
             {"q":"Which is NOT one of the 4 functions of behavior?","choices":["Escape","Attention","Tangible","Revenge"],"correct":3,"explanation":"Revenge is not a recognized function."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Refusing the Bus","duration":5,
           "data":{"prompt":"Every morning a person refuses to board the bus to their day program by sitting on the floor. What is the BEST first step?","choices":[
             {"label":"Physically lift them onto the bus","correct":false,"feedback":"Coercion is not appropriate."},
             {"label":"Investigate the function (escape? sensory? social?) and adjust supports","correct":true,"feedback":"PBS starts with understanding why."},
             {"label":"Threaten loss of privileges","correct":false,"feedback":"Punishment-based approaches are not PBS."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will use proactive, person-centered, function-based supports and never rely on punishment or coercion."}},
          {"type":"quiz","title":"Final Quiz: Positive Behavior Supports","duration":10,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"PBS is best described as:","choices":["Punishment-based","Function-based, proactive, person-centered","Random","Restrictive"],"correct":1,"explanation":"Core definition of PBS."},
             {"q":"The 4 functions of behavior include all EXCEPT:","choices":["Sensory","Escape","Tangible","Tradition"],"correct":3,"explanation":"Not a recognized function."},
             {"q":"True or false: A behavior support plan must be individualized.","choices":["True","False"],"correct":0,"explanation":"Always individualized."},
             {"q":"Replacement behavior should meet the same:","choices":["Function","Cost","Color","Time"],"correct":0,"explanation":"Same function, safer/effective form."},
             {"q":"Restraint should be:","choices":["First choice","Last resort, only when trained and authorized","Routine","Never used in any case"],"correct":1,"explanation":"Last resort under strict guidelines."}
           ]}}
        ]}
      ]
    },
    {
      "title":"HIPAA & Confidentiality","category":"Compliance","duration":35,
      "description":"Protect Protected Health Information (PHI) and follow HIPAA rules in everyday work.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"What Is PHI?","duration":5,
           "content":"Protected Health Information (PHI) includes any individually identifiable health information: name, address, DOB, diagnoses, medications, services received, and more."},
          {"type":"text","title":"Minimum Necessary & Need-to-Know","duration":8,
           "content":"Share only the **minimum necessary** information with those who **need to know** to provide care. Never discuss the people you support in public spaces, social media, or with family or friends."},
          {"type":"callout","title":"Common HIPAA Violations","duration":3,
           "data":{"variant":"warning","body":"Texting PHI to personal phones, sharing photos on social media, leaving records visible, or discussing cases in elevators are all reportable HIPAA breaches."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"Which is PHI?","choices":["A person''s diagnosis","Generic weather data","Public sports score","Stock price"],"correct":0,"explanation":"Health information about an individual is PHI."},
             {"q":"True or false: You may post a picture of the person you support to your private social media.","choices":["True","False"],"correct":1,"explanation":"Posting any identifying info or images is a HIPAA breach."},
             {"q":"Minimum necessary means:","choices":["Share everything","Share only what is needed for the task","Share nothing ever","Share to your manager only"],"correct":1,"explanation":"Need-to-know basis."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Family Calls","duration":5,
           "data":{"prompt":"A relative who is NOT on the authorized contact list calls asking about a person''s medication. What do you do?","choices":[
             {"label":"Share the details — they are family","correct":false,"feedback":"Family relationship doesn''t override HIPAA."},
             {"label":"Politely decline; refer to the supervisor and verify authorization","correct":true,"feedback":"Correct."},
             {"label":"Give general info only","correct":false,"feedback":"Even general PHI requires authorization."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will protect PHI, follow minimum-necessary rules, and report any suspected breach immediately."}},
          {"type":"quiz","title":"Final Quiz: HIPAA","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"PHI includes:","choices":["Name + diagnosis","Stock prices","Weather","Sports scores"],"correct":0,"explanation":"Identifying + health info = PHI."},
             {"q":"True or false: It''s fine to text PHI to your supervisor on a personal phone.","choices":["True","False"],"correct":1,"explanation":"Only approved/secure channels."},
             {"q":"Minimum necessary means:","choices":["All info","Only what''s needed","Nothing","Everyone gets all"],"correct":1,"explanation":"Need-to-know rule."},
             {"q":"Suspected breach must be:","choices":["Hidden","Reported immediately","Discussed publicly","Ignored"],"correct":1,"explanation":"Immediate reporting required."},
             {"q":"Penalties for HIPAA violations can include:","choices":["Fines, termination, criminal charges","Praise","Promotion","Nothing"],"correct":0,"explanation":"Penalties are serious."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Abuse, Neglect & Exploitation Prevention","category":"Compliance","duration":40,
      "description":"Recognize, prevent, and report abuse, neglect, and exploitation in all forms.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"Definitions","duration":8,
           "content":"### Abuse\nPhysical, sexual, verbal, emotional, or financial harm.\n### Neglect\nFailure to provide necessary care, food, hygiene, medical, or supervision.\n### Exploitation\nUsing a person, their resources, or property for personal benefit."},
          {"type":"text","title":"Signs to Watch For","duration":6,
           "content":"- Unexplained bruises, burns, or weight loss\n- Sudden behavior changes\n- Fearfulness around a specific person\n- Missing money or possessions\n- Unkempt appearance or dirty living conditions\n- Avoidance of certain places or people"},
          {"type":"callout","title":"Mandatory Reporter","duration":3,
           "data":{"variant":"warning","body":"You are a mandatory reporter. Report suspected abuse, neglect, or exploitation to APS and your supervisor IMMEDIATELY — do not investigate it yourself."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"True or false: You must have proof before reporting suspected abuse.","choices":["True","False"],"correct":1,"explanation":"Reasonable suspicion is enough — APS investigates."},
             {"q":"Borrowing money from the person you support is:","choices":["Allowed","Exploitation","Recommended","Required"],"correct":1,"explanation":"Financial exploitation, always prohibited."},
             {"q":"Failing to provide food or hygiene is:","choices":["Abuse","Neglect","Exploitation","Custom"],"correct":1,"explanation":"Neglect."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Unexplained Bruise","duration":5,
           "data":{"prompt":"You notice a large bruise on the upper arm of the person you support. They become quiet when you ask. What do you do?","choices":[
             {"label":"Ignore it","correct":false,"feedback":"Mandatory reporters must act on reasonable suspicion."},
             {"label":"Document objectively and report to APS and supervisor immediately","correct":true,"feedback":"Correct response."},
             {"label":"Confront a coworker you suspect","correct":false,"feedback":"Do not investigate yourself."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"As a mandatory reporter, I will report all suspected abuse, neglect, or exploitation immediately and follow agency protocols."}},
          {"type":"quiz","title":"Final Quiz: ANE Prevention","duration":8,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"Mandatory reporting requires:","choices":["Proof","Reasonable suspicion","Court order","Family approval"],"correct":1,"explanation":"Suspicion triggers reporting."},
             {"q":"Sexual contact between staff and person served is:","choices":["Allowed if consenting","Always prohibited","Sometimes OK","A gray area"],"correct":1,"explanation":"Always prohibited."},
             {"q":"True or false: Verbal threats are a form of abuse.","choices":["True","False"],"correct":0,"explanation":"Verbal/emotional abuse counts."},
             {"q":"Using a person''s funds for yourself is:","choices":["Abuse","Neglect","Exploitation","Wellness"],"correct":2,"explanation":"Financial exploitation."},
             {"q":"Reports of ANE should be:","choices":["Investigated by you","Immediately reported to APS/supervisor","Delayed a week","Posted online"],"correct":1,"explanation":"Immediate report to authorities."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Crisis De-Escalation","category":"Behavioral","duration":35,
      "description":"Use verbal de-escalation, non-threatening posture, and environmental adjustments to prevent crisis escalation.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"The Crisis Cycle","duration":6,
           "content":"Most crises move through phases: trigger → escalation → peak → de-escalation → recovery. Early intervention in the trigger and escalation phases prevents the peak."},
          {"type":"text","title":"De-Escalation Techniques","duration":8,
           "content":"- Lower your voice and slow your pace\n- Allow personal space\n- Validate feelings (\"That sounds frustrating\")\n- Offer simple choices\n- Remove the audience\n- Listen more than you speak\n- Avoid commands and ultimatums"},
          {"type":"callout","title":"Best Practice","duration":2,
           "data":{"variant":"info","body":"Your tone, body language, and pace are the most powerful de-escalation tools — far more than words."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"During escalation, you should:","choices":["Raise your voice","Move closer aggressively","Stay calm, lower your voice","Issue threats"],"correct":2,"explanation":"Calm tone reduces arousal."},
             {"q":"True or false: Validation means agreeing with everything the person says.","choices":["True","False"],"correct":1,"explanation":"Validation means acknowledging feelings, not agreeing."},
             {"q":"Removing the audience helps because:","choices":["It saves time","People often calm down without an audience","It is fun","Not true"],"correct":1,"explanation":"Reducing audience reduces social pressure."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Verbal Escalation","duration":5,
           "data":{"prompt":"A person is shouting and pacing because their preferred TV show is unavailable. What is the BEST approach?","choices":[
             {"label":"Shout back to be heard","correct":false,"feedback":"Matching escalation increases it."},
             {"label":"Validate, offer space, propose simple choices","correct":true,"feedback":"Correct."},
             {"label":"Threaten to call the police","correct":false,"feedback":"Threats escalate the situation."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will use non-threatening, person-centered de-escalation strategies before any restrictive intervention."}},
          {"type":"quiz","title":"Final Quiz: De-Escalation","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"Crisis usually moves through phases:","choices":["Trigger → escalation → peak → recovery","Random","Always peak","Always start at peak"],"correct":0,"explanation":"The crisis cycle."},
             {"q":"True or false: A calm, low voice helps lower the person''s arousal.","choices":["True","False"],"correct":0,"explanation":"Tone is a primary tool."},
             {"q":"Restrictive interventions should be:","choices":["First choice","Last resort","Routine","Always used"],"correct":1,"explanation":"Last resort and only if trained."},
             {"q":"You should give personal space because:","choices":["It looks polite","Crowding can trigger fight-or-flight","No reason","To save time"],"correct":1,"explanation":"Space lowers physiological arousal."},
             {"q":"Validation =","choices":["Acknowledging feelings","Agreeing with everything","Arguing","Ignoring"],"correct":0,"explanation":"Acknowledge, don''t agree."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Trauma-Informed Care","category":"Behavioral","duration":35,
      "description":"Recognize trauma''s impact and provide care that is safe, trustworthy, and empowering.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"What Is Trauma-Informed Care?","duration":6,
           "content":"Trauma-informed care (TIC) assumes that any person you support **may have experienced trauma** and adjusts the environment and interactions to avoid re-traumatization."},
          {"type":"text","title":"The Six TIC Principles","duration":8,
           "content":"1. **Safety**\n2. **Trustworthiness & transparency**\n3. **Peer support**\n4. **Collaboration & mutuality**\n5. **Empowerment, voice & choice**\n6. **Cultural, historical & gender considerations**"},
          {"type":"callout","title":"Shift the Question","duration":2,
           "data":{"variant":"info","body":"Instead of \"what''s wrong with this person?\", ask \"what happened to this person?\""}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"TIC assumes:","choices":["No one has trauma","Anyone may have trauma","Only some people have trauma","Trauma never affects behavior"],"correct":1,"explanation":"Assume the possibility of trauma."},
             {"q":"True or false: Empowerment and choice are TIC principles.","choices":["True","False"],"correct":0,"explanation":"Two of the six TIC principles."},
             {"q":"TIC asks:","choices":["What''s wrong with you","What happened to you","Why did you do that","None of the above"],"correct":1,"explanation":"Reframe the question."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Loud Noises","duration":5,
           "data":{"prompt":"A person becomes visibly distressed at loud noises and quickly goes to their room. What is a TIC response?","choices":[
             {"label":"Force them back into the group","correct":false,"feedback":"Forcing re-engagement is re-traumatizing."},
             {"label":"Respect the coping strategy, offer support, reduce environmental triggers","correct":true,"feedback":"Correct."},
             {"label":"Mock them for being sensitive","correct":false,"feedback":"Inappropriate and harmful."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will provide care that is safe, trustworthy, collaborative, and empowering."}},
          {"type":"quiz","title":"Final Quiz: TIC","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"TIC stands for:","choices":["Trauma Informed Care","Total Independent Choice","Treatment Inside Care","Time In Crisis"],"correct":0,"explanation":"Standard acronym."},
             {"q":"True or false: TIC applies only to people with known trauma histories.","choices":["True","False"],"correct":1,"explanation":"TIC assumes any person may have trauma."},
             {"q":"TIC focuses on:","choices":["Safety, trust, choice","Punishment","Speed","Cost"],"correct":0,"explanation":"Core principles."},
             {"q":"Avoiding re-traumatization means:","choices":["Avoid triggers when possible","Trigger on purpose","Ignore the person","Restrict choice"],"correct":0,"explanation":"Trigger avoidance is foundational."},
             {"q":"A TIC question is:","choices":["What happened to you","What''s wrong with you","Why are you bad","Why are you slow"],"correct":0,"explanation":"Reframe the question."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Suicide Prevention","category":"Behavioral","duration":30,
      "description":"Recognize warning signs of suicide and respond with appropriate, person-centered safety steps.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"Warning Signs","duration":6,
           "content":"Common warning signs include: talk of dying or being a burden, giving away possessions, withdrawing, increased substance use, severe mood changes, and acquiring means (weapons, medications)."},
          {"type":"text","title":"Ask, Listen, Connect","duration":8,
           "content":"### Ask directly\n\"Are you thinking about suicide?\"\n\n### Listen without judgment\nLet the person talk. Don''t argue, debate, or minimize.\n\n### Connect to help\nStay with the person. Remove access to means. Contact crisis services (988) and your supervisor immediately."},
          {"type":"callout","title":"Mythbuster","duration":2,
           "data":{"variant":"info","body":"Asking about suicide does NOT plant the idea. Direct, caring questions reduce risk."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"Crisis hotline number in the US:","choices":["911","311","988","711"],"correct":2,"explanation":"988 is the Suicide & Crisis Lifeline."},
             {"q":"True or false: Asking about suicide plants the idea.","choices":["True","False"],"correct":1,"explanation":"It does not — asking saves lives."},
             {"q":"If a person is in immediate danger you should:","choices":["Leave them alone","Stay with them, remove means, get help","Argue with them","Wait until tomorrow"],"correct":1,"explanation":"Stay-remove-connect."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Concerning Statement","duration":5,
           "data":{"prompt":"A person says \"everyone would be better off without me.\" What is the BEST first response?","choices":[
             {"label":"Brush it off — they''re just venting","correct":false,"feedback":"Take all statements seriously."},
             {"label":"Ask directly, listen, stay with them, and call 988 / supervisor","correct":true,"feedback":"Correct."},
             {"label":"Argue with them","correct":false,"feedback":"Don''t debate; listen and connect to help."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will take every statement of suicidal thinking seriously and follow ask-listen-connect with immediate escalation."}},
          {"type":"quiz","title":"Final Quiz: Suicide Prevention","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"988 is:","choices":["A weather line","Suicide & Crisis Lifeline","A test number","Not real"],"correct":1,"explanation":"988 nationwide."},
             {"q":"True or false: Talking about suicide makes it worse.","choices":["True","False"],"correct":1,"explanation":"Caring conversation reduces risk."},
             {"q":"When in immediate danger:","choices":["Leave","Stay, remove means, call for help","Sleep on it","Post about it"],"correct":1,"explanation":"Stay-remove-connect."},
             {"q":"Warning signs include:","choices":["Giving away possessions","Talk of being a burden","Withdrawal","All of the above"],"correct":3,"explanation":"All listed are warning signs."},
             {"q":"You should:","choices":["Argue them out of it","Listen without judgment","Ignore","Promise secrecy"],"correct":1,"explanation":"Never promise secrecy; listen and escalate."}
           ]}}
        ]}
      ]
    },
    {
      "title":"HCBS Settings Rule","category":"Compliance","duration":30,
      "description":"Understand the federal Home and Community-Based Services (HCBS) settings rule and the rights it protects.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"What Is the HCBS Settings Rule?","duration":6,
           "content":"The CMS HCBS Settings Rule (2014) defines the qualities of community settings where Medicaid-funded HCBS services may be delivered. It protects choice, autonomy, privacy, dignity, and community integration."},
          {"type":"text","title":"Required Setting Qualities","duration":8,
           "content":"- Integrated in the broader community\n- Person has choice in services and providers\n- Privacy, dignity, respect, freedom from coercion\n- Independence in making life choices (schedule, activities, visitors)\n- Choice of roommate (if applicable)\n- Lockable door, privacy in personal care"},
          {"type":"callout","title":"What This Means in Practice","duration":2,
           "data":{"variant":"success","body":"People decide their daily schedule, what to eat, when to sleep, and whom to visit — not staff convenience."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"HCBS Settings Rule was issued by:","choices":["State legislature","CMS","DOJ","FDA"],"correct":1,"explanation":"Centers for Medicare & Medicaid Services."},
             {"q":"True or false: Staff may set a strict bedtime for adults receiving HCBS services for staff convenience.","choices":["True","False"],"correct":1,"explanation":"Violates choice and autonomy."},
             {"q":"Settings must be:","choices":["Isolated","Integrated in the community","Locked at all times","Hidden"],"correct":1,"explanation":"Community integration is required."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Visitor Restrictions","duration":5,
           "data":{"prompt":"A coworker tells you that visitors are only allowed between 2-4pm. Is this compliant?","choices":[
             {"label":"Yes — group homes need rules","correct":false,"feedback":"Blanket restrictions violate HCBS rights unless individualized for safety."},
             {"label":"No — individuals have the right to visitors at any time, unless individually restricted for documented reasons","correct":true,"feedback":"Correct."},
             {"label":"Only family is allowed","correct":false,"feedback":"Restricts choice."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will support each person''s rights to choice, privacy, autonomy, and community integration."}},
          {"type":"quiz","title":"Final Quiz: HCBS Settings Rule","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"HCBS Settings Rule protects:","choices":["Choice","Privacy","Autonomy","All of the above"],"correct":3,"explanation":"All listed rights."},
             {"q":"True or false: A locked door for personal bedroom is required where applicable.","choices":["True","False"],"correct":0,"explanation":"Privacy in personal space."},
             {"q":"Daily schedule is set by:","choices":["Staff convenience","The person","Roommates","Random"],"correct":1,"explanation":"Person-centered."},
             {"q":"Settings must be:","choices":["Segregated","Community-integrated","Hidden","Inaccessible"],"correct":1,"explanation":"Integration requirement."},
             {"q":"Restrictions must be:","choices":["Blanket","Individualized and documented","Verbal only","Permanent"],"correct":1,"explanation":"Individualized rights modifications only."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Medicaid 101","category":"Compliance","duration":25,
      "description":"Understand the basics of Medicaid, waivers, and how funding affects the supports you provide.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"What Is Medicaid?","duration":5,
           "content":"Medicaid is a joint federal-state program providing health coverage to eligible low-income individuals, including people with disabilities."},
          {"type":"text","title":"HCBS Waivers","duration":8,
           "content":"HCBS waivers allow states to provide community-based services (instead of institutional care) for people who meet eligibility for that level of care. DSPD administers Utah''s waivers for people with intellectual and developmental disabilities."},
          {"type":"callout","title":"Why It Matters","duration":2,
           "data":{"variant":"info","body":"Every service you provide is documented because it may be billed to Medicaid. Accurate, timely notes protect both the person and the agency."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"Medicaid is funded by:","choices":["States only","Federal only","Federal + State","Private insurance"],"correct":2,"explanation":"Joint federal-state program."},
             {"q":"True or false: HCBS waivers allow community-based instead of institutional care.","choices":["True","False"],"correct":0,"explanation":"Core purpose of HCBS waivers."},
             {"q":"Inaccurate documentation can result in:","choices":["No issues","Medicaid billing fraud findings","Promotion","Bonuses"],"correct":1,"explanation":"Documentation tied to billing."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Skipped Service","duration":5,
           "data":{"prompt":"A coworker says \"just sign that you provided the service — close enough.\" What do you do?","choices":[
             {"label":"Sign it","correct":false,"feedback":"That is Medicaid fraud."},
             {"label":"Refuse and report the request","correct":true,"feedback":"Correct."},
             {"label":"Ask another coworker","correct":false,"feedback":"Do not falsify documentation under any pressure."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will document only services actually provided and never participate in Medicaid billing fraud."}},
          {"type":"quiz","title":"Final Quiz: Medicaid 101","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"Medicaid is:","choices":["Federal only","Private","Federal + State","City only"],"correct":2,"explanation":"Joint program."},
             {"q":"True or false: HCBS waivers are an alternative to institutional care.","choices":["True","False"],"correct":0,"explanation":"Core purpose."},
             {"q":"Falsifying documentation is:","choices":["A bonus","Fraud","Helpful","Required"],"correct":1,"explanation":"Medicaid fraud — serious crime."},
             {"q":"DSPD administers waivers for:","choices":["Anyone","People with IDD","Only seniors","Only kids"],"correct":1,"explanation":"IDD population."},
             {"q":"Documentation must be:","choices":["Accurate and timely","Whenever","Optional","Verbal"],"correct":0,"explanation":"Accurate and timely required."}
           ]}}
        ]}
      ]
    },
    {
      "title":"Person-Centered Support","category":"Service Delivery","duration":35,
      "description":"Put each person at the center of their own life — their preferences, goals, and rights drive your work.",
      "modules":[
        {"title":"Core Concepts","lessons":[
          {"type":"text","title":"What Is Person-Centered Support?","duration":6,
           "content":"Person-centered support starts from the person''s strengths, preferences, and goals. The plan describes what is **important to** the person AND what is **important for** the person (health & safety)."},
          {"type":"text","title":"Daily Practices","duration":8,
           "content":"- Ask, don''t assume\n- Offer real choices\n- Respect dignity of risk\n- Follow the support plan\n- Speak respectfully (people-first or identity-first per the person''s preference)\n- Foster relationships and community participation"},
          {"type":"callout","title":"Dignity of Risk","duration":2,
           "data":{"variant":"success","body":"People have the right to make their own choices — including ones we may disagree with — as long as they understand the consequences and the choice doesn''t cause serious harm."}},
          {"type":"knowledge_check","title":"Knowledge Check","duration":5,
           "data":{"passing_score":67,"max_attempts":3,"questions":[
             {"q":"Person-centered plans describe:","choices":["What staff want","What''s important to and for the person","Cheapest options","Random goals"],"correct":1,"explanation":"To AND for."},
             {"q":"True or false: \"Dignity of risk\" means respecting the right to make choices.","choices":["True","False"],"correct":0,"explanation":"Core principle."},
             {"q":"Person-first language is:","choices":["Always required","A choice the person makes","Never used","Outdated"],"correct":1,"explanation":"Follow the person''s preference."}
           ]}}
        ]},
        {"title":"Apply & Certify","lessons":[
          {"type":"scenario","title":"Scenario: Lunch Choice","duration":5,
           "data":{"prompt":"The person wants pizza for the third day in a row. The plan supports balanced meals. What do you do?","choices":[
             {"label":"Force a salad","correct":false,"feedback":"Forcing violates dignity of risk."},
             {"label":"Discuss balanced choices, honor the person''s decision while encouraging variety","correct":true,"feedback":"Correct — respect choice and inform."},
             {"label":"Skip lunch","correct":false,"feedback":"Skipping meals is neglect."}
           ]}},
          {"type":"acknowledgement","title":"Acknowledgement","duration":2,
           "data":{"statement":"I will support each person''s preferences, goals, and rights, including dignity of risk."}},
          {"type":"quiz","title":"Final Quiz: Person-Centered Support","duration":7,
           "data":{"passing_score":80,"max_attempts":3,"questions":[
             {"q":"Person-centered support starts with:","choices":["The person","The staff","The budget","The schedule"],"correct":0,"explanation":"Person at the center."},
             {"q":"True or false: \"Important to\" and \"important for\" are both essential in the plan.","choices":["True","False"],"correct":0,"explanation":"Balance both."},
             {"q":"Dignity of risk means:","choices":["No risk allowed","Right to make choices","Always say no","Hand-holding"],"correct":1,"explanation":"Respect autonomy."},
             {"q":"Choices offered must be:","choices":["Fake","Real and meaningful","Limited to 1","Pre-selected"],"correct":1,"explanation":"Real choices."},
             {"q":"Community participation is:","choices":["Optional","A core outcome","Discouraged","Restricted"],"correct":1,"explanation":"Integration & inclusion."}
           ]}}
        ]}
      ]
    }
  ]'::jsonb;
BEGIN
  SELECT id INTO v_program_id FROM public.training_programs WHERE slug = 'dspd-core-compliance' LIMIT 1;
  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'DSPD program not found';
  END IF;

  FOR v_course_def IN SELECT * FROM jsonb_array_elements(v_courses) LOOP
    v_course_idx := v_course_idx + 1;

    -- Skip if a global course with the same title already exists
    SELECT id INTO v_course_id
    FROM public.courses
    WHERE title = (v_course_def->>'title') AND is_global = true
    LIMIT 1;

    IF v_course_id IS NULL THEN
      INSERT INTO public.courses (title, description, category, duration_minutes, is_global, is_published, certificate_validity_months)
      VALUES (
        v_course_def->>'title',
        v_course_def->>'description',
        v_course_def->>'category',
        (v_course_def->>'duration')::int,
        true, true, 12
      )
      RETURNING id INTO v_course_id;

      v_module_idx := 0;
      FOR v_module_def IN SELECT * FROM jsonb_array_elements(v_course_def->'modules') LOOP
        INSERT INTO public.course_modules (course_id, title, order_index)
        VALUES (v_course_id, v_module_def->>'title', v_module_idx)
        RETURNING id INTO v_module_id;

        v_lesson_idx := 0;
        FOR v_lesson_def IN SELECT * FROM jsonb_array_elements(v_module_def->'lessons') LOOP
          INSERT INTO public.lessons (module_id, title, content, lesson_type, data, order_index, duration_minutes, required)
          VALUES (
            v_module_id,
            v_lesson_def->>'title',
            v_lesson_def->>'content',
            v_lesson_def->>'type',
            COALESCE(v_lesson_def->'data', '{}'::jsonb),
            v_lesson_idx,
            COALESCE((v_lesson_def->>'duration')::int, 5),
            true
          );
          v_lesson_idx := v_lesson_idx + 1;
        END LOOP;
        v_module_idx := v_module_idx + 1;
      END LOOP;
    END IF;

    -- Link course to program (idempotent)
    INSERT INTO public.program_courses (program_id, course_id, order_index, required)
    SELECT v_program_id, v_course_id, v_course_idx - 1, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.program_courses
      WHERE program_id = v_program_id AND course_id = v_course_id
    );
  END LOOP;
END $$;
