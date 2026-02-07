# ChatPT -- Pitch Script

Follows the slide deck. Talk track per slide.

---

### Slide 1: Title

"Hello my esteemed judges. My name is Henry, and this is ChatPT. My teammates are reserving our table right now so you're stuck with just me -- but I promise I'll make it worth your time."

---

### Slide 2: Problem

"Physical therapy costs $150-$400 per session. A full course of care runs $1,200 to $2,500. The biggest digital PT company, Sword Health, brags about saving $3,177 per member per year -- but their program still costs $1,000 per member. They're celebrating making a broken system slightly less broken. 1.7 billion people have musculoskeletal conditions. Most of them just live with the pain because the math doesn't work."

---

### Slide 3: Solution

"ChatPT is an AI physiotherapist built on a real anatomical model. You click where it hurts, describe what you're feeling, and the agent does what a PT does -- it assesses, it diagnoses, it builds you a rehab plan. Except it costs nothing, it's instant, and it remembers your body across sessions. It's the difference between googling 'shoulder pain' and getting 50 WebMD articles versus pointing at your deltoid and getting a targeted recovery program in 60 seconds."

---

### Slide 4: Tech Stack

"3D anatomy rendered in React Three Fiber. Convex for real-time persistent state -- every muscle update syncs live. The AI agent runs a multi-step reasoning loop with tool calling: researches a clinical knowledge base, updates muscle conditions on the model, and generates workouts -- all streamed so you watch it think."

---

### Slide 5: 3D Visualization

Skip or skim -- the live demo covers this better.

---

### Slide 6: Feelings Input

Skip or skim -- show this live.

---

### Slide 7: AI Agent

"The agent has four tools. It can select muscles on the model, update their condition, research clinical literature, and generate workout plans. It reasons through multiple steps and you see every tool call in real time."

---

### Slide 8: Workout System

Skip -- demo covers this.

---

### Slide 9: Data & History

Skip -- mention briefly if time allows: "Every state change is tracked with timestamps and source, so you have a full recovery timeline."

---

### Slide 10: Closing

"A thousand dollars a month, or a conversation. ChatPT."

---

## Why ChatPT beats Sword Health

**Price**: Sword costs $1,000/year ($83/month) and requires employer sponsorship. ChatPT is $20/month max, direct to consumer. 75% cheaper, no corporate middleman.

**Access**: Sword is B2B2C -- you need your employer to buy it. ChatPT is instant, no gatekeepers.

**Friction**: Sword has onboarding, scheduling, human coach review. ChatPT: click where it hurts, get a plan in 60 seconds.

**Persistence**: Sword is session-based. ChatPT remembers your full body state across sessions with a tracked recovery timeline.

**Transparency**: Sword is a black box. ChatPT lets you watch the AI reason through diagnosis in real-time.

**The flex**: Sword raised $300M to make PT slightly less broken. We built a working AI physio in a weekend. The technology gap has closed so fast that a solo dev can compete with a unicorn.

---

## Live Demo Flow (90s)

1. **Reset** -- Settings > Reset Body. Clean slate, all green.
2. **Click left deltoid** -- select Sharp Pain, severity 7, confirm. Muscle turns red.
3. **Click left infraspinatus** -- select Stiffness, severity 5, confirm. Orange glow.
4. **Chat**: "I've been having sharp pain in my left shoulder for about a week. It started after overhead presses. Hurts when I raise my arm and there's a grinding feeling."
5. **Watch** the agent research, highlight muscles, update conditions in real time.
6. **Follow up**: "Yeah it aches at night when I sleep on that side."
7. **Ask**: "Can you give me a rehab workout?"
8. **Orbit** the model to show colored muscles from different angles.

---

## Timing

| Section | Slide | Time |
|---------|-------|------|
| Intro | 1 | 10s |
| Problem | 2 | 25s |
| Solution | 3 | 25s |
| Tech | 4 | 15s |
| Agent | 7 | 10s |
| Live Demo | -- | 90s |
| Close | 10 | 5s |
| **Total** | | **~3 min** |
