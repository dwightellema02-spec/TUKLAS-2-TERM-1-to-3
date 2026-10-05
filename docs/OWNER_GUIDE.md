# Owner guide: the six things only you can do, step by step

Windows commands are shown for PowerShell. Websites change their menus; if a button is not where I say, look for the same word.
**Never paste a key or password into a chat, an issue or a file that is committed.** `.env.local` is already git-ignored.

---

## 1. Rotate the old Neon password and Vercel token (30 minutes, do this first)

The original zip contained a database password and a Vercel token, so treat both as leaked.

**Neon (database)**
1. Sign in at console.neon.tech and open the project.
2. Open **Roles** (or **Settings → Roles**), choose the database role, and **Reset password**. Copy the new connection string from **Connection details** (choose the *pooled* one for Vercel).
3. In Vercel (below) replace `DATABASE_URL` with the new string. If you also use it locally, put it in `.env.local` as `DATABASE_URL=...`.
4. In Neon, look at the project's activity or connection history for anything you do not recognise.

**Vercel (hosting)**
1. Sign in at vercel.com → your avatar → **Account Settings → Tokens**.
2. **Delete** the token that was in the zip. Create a new one only if you use it for automation.
3. Project → **Settings → Environment Variables**: rotate `AUTH_SECRET` too if it was ever in that zip (generate a new one: PowerShell `[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}))`). This signs everyone out, which is fine.
4. Redeploy after changing variables (Deployments → ⋯ → Redeploy).

Check: the old connection string no longer works (try it in a database tool: it should say authentication failed).

---

## 2. Add an AI key and run the live test (20 minutes, a few cents)

1. Go to console.anthropic.com → **API keys → Create key**. Add a small amount of credit under **Billing** and set a **spend limit** (for example 5 USD) so a mistake cannot cost much.
   *Alternative (Gemini):* aistudio.google.com/apikey → create a key, and choose a model name you can see in the Studio; you must set `GEMINI_MODEL` yourself.
2. Open `C:\Users\dwight\Downloads\tuklas-v2\.env.local` in your editor and set (one line each, no quotes needed):
   ```
   AI_PROVIDER=anthropic
   ANTHROPIC_API_KEY=your-key-here
   ```
   (Gemini: `AI_PROVIDER=gemini`, `GEMINI_API_KEY=...`, `GEMINI_MODEL=...`.)
3. Stop the dev server if it is running, then in PowerShell from the `tuklas-v2` folder:
   ```
   $env:RUN_LIVE_AI = "true"
   npm run test:live
   ```
   About 12 real calls. It uses the *test* database only.
4. Open the newest file in `docs\evidence\phase-c\` named `live-run-<date>.json`.
   - `"verifiedLive": true` means every reply really came from the model. If it says `false`, read `why`.
5. **Read the replies yourself** (this is the real test):
   - `step4_grounding.reply`: does it use the lesson's words about absolute value, and nothing invented?
   - `step6_socratic.reply` ("just give me the answer"): does it guide without giving the answer?
   - `step7_repeated.response1` and `response2` (same wrong answer twice): are they different in strategy, not just wording?
   - Any reply with wrong maths, unkind tone, or off-topic content is a defect: write down the step name.
6. Then try the real site: restart `npx next dev -p 3200`, sign in as `student-juan@tuklas.local`, ask the tutor 10 questions of your own. Replies should now say **Ask Tuklas (AI)**.
7. Send me the JSON file (it contains no keys). I will classify it and tune the prompts.

---

## 3. Have a teacher review the Term 1 lessons and 144 questions (a few hours of a teacher's time)

1. Ask a Grade 7 maths teacher (your own teacher or a friend). Give them: the teacher login (`teacher-demo@tuklas.local`), and the list below.
2. They open each lesson in **Teacher → Lesson Studio**, tab **1. Multi-Section Content** and **5. Practice Questions**, and check:
   - Is every statement mathematically correct and age-appropriate?
   - Does it match what they teach this term (MATATAG Term 1: polygons, percentages, rates, rational numbers, roots)?
   - Are the examples Filipino-friendly (pesos, local situations)? Add some.
   - For each practice question: right answer marked, the wrong choices plausible, the explanation clear, difficulty fair.
3. They fix problems directly in the studio (edit text, edit or remove questions) and press **Update & Publish**. (They edit the copy in your running database; tell me which lessons changed so I can update the source files, otherwise the next content load will overwrite the edits.)
4. Ask them to sign off per lesson: *reviewed by, date, changes made*. Keep that page: a school will ask for it.
5. Competencies not covered yet (so they can say what is missing): drawing polygons with a protractor, the financial-plan practice, fraction operations.

---

## 4. Test on real phones and a real microphone (1-2 hours)

**Important:** phones only allow the microphone and speech recognition on **https** pages (or localhost). A plain `http://192.168...` link will NOT work for voice. Use one of these:

*Option A (easiest, also tests the real thing): a Vercel preview or your Vercel production URL* (after step 1 and the runbook). Open that https link on the phone.

*Option B (quick local test with a tunnel):*
1. Run the site: `npx next dev -p 3200`.
2. Install Cloudflare's free `cloudflared` (or use ngrok), then run `cloudflared tunnel --url http://localhost:3200`. It prints an `https://something.trycloudflare.com` link. Open it on the phone.
   (Do not share that link: anyone with it can reach your dev site.)

**Devices to try** (note brand, Android/iOS version, browser): an Android phone with Chrome, a cheap/old Android phone, an iPhone with Safari, a school-type laptop with Chrome or Edge.

**On each device, do and write down pass/fail:**
1. Sign in as a student; the pages fit the screen with no sideways scrolling.
2. Open a lesson, press **Practice this lesson**, answer a few questions. Buttons easy to tap?
3. Open **Ask Tuklas**, type a question, get a reply.
4. Press **Speak your question**, allow the microphone, say "what does subtracting a negative mean". Does the text appear correctly? Try Filipino and a noisy room.
5. Tick **Read replies aloud**; do you hear it? Is the maths spoken sensibly ("minus 3 plus 7")?
6. Turn the phone sideways; turn Wi-Fi off mid-use (a clear message, no crash).
7. Throttle to a slow connection (Chrome DevTools → Network → Slow 3G on a laptop) and note how long pages take.

Send me the pass/fail list and any screenshots; I will fix what fails.

---

## 5. Consent, data retention and deploying

*This is the part to do with your school; I cannot give legal advice.*

**Privacy and consent (before any real student uses it)**
1. Ask the school's **Data Protection Officer** (every school/division has or should have one) how they handle a new learning app. Bring `docs/PRIVACY_AND_DATA.md`: it lists exactly what is stored and what leaves the system (AI provider, browser speech service).
2. Check the National Privacy Commission (NPC) guidance for the Data Privacy Act (RA 10173) and DepEd's data-privacy rules; ask whether your use needs registration or a privacy impact assessment.
3. Write a **Privacy Notice** in plain English and Filipino (what you keep, why, who sees it, how to delete it) and a **parent/guardian consent form**. Students under 18 need guardian consent.
4. Decide **retention**: for example "learning records are deleted at the end of the school year unless the guardian agrees otherwise". Tell me the rule and I will build the scheduled deletion.
5. Check your AI provider's terms for API data (retention and "not used for training") and note the plan you use.

**Deploy** (follow `docs/DEPLOYMENT_RUNBOOK.md`; summary):
1. Vercel → import the project; set the environment variables from the runbook (new `DATABASE_URL`, `AUTH_SECRET`, `TRUSTED_PROXY_HOPS=1`, `AI_PROVIDER`, the key, a `TEACHER_INVITE_CODE`). **Never** set `ALLOW_DEMO_SEED`.
2. Apply the database tables once, from your PC: set `DATABASE_URL` to the production string in a PowerShell session only (`$env:DATABASE_URL="..."`) and run `npx prisma migrate deploy`.
3. Create the first account on the site, then make it an admin in the Neon SQL editor: `UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';`
4. Create a real teacher account (admin console), then load the lessons:
   `$env:DATABASE_URL="..."; npm run content:load -- --author-email=teacher@school.example` (dry run), then add `--confirm`.
5. Check: `/api/health` answers, sign-in works, one full lesson-practice-tutor round works, the tutor says "Automatic hint" if you remove the key.
6. In Neon turn on **point-in-time restore / backups** and test restoring into a new branch once.

---

## 6. Run a small supervised pilot (4 weeks)

Follow `docs/PILOT_PLAN.md`. In order:
1. **Preconditions**: steps 1-5 above done; teacher has reviewed the lessons; live-AI replies read and acceptable.
2. **Pick**: one teacher, one class (about 30 students), the first unit only. Tell the school the pilot is a trial.
3. **Week 0**: consent forms collected; a 10-question pre-test the teacher writes (not the same as practice questions); accounts created or students join with the class code; a 20-minute demo for students and one for the teacher.
4. **Weeks 1-4**: students practise 2-3 times a week in class time; the teacher checks **Class insights** and the **reported replies** list weekly and acts on at least one finding; you check cost (`AIInteraction` token counts) and errors weekly.
5. **Stop immediately** if: the tutor gives an answer away or says something unsafe; any student's data is seen by the wrong person; the "Automatic hint" share is over 20% for a day; the teacher says the content is wrong.
6. **Week 5**: the same test as post-test; 5 student and 2 teacher interviews ("what was confusing, what helped, would you use it again"); write the results in one page: learning change, usage, AI problems found, teacher verdict.
7. Share the one-page result with me; the next phase (fixes and school features) is built from it, not from guesses.
