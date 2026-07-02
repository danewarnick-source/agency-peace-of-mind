## Plan

1. **Fix the button target**
   - Update the renewal/banner CTA so it scrolls to the visible buying/training area when there are no renewal rows.
   - Make the scroll helper fall back in this order: renewals section → storefront/programs section → roster.

2. **Remove duplicate scroll anchors**
   - The page currently has two `ht-storefront` IDs: one wrapper and one section. Keep a single stable ID so browser scrolling is reliable.

3. **Make the renewal section discoverable**
   - If there are no renewal rows, don’t leave the button with nowhere useful to go; route the action to the storefront/program purchase section instead.

4. **Verify**
   - Confirm the relevant button exists on the training dashboard and clicking it moves the page to the expected section instead of doing nothing.