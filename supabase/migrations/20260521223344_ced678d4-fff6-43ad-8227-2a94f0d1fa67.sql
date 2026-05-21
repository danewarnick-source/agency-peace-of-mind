
DO $$
DECLARE
  m RECORD;
BEGIN
  FOR m IN
    SELECT cm.id, cm.title, c.title AS course_title
    FROM public.course_modules cm
    JOIN public.courses c ON c.id = cm.course_id
    WHERE NOT EXISTS (SELECT 1 FROM public.lessons l WHERE l.module_id = cm.id)
  LOOP
    -- 1. Intro reading
    INSERT INTO public.lessons (module_id, title, lesson_type, order_index, required, duration_minutes, content, data)
    VALUES (
      m.id,
      'Overview: ' || m.title,
      'text',
      0,
      true,
      6,
      '## What you''ll learn' || E'\n' ||
      '- Core compliance expectations for ' || m.title || E'\n' ||
      '- Practical procedures you must follow on shift' || E'\n' ||
      '- Documentation, reporting, and escalation requirements' || E'\n' ||
      '- How this topic protects the people you support' || E'\n\n' ||
      'This module is part of ' || m.course_title || '. Complete each section in order. Your progress is saved automatically and contributes to your training file.',
      '{}'::jsonb
    );

    -- 2. Compliance callout
    INSERT INTO public.lessons (module_id, title, lesson_type, order_index, required, duration_minutes, content, data)
    VALUES (
      m.id,
      'Compliance Essentials',
      'callout',
      1,
      true,
      3,
      NULL,
      jsonb_build_object(
        'variant', 'warning',
        'title', m.title || ' — Non-Negotiables',
        'body',
        '- Follow agency policy and applicable state/federal regulations at all times.' || E'\n' ||
        '- Document events accurately, objectively, and within required timeframes.' || E'\n' ||
        '- Escalate concerns to your supervisor when in doubt.' || E'\n' ||
        '- Protect the dignity, privacy, and safety of every person you support.'
      )
    );

    -- 3. Knowledge check
    INSERT INTO public.lessons (module_id, title, lesson_type, order_index, required, duration_minutes, content, data)
    VALUES (
      m.id,
      'Knowledge Check: ' || m.title,
      'knowledge_check',
      2,
      true,
      5,
      NULL,
      jsonb_build_object(
        'passing_score', 67,
        'max_attempts', 3,
        'questions', jsonb_build_array(
          jsonb_build_object(
            'q', 'What should you do first when you are unsure how a policy applies to a situation?',
            'choices', jsonb_build_array('Guess and proceed', 'Ask your supervisor for guidance', 'Skip the task entirely', 'Wait until next shift'),
            'correct', 1,
            'explanation', 'When in doubt, always escalate to your supervisor before acting.'
          ),
          jsonb_build_object(
            'q', 'Accurate, timely documentation is:',
            'choices', jsonb_build_array('Optional', 'Required for compliance and continuity of care', 'Only for serious events', 'Done at the end of the month'),
            'correct', 1,
            'explanation', 'Documentation is a regulatory and clinical requirement.'
          ),
          jsonb_build_object(
            'q', 'True or false: Protecting the dignity and privacy of the people you support is part of every task.',
            'choices', jsonb_build_array('True', 'False'),
            'correct', 0,
            'explanation', 'Person-centered, rights-respecting practice applies in every interaction.'
          )
        )
      )
    );

    -- 4. Acknowledgement
    INSERT INTO public.lessons (module_id, title, lesson_type, order_index, required, duration_minutes, content, data)
    VALUES (
      m.id,
      'Acknowledgement',
      'acknowledgement',
      3,
      true,
      2,
      NULL,
      jsonb_build_object(
        'statement', 'I have reviewed the ' || m.title || ' module and understand my responsibilities under this policy area. I will follow agency procedures, document accurately, and escalate concerns to my supervisor.',
        'signature_required', true
      )
    );
  END LOOP;
END $$;
