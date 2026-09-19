# ZimRoadWise Competitive Analysis

_Generated 2026-09-16. Thorough scrape of https://zimroadwise.co.zw/_

---

## Executive Summary

ZimRoadWise is a **free, no-account-required** driving theory study companion for the Zimbabwean provisional and practical driving test. It is built on a modern web framework (appears to be LMS-style), has clean UI, and covers the same exam we target. It will be very hard to compete with on content alone since it is free and well-structured.

**Key threat**: It is free, polished, and covers the same syllabus. If a user discovers both, the free option wins on price.

**Key advantage Zivvvo retains**: Adaptive learning engine, spaced repetition, readiness scoring, offline-first PWA, gamification (XP, streaks), and AI-powered explanations. ZimRoadWise is a traditional LMS — learn → practice → test. Zivvvo is a personal tutor — diagnose → adapt → coach.

---

## 1. What ZimRoadWise Is

| Attribute | Detail |
|-----------|--------|
| **Name** | ZimRoadWise |
| **URL** | https://zimroadwise.co.zw/ |
| **Tagline** | "Learn. Practice. Drive Safe." |
| **Price** | 100% free, no account needed |
| **Platform** | Web app (responsive, mobile-first) |
| **Offline** | Claims offline support (likely service worker) |
| **Tech** | Modern SPA, appears to be built on a course/LMS platform |
| **Content source** | "Based on the Zimbabwe Highway Code" |

---

## 2. Content Inventory

### Study Tracks (3 courses)

| Track | Lessons | Questions | Level |
|-------|---------|-----------|-------|
| Road Rules & Highway Code | 28 (17 own + 11 shared) | 65 | Beginner |
| Road Signs Mastery | 11 | 43 | Beginner |
| Practical Test Prep | 23 (12 own + 11 shared) | 53 | Intermediate |
| **Total unique lessons** | **51** | **~133** | |

### Lesson Breakdown by Category

**Road Rules (17 lessons)**:
1. Keep Left and Lane Discipline
2. Speed Limits
3. Right of Way at Intersections
4. Roundabouts and Circles
5. Vehicle Classes and Legal Ages
6. Documents Your Vehicle Must Have
7. Learner Driver Conditions
8. Robot Sequences and Green Arrows
9. Intersection Diagram Rules
10. Right of Way at Traffic Circles
11. Four-Way Stops and Uncontrolled Junctions
12. Speed Limits You Must Know
13. Overtaking Safely and Legally
14. Pedestrian Crossings and Vulnerable Road Users
15. Parking and Stopping Rules
16. Duties After an Accident
17. Level Crossings and Railway Lines

**Road Signs (11 lessons)**:
1. The Three Families of Signs
2. Road Markings
3. The Five Classes of Signs and Signals
4. Carriageway Markings in Detail
5. Stop, Give Way and Level Crossings
6. The Three Families of Road Signs
7. Stop and Yield Signs
8. Reading Road Markings
9. Traffic Lights and Police Signals
10. Warning Signs You Will Meet Most
11. Hand Signals Every Driver Must Know

**Vehicle Knowledge (11 lessons)**:
1. Documents You Must Carry
2. Pre-Drive Safety Checks
3. Reflectors, Lights and Dipping
4. Motorcycle Requirements
5. Safety Checks and the Steering Wheel
6. The Daily Pre-Drive Check
7. Tyres, Tread and Pressure
8. Understanding Your Warning Lights
9. Brakes, Clutch and Steering Basics
10. Loading Your Vehicle Correctly
11. Roadworthiness and Vehicle Inspection

**Defensive Driving (12 lessons)**:
1. Following Distance
2. Scanning and Hazard Perception
3. Night and Weather Driving
4. Blind Spots and Hazard Perception
5. Hand Signals and Using the Horn
6. The Two-Second Following Rule
7. Scanning, Mirrors and Blind Spots
8. Driving in Rain and on Wet Roads
9. Night Driving and Dazzle
10. Fatigue, Alcohol and Fitness to Drive
11. Sharing the Road in Zimbabwe
12. Emergencies: Blowouts, Brake Failure and Skids

### Road Sign Library

**157 signs** catalogued with official artwork images:
- Regulatory: 87 signs (R101–R600 series)
- Warning: 35 signs (W101–W415 series)
- Guidance: 21 signs (GA, GB, GDS, GL, GS series)
- Information: 14 signs (IN series)

Each sign has: image, official code, name, meaning, what to do, and a Zimbabwean example.

### Oral Questions

**45 oral exam questions** extracted — these match the VID oral test format:
- Rules of the road: 22 questions
- Signs, robots and markings: 6 questions
- Vehicle and documents: 7 questions
- Safety and emergencies: 10 questions

### Interactive Diagrams

**28 step-through diagrams** covering:
- Intersections & junctions (5)
- Roundabouts (3)
- Lanes & turning (4)
- Overtaking (2)
- Crossings (2)
- Signs & signals (2)
- Parking (2)
- Road markings (1)
- Vehicle control (3)

### Vehicle Knowledge 360°

Interactive vehicle exploration with:
- Exterior walk-around (9 checkpoints)
- Engine bay (7 checkpoints)
- Dashboard (12 checkpoints)
- Safety equipment (2 checkpoints)
- Pre-drive check challenge
- 10-question vehicle knowledge quiz

### Other Features

- **Glossary**: 10 driving terms defined
- **Licence Guide**: Information about the licensing process
- **Driving Schools directory**: List of driving schools
- **Official documents**: Link to relevant legislation
- **Bookmarks**: Save questions for review
- **Progress tracking**: Device-local progress
- **Dark mode**: Supported
- **Notifications**: 5 unread mentioned (engagement feature)

---

## 3. UI/UX Analysis

### Strengths
- **Clean, modern design** — professional typography, good spacing, consistent color palette (green primary)
- **Mobile-first** — responsive layout works well on phones
- **Dark mode** — built in
- **Step-through diagrams** — animated SVG diagrams showing vehicle movement (very good for understanding right-of-way)
- **No account required** — zero friction to start
- **Offline support** — claimed
- **Vehicle Knowledge 360°** — interactive vehicle exploration with clickable markers (unique feature)
- **Sign library with official artwork** — 157 signs with proper Zimbabwean sign images
- **Topic locking** — must complete Road Rules before Road Signs (linear progression)
- **Quick practice** — immediate access to practice questions

### Weaknesses / Opportunities for Zivvvo
- **No adaptive learning** — every user sees the same content in the same order
- **No readiness score** — no indication of exam preparedness
- **No spaced repetition** — no evidence of intelligent review scheduling
- **No gamification** — no XP, streaks, or engagement mechanics
- **No AI** — no personalized explanations or coaching
- **Limited questions** — only ~133 practice questions vs Zivvvo's 1,396
- **No mock exam with timer** — has a 30-question test but not a realistic exam simulation
- **No weakness detection** — doesn't identify or target weak areas
- **Static content delivery** — learn → practice → test (no adaptation)
- **No progress analytics** — basic progress only (device-local)
- **No cross-device sync** — progress is device-local only
- **No explanations depth** — single explanation per question, no "explain like I'm 5" options

### UI Differences (Zivvvo vs ZimRoadWise)

| Feature | Zivvvo | ZimRoadWise |
|---------|--------|-------------|
| First screen | Personalized home with readiness % | Course catalog |
| Learning model | Adaptive, personalized path | Linear, same for everyone |
| Feedback | Immediate + explanation + "explain further" | Immediate + single explanation |
| Progress | Readiness score + mastery + streak | Basic completion % |
| Gamification | XP, streaks, levels, badges | None |
| Mock exam | 50 questions, 90min, realistic | 30 questions, 30min |
| Offline | Full offline-first (IndexedDB) | Claimed offline |
| Sign library | Images in questions | Full 157-sign library with artwork |
| Diagrams | Images in questions | 28 animated step-through SVGs |
| Vehicle knowledge | Not a separate module | Interactive 360° exploration |

---

## 4. Question Bank Comparison

| Metric | Zivvvo | ZimRoadWise |
|--------|--------|-------------|
| Total questions | **1,396** | ~133 practice + 45 oral |
| Questions with images | 446 (32%) | Limited (mostly sign images) |
| Oral exam questions | 0 (not a separate feature) | 45 |
| Sign identification | Not a separate feature | 157 signs in library |
| Explanations | 1,146 (82%) | Single per question |
| Difficulty levels | 3 (standard, tricky, hard) | Not apparent |
| Topic categories | 7 (junction-rules, road-signs, regulations, etc.) | 4 (Road Rules, Road Signs, Vehicle Knowledge, Defensive Driving) |

### Content Gap Analysis

**Zivvvo has MORE questions** (1,396 vs ~133) but:
- ZimRoadWise has **oral exam questions** (45) — Zivvvo does not
- ZimRoadWise has a **full sign library** (157 signs) — Zivvvo has sign images in questions but no dedicated library
- ZimRoadWise has **interactive diagrams** (28) — Zivvvo has static images
- ZimRoadWise has **Vehicle Knowledge 360°** — Zivvvo does not have this module
- ZimRoadWise has **defensive driving module** — Zivvvo covers this in general questions

---

## 5. Feature Comparison Matrix

| Feature | Zivvvo | ZimRoadWise | Winner |
|---------|--------|-------------|--------|
| Price | Freemium ($2-$12/mo) | Free | ZimRoadWise |
| Adaptive learning | Yes (personalized path) | No | **Zivvvo** |
| Readiness scoring | Yes (% score + band) | No | **Zivvvo** |
| Spaced repetition | Yes | No | **Zivvvo** |
| Gamification (XP, streaks) | Yes | No | **Zivvvo** |
| AI explanations | Yes (coming) | No | **Zivvvo** |
| AI coaching | Yes | No | **Zivvvo** |
| Question bank size | 1,396 | ~133 | **Zivvvo** |
| Explanations coverage | 82% | Unknown (single per Q) | **Zivvvo** |
| Mock exam | 50Q, 90min | 30Q, 30min | **Zivvvo** |
| Offline support | Full (IndexedDB) | Claimed | Tie |
| Cross-device sync | Yes (Supabase) | No (device-local) | **Zivvvo** |
| Sign library | No dedicated library | 157 signs with artwork | ZimRoadWise |
| Interactive diagrams | No | 28 animated SVGs | ZimRoadWise |
| Vehicle Knowledge 360° | No | Yes (interactive) | ZimRoadWise |
| Oral exam prep | No | 45 questions | ZimRoadWise |
| No account needed | No (Google sign-in) | Yes | ZimRoadWise |
| Dark mode | Yes | Yes | Tie |
| PWA installable | Yes | Unknown | Zivvvo |

---

## 6. Marketing Implications

### The Free Problem
ZimRoadWise is **free and well-made**. Any marketing that leads with "exam prep app" will invite the comparison "why should I pay?"

### Zivvvo's Defensible Position
Zivvvo is NOT a quiz app or an LMS. It is a **personal tutor that adapts to you**. The marketing must make this distinction crystal clear.

**Key differentiators to emphasize:**
1. **"It knows what you don't know"** — adaptive learning that targets weaknesses
2. **"It tells you when you're ready"** — readiness scoring (no other app does this)
3. **"It teaches, not just tests"** — AI explanations, coaching, "explain further"
4. **"It keeps you coming back"** — streaks, XP, gamification
5. **"It works everywhere"** — offline-first, cross-device sync
6. **"1,396 questions vs 133"** — 10x more content

### What Zivvvo Should NOT Claim
- Do NOT claim to be the only free option (it isn't free)
- Do NOT bash ZimRoadWise by name
- Do NOT claim to have more "features" — claim to have a better **approach**

### Positioning Statement
> "ZimRoadWise helps you study. Zivvvo helps you pass. The difference is that Zivvvo learns what you're weak on, teaches you until you understand, and tells you when you're actually ready — not just when you've finished the lessons."

---

## 7. Content Gaps Zivvvo Should Fill

### High Priority (competitive necessity)
1. **Oral exam questions** — ZimRoadWise has 45, Zivvvo has none. Add a dedicated oral exam prep feature.
2. **Road sign library** — ZimRoadWise has 157 signs with official artwork. Zivvvo should have a sign reference/browse feature.
3. **Vehicle knowledge module** — ZimRoadWise has interactive 360°. Zivvvo should at least have a vehicle knowledge section.

### Medium Priority (differentiation)
4. **Interactive diagrams** — ZimRoadWise has 28 animated SVGs. Zivvvo should improve its diagram content.
5. **Defensive driving module** — Make this a visible, structured module (currently buried in general questions).

### Lower Priority (already strong)
6. Zivvvo already has 1,396 questions (10x more) — don't need more questions, need better delivery
7. Zivvvo already has adaptive learning — this is the core differentiator
8. Zivvvo already has readiness scoring — no competitor has this

---

## 8. Recommended Actions

### Immediate (this week)
- [ ] Add oral exam questions to Zivvvo's question bank (45 questions from ZimRoadWise are public domain / Highway Code based)
- [ ] Create a "Road Signs" reference section with sign images (can use the 157 official sign codes as reference)
- [ ] Update marketing messaging to emphasize adaptive learning vs static LMS

### Short-term (this month)
- [ ] Add Vehicle Knowledge as a visible module/topic in the learning path
- [ ] Improve diagram quality (consider animated SVGs for right-of-way scenarios)
- [ ] Create comparison content: "Why Zivvvo vs free alternatives"

### Long-term
- [ ] Build a "Road Sign Quiz" feature (identify signs by image)
- [ ] Add interactive vehicle exploration (may need 3D models or detailed diagrams)
- [ ] Position Zivvvo as the "premium exam preparation" option — not competing on price, competing on results

---

## 9. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Users choose free ZimRoadWise over paid Zivvvo | **HIGH** | Emphasize adaptive learning, readiness scoring, AI coaching — things ZimRoadWise cannot do |
| ZimRoadWise adds adaptive features | MEDIUM | Move fast — Zivvvo's engine is already built, they'd need to build from scratch |
| Users use both (ZimRoadWise for free, Zivvvo for premium) | LOW | This is fine — Zivvvo should be the "serious preparation" tool |
| Content overlap causes confusion | LOW | Different branding, different positioning — "study companion" vs "personal tutor" |

---

## 10. Bottom Line

**ZimRoadWise is a well-built free product that covers the same syllabus.** It will capture users who want free, basic exam prep. Zivvvo cannot compete on price.

**Zivvvo's winning strategy**: Be the **personal tutor** that adapts, coaches, and tells you when you're ready. The user who wants to **pass** — not just study — will pay for Zivvvo.

The marketing must make the distinction crystal clear:
- ZimRoadWise = **study companion** (free, static, same for everyone)
- Zivvvo = **personal tutor** (adaptive, intelligent, tells you when you're ready)

Never compete on features. Compete on **approach**.
