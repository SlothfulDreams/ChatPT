# ChatPT Demo Script -- Shoulder Pain

Total time: ~3 minutes

---

## 1. Reset (5s)

- Open **Settings** (gear icon, bottom bar)
- Scroll to **Demo** section, click **Reset Body**
- Close settings

Body should be all green/neutral.

---

## 2. Manual Feeling Entry (30s)

Click on the **left deltoid** (front of shoulder, left side).

The feelings panel opens:

- Select **Sharp Pain**
- Drag severity to **7**
- Hit **Confirm**

The muscle turns red on the model. Click background to deselect.

Now click the **left infraspinatus** (back of shoulder, rotator cuff area):

- Select **Stiffness**
- Severity **5**
- **Confirm**

Orange glow appears. Two muscles are now colored -- you can see at a glance something is going on with the left shoulder.

---

## 3. Chat -- Describe the Problem (60s)

Open **Chat** if not already open. Type:

> I've been having sharp pain in my left shoulder for about a week now. It started after I did overhead presses. It hurts when I raise my arm above my head and there's a grinding feeling.

The agent will:

1. **Research** shoulder impingement / rotator cuff patterns
2. **Select muscles** -- expect it to highlight deltoid, supraspinatus, infraspinatus, possibly teres minor
3. **Update muscles** -- sets conditions, pain levels, and summaries on the highlighted muscles
4. **Ask follow-up** -- likely about pain at night, specific ROM limitations, or history of shoulder issues

Watch the model update in real time as the agent calls `update_muscle`.

---

## 4. Follow-Up Conversation (30s)

Reply to the agent's follow-up:

> Yeah it aches at night when I sleep on that side. I can't reach behind my back easily either. No previous injuries.

The agent will:

- Refine its assessment (likely tightens toward supraspinatus tendinopathy or impingement)
- Update mobility scores on affected muscles
- Possibly flag the subscapularis for internal rotation restriction

---

## 5. Generate a Workout (30s)

Type:

> Can you give me a rehab workout for this?

The agent will call `create_workout` with exercises like:

- Pendulum swings
- External rotation with band
- Scapular wall slides
- Prone Y/T raises

The **Workout** panel opens on the left with the plan. Hover over exercises to see which muscles they target highlighted on the model.

---

## 6. Show Off the Model (30s)

- **Orbit** the model to show the back -- rotator cuff muscles are colored
- **Hover** over muscles to see their names in the tooltip
- Click a colored muscle to see its feeling + severity in the panel
- Toggle **L/R** mode and click the right deltoid to show it's still healthy (green) vs the affected left side
- Use the **muscle group filter** on the left to isolate just `shoulders` or `rotator_cuff`

---

## Talking Points

- **Bidirectional**: click muscles to set feelings, OR describe symptoms in chat and the AI updates the model
- **Evidence-based**: agent researches clinical knowledge before making assessments
- **Visual feedback**: color = condition, intensity = severity, all at a glance
- **Workout generation**: rehab plans that target the specific affected muscles
- **Persistent**: all data stored per-user, tracks history over time
