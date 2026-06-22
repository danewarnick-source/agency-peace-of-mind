## What's actually happening

The URL in the screenshot (`preview--agency-peace-of-mind.lovable.app/...`) is the **shared static preview** for the project, not the in-editor live preview. The message "Preview has not been built yet" means that hosted preview build is missing or failed — it is not a route/runtime error in your app.

Evidence:
- Local production build runs clean (33s, no errors).
- The in-editor sandbox loads `/dashboard/employees/266b5e0b-...` and renders the page (it shows "Staffer not found in your organization" because that staff ID belongs to org "ZZZ TEST — DELETE ME", not True North — RLS correctly hides it).
- No console/page errors during navigation.

So there is nothing to fix in the code for this URL.

## Recommended action

1. Republish the project from the editor (Publish → Update). That will rebuild the static preview and the `preview--agency-peace-of-mind.lovable.app` host will start serving the latest build instead of the "not built yet" placeholder.
2. After republish, open the link again. If it still shows the placeholder, the static preview deploy failed — share the publish log and I'll investigate.

## Separate (already-known) item

The staff ID `266b5e0b-ee65-499d-a0c0-d254e5177268` is in the test org, so even after the preview is rebuilt that exact URL will show "Staffer not found" while you're logged into True North. Use a True North staff URL, or tell me you want to switch active orgs.

No file edits are part of this plan.