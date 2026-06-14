## Badge label clarity — SEI UPI summary deadlines

In `src/routes/dashboard.deadlines.tsx` (~line 159), replace the single `<Badge>UPI</Badge>` rendered for `requires_upi_attestation` summary rows with a single badge reading **"SEI — Monthly UPI submission required"**. Keep the existing `bg-[#137182] text-white` styling.

No other logic, buttons, or attestation flow changes.