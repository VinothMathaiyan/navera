# NAVERA WEBSITE — MASTER SPECIFICATION

**Document status:** LOCKED FOUNDATION  
**Version:** 1.0  
**Purpose:** Single source of truth for the Navera Ordering Site  
**Primary builder:** Claude — developer / implementation agent  
**Product reviewer:** ChatGPT — business reviewer, UX reviewer, tester, and product decision partner

---

## 1. Purpose of This Document

This document is the single source of truth for the Navera Ordering Site.

It should be included in the project instructions/context for both Claude and ChatGPT.

Claude is responsible for **building and implementing** the product.

ChatGPT is responsible for **reviewing the business logic, customer experience, UX, operational workflow, testing strategy, and proposed changes**.

Both agents must use this document before making recommendations or changes.

### Core business objective

The website exists primarily to:

1. Make the second, third, fifth, and twentieth order effortless.
2. Reduce manual WhatsApp nudging.
3. Allow customers to order directly without needing assistance.
4. Support customers who still prefer WhatsApp.
5. Put website orders, WhatsApp orders, and weekly deliveries into one database.
6. Give Gowri a reliable production and milk forecast.
7. Make weekly repeat delivery easy without requiring manual follow-up.

The website is **not** being built merely to have a website.

---

# 2. Roles of the AI Agents

## Claude — Builder / Developer

Claude is the primary implementation agent.

Claude should:

- Build the website and supporting systems.
- Implement the agreed UX and business rules.
- Create and maintain the database/schema.
- Implement authentication and security.
- Build the customer experience.
- Build the admin/Gowri experience.
- Implement WhatsApp deep links.
- Implement ordering, reordering, weekly delivery, skip/pause, and forecasting.
- Test the implementation technically.
- Fix bugs discovered during testing.
- Avoid adding features outside the agreed scope without asking.

Claude must not silently change a locked business rule.

If a technical implementation conflicts with a business rule, Claude should surface the conflict before proceeding.

---

## ChatGPT — Business Reviewer / UX Reviewer / Tester

ChatGPT is the independent product reviewer.

ChatGPT should:

- Review product decisions from the customer's perspective.
- Review business logic and operational practicality.
- Review UX and reduce unnecessary friction.
- Challenge unnecessary complexity.
- Review proposed features against the core business objective.
- Create test scenarios and edge cases.
- Review screenshots, flows, and implementation results.
- Identify risks and gaps.
- Review whether the system actually reduces manual work.
- Review whether Gowri can operate the system easily.
- Review whether production/milk forecasting is trustworthy.
- Suggest improvements without unnecessarily expanding scope.

ChatGPT should not act as the primary developer unless explicitly asked.

---

# 3. Locked Product Principles

These principles are foundational.

## Principle 1 — The site exists to make repeat ordering effortless

The first order can happen through WhatsApp.

The website's greatest value is making future orders easy.

The ideal progression is:

**First order → Order Again → Weekly Delivery**

---

## Principle 2 — The website must never feel like an app

The customer experience should feel like a short, simple conversation.

Avoid:

- Account creation
- Passwords
- OTP login
- Complicated carts
- Unnecessary dashboards
- Long forms
- Unnecessary screens
- Overly complex checkout flows

The customer should be able to order quickly from a mobile phone.

---

## Principle 3 — WhatsApp ordering never goes away

WhatsApp remains a permanent supported ordering channel.

Some customers will always prefer:

> "Anna, 500g tomorrow."

That is acceptable.

Gowri must be able to enter a WhatsApp order into the system quickly.

**Website + WhatsApp + Weekly Delivery must all feed the same order database.**

---

## Principle 4 — One cutoff governs everything

The same cutoff applies to:

- New orders
- Changing an order
- Increasing/decreasing quantity
- Skipping a delivery
- Modifying weekly delivery

There should be one simple rule for customers to remember.

The cutoff protects the accuracy of the production and milk forecast.

---

## Principle 5 — MVP does not mean insecure

Security is required from the beginning.

Do not postpone security until after launch.

---

# 4. Navera Brand Context

Navera is a small-scale premium fresh paneer brand.

Core positioning:

- Freshly prepared
- Prepared after the customer orders
- Country Cow Milk
- Milk + Lemon
- No preservatives
- No vinegar
- No artificial additives
- No chemicals
- Handmade / small batch
- Farm-to-home / village freshness
- Natural protein
- Honest and transparent food preparation

Brand feeling:

> Fresh homemade paneer directly from a trusted village source.

Communication should feel:

- Trustworthy
- Natural
- Premium but simple
- Warm
- Local
- Honest
- Transparent
- Modern-traditional balance

Avoid:

- Fake marketing claims
- Over-promising
- Artificial mass-brand language
- Aggressive sales language
- Unnecessary hype

The website must reinforce trust and freshness rather than looking like a generic ecommerce store.

---

# 5. Current Products and Pricing

Current confirmed packs:

| Pack | Price |
|---|---:|
| 200g | ₹170 |
| 500g | ₹390 |

Do not change prices without explicit business approval.

If pricing changes later, update the locked business rules intentionally.

---

# 6. Customer Journey

The intended customer journey is:

**Discovery**
→ Website / WhatsApp / Instagram / QR / catalogue

**First order**
→ Simple order flow

**Delivery**
→ Fresh paneer prepared after order

**Repeat**
→ Order Again

**Regular customer**
→ Weekly Delivery

**Flexible customer**
→ Change / Skip / Pause when needed

---

# 7. Customer Website

The site should be mobile-first.

## Home / Landing Page

Core message:

> Fresh Paneer. Prepared After You Order.

Supporting trust points:

- Country Cow Milk
- Milk + Lemon, nothing else
- No Preservatives
- Prepared After You Order

Primary CTA:

**Order Fresh Paneer**

Secondary CTA:

**WhatsApp Us**

---

## Ordering Flow

The order page should feel conversational.

Example structure:

### What would you like?

**200g — ₹170**

**500g — ₹390**

### How many?

Quantity selector.

### Where should we deliver?

- Name
- WhatsApp number
- Community / apartment
- Flat / block

Community should be selected from an approved delivery-area list.

Do not use free-text delivery areas when a controlled list is possible.

If the community is unavailable:

> Not listed? WhatsApp us.

---

## Order Summary

Show:

- Product
- Quantity
- Delivery date
- Price
- Delivery charge, if applicable
- Total

Primary CTA:

**Confirm Fresh Paneer**

---

# 8. Delivery Rules

These must be explicitly decided before launch:

- Delivery days
- Cutoff time
- Delivery window
- Delivery areas
- Minimum order
- Delivery charge
- What happens after cutoff
- Replacement policy

Do not invent these rules.

If a rule has not yet been decided, mark it as **TBD / Business Decision Required**.

---

# 9. Cutoff Behaviour

Before cutoff:

> Order before [cutoff] for tomorrow's fresh delivery.

Near cutoff:

> Orders close in [X] minutes.

After cutoff:

> Tomorrow's orders are closed. You can order for the next available delivery day.

The same cutoff must govern:

- Order
- Change
- Skip
- Weekly Delivery modifications

---

# 10. Order Sources

Every order must record its source.

Initial source categories:

- Website
- WhatsApp
- Instagram
- QR
- Manual
- Weekly Delivery

Do not rely on assumptions about where an order originated.

This enables later measurement of:

- Website adoption
- WhatsApp dependency
- Repeat ordering
- Marketing source effectiveness

---

# 11. WhatsApp Architecture

The first version should use WhatsApp deep links rather than the official WhatsApp Cloud API.

## Customer → Navera

Use a WhatsApp link that opens a conversation with pre-filled text.

Example use cases:

- Questions
- Help before ordering
- Community not listed
- General enquiries

---

## Admin → Customer

Each order should provide one-tap WhatsApp actions.

Initial actions:

- Confirm
- Dispatch
- Feedback
- Delivery reminder

The message should be pre-filled with relevant information:

- Customer name
- Order reference
- Quantity
- Delivery date

Gowri reviews the message and presses Send.

This is intentionally human-controlled.

---

## WhatsApp → Website

The following should eventually point to the ordering page:

- WhatsApp Business catalogue
- wa.link
- Instagram bio
- QR codes
- Other Navera promotional links

---

## WhatsApp Cloud API

Out of scope for the initial MVP.

Consider only when business volume makes manual messaging meaningfully painful and the benefits justify:

- Meta business verification
- Template approval
- API setup
- Message costs
- Additional complexity

---

# 12. Manual WhatsApp Order Entry

This is a mandatory Week 1 feature.

Gowri must be able to take:

> "Anna, 500g tomorrow."

and enter it into the database quickly.

Target:

**Approximately 15–20 seconds for an existing customer.**

Suggested flow:

### + WhatsApp Order

Phone number

→ Existing customer automatically identified

Delivery date

Product / quantity

Community / flat if needed

**Add Order**

The order is automatically tagged:

**source = WhatsApp**

For new customers, capture:

- Name
- WhatsApp number
- Community
- Flat / block

This ensures all WhatsApp orders appear in the production forecast.

---

# 13. Admin / Gowri Dashboard

The admin view should be operationally useful, especially early in the morning.

Top-level view should show:

### Tomorrow's Production

**Paneer required: X kg**

**Milk required: Y litres**

Also show:

- Number of orders
- 200g quantities
- 500g quantities
- Weekly Delivery orders
- One-time orders
- WhatsApp orders
- Website orders

---

## Production Forecast

The milk-per-paneer-yield assumption must be editable.

Initial planning assumption:

**8.5 litres milk / 1 kg paneer**

This number is not permanently fixed.

It must be editable because actual yield may change with:

- Milk source
- Season
- Batch
- Pressing method
- Production conditions

Forecasts must use the current configured yield.

---

## Seven-Day Forecast

Admin should eventually show:

| Date | Paneer Needed | Milk Needed |
|---|---:|---:|
| Day 1 | X kg | Y L |
| Day 2 | X kg | Y L |
| Day 3 | X kg | Y L |

The forecast combines:

- One-time orders
- Weekly deliveries
- WhatsApp-entered orders

---

# 14. Order Again

This is one of the highest-priority customer features.

After a customer has ordered, the next order should be extremely easy.

Example:

> Your last order  
> **500g Fresh Paneer — ₹390**
>
> **[Order the Same Again]**

The customer's private link should land directly on the reorder action rather than forcing them to navigate through order history.

---

# 15. Customer Private Link

Customers do not need accounts.

Instead, the confirmation can provide a private URL such as:

`navera.in/my/<long-random-token>`

The token:

- Must be long
- Must be cryptographically random
- Must not be guessable
- Must be revocable
- Must only expose that customer's permitted information

Anyone possessing the link may be able to access the information, so the link must be treated as a private credential.

The initial landing experience should prioritize:

**Order Again**

Then show:

- Upcoming orders
- Previous orders
- Weekly Delivery
- Change / Skip options

---

# 16. Change Tomorrow's Order

Customers should be able to change an upcoming order before cutoff.

Example:

> Tomorrow's order  
> 500g
>
> **[Change Quantity]**
> **[Skip Tomorrow]**

Changes close at the same cutoff as new orders.

After cutoff:

> Changes for tomorrow are closed.

---

# 17. Weekly Delivery

Do not call this feature "Subscription" in customer-facing copy.

Use:

**Fresh Paneer, Every Week**

Example:

> Choose your delivery day once.  
> We'll prepare your paneer fresh for you each week.

Customer chooses:

- Delivery day
- Pack size
- Quantity

Then deliveries generate automatically.

---

# 18. Skip / Pause / Cancel

Customers must be able to:

- Skip one delivery
- Pause deliveries
- Cancel weekly delivery

Skipping must be easy.

A customer who cannot skip easily may cancel instead.

Skip actions follow the same cutoff rule as ordering.

---

# 19. Weekly Delivery Discount

A possible ₹10/pack incentive may be tested.

This is **not a locked business rule**.

Treat it as an experiment.

Evaluate:

- Margin impact
- Weekly delivery adoption
- Reduced manual nudging
- Forecast reliability
- Customer retention

Do not implement a discount without explicit approval.

---

# 20. Confirmation / Dispatch / Feedback

Initial admin WhatsApp actions:

### Confirm

Customer receives confirmation that the order is accepted.

### Dispatch

Customer is informed that the paneer has been dispatched / is on its way.

### Feedback

Customer receives a feedback request after delivery.

Existing Navera message wording should be reused where possible to maintain voice consistency.

---

# 21. Delivery Reminder

An admin reminder can be prepared the evening before delivery.

Example concept:

> Your Navera paneer will be prepared fresh tonight for tomorrow morning.

This should initially remain human-controlled:

**Gowri taps → reviews → sends.**

---

# 22. Customer Experience Rules

The site should:

- Load quickly
- Work well on mobile
- Have obvious CTAs
- Minimize typing
- Use large touch-friendly controls
- Show price clearly
- Show delivery expectations clearly
- Make cutoff visible
- Make WhatsApp easy to find
- Avoid unnecessary navigation
- Avoid forcing account creation

The customer should always understand:

1. What am I buying?
2. How much does it cost?
3. When will I receive it?
4. What do I need to do next?

---

# 23. Security Requirements

Mandatory:

- Supabase Auth for admin access
- Row Level Security on every relevant table
- No unauthenticated admin access
- Customer data must not be exposed across customers
- Private customer tokens must be long, random and revocable
- No card/payment information stored in Navera's database
- Payment gateways handle payment information when online payments are eventually introduced

Security must be tested before launch.

---

# 24. Technical Direction

Initial technical approach:

- Frontend: modern React/Next.js-style web application, as selected by the implementation agent
- Database: Supabase
- Hosting: Vercel
- WhatsApp: deep links initially
- Authentication: Supabase Auth for admin
- Database security: Supabase RLS

The exact implementation can evolve if there is a strong technical reason, but the business behaviour must remain consistent.

---

# 25. Initial Database Concepts

Keep the initial schema lean.

Core concepts:

- customers
- delivery_areas
- orders
- subscriptions / weekly deliveries
- settings

Additional tables may be introduced when genuinely required.

Do not create unnecessary complexity for theoretical future requirements.

---

# 26. Order Reference

Orders should use the Navera reference format, for example:

**NAV-042**

The reference should connect consistently with:

- Existing Excel tracker
- Feedback form
- Customer communications
- Admin records

---

# 27. Feedback

Post-delivery feedback should connect to the existing Microsoft Forms feedback workflow where appropriate.

Order reference should be passed through so feedback can be associated with the order.

---

# 28. Data Export and Backup

The system should eventually provide one-click export of:

- Orders
- Customers

The business should never become dependent on the website without access to its operational data.

---

# 29. Testing Strategy

Testing must include both technical and real-world testing.

## Order tests

1. Normal 200g order
2. Normal 500g order
3. Multiple packs
4. Wrong / short phone number
5. Empty name
6. Past delivery date
7. Order after cutoff
8. Community outside delivery list
9. Duplicate order
10. Browser closed halfway through

## Operational tests

11. WhatsApp order entered by Gowri
12. Existing customer auto-recognised
13. New WhatsApp customer created
14. WhatsApp order appears in forecast
15. Website order appears in forecast
16. Weekly delivery appears in forecast
17. Skip changes forecast
18. Quantity change changes forecast
19. Cutoff prevents late changes
20. Seven-day forecast is correct

## Security tests

21. Unauthenticated admin access blocked
22. Customer A cannot access Customer B's information
23. Invalid/private token rejected
24. Revoked token rejected
25. Database policies tested

---

# 30. Real-World Validation

The most important testing is with actual customers.

Initial soft launch:

**Three trusted customers.**

Do not guide them while they use the site.

Observe:

- Where they hesitate
- What they misunderstand
- What they expect to click
- Whether they complete the order
- Whether they return to WhatsApp
- Whether Order Again is intuitive

Customer confusion is product data.

---

# 31. Success Metrics

Do not judge success by:

- Number of pages
- Number of features
- Website traffic
- Animations
- Technical sophistication

Primary success milestones:

### Milestone 1

A customer who bought 500g this Saturday can order the same next Saturday without Navera manually messaging them.

### Milestone 2

The customer can convert to Weekly Delivery and skip a week without contacting Navera.

### Milestone 3

Gowri can see tomorrow's paneer and milk requirement without manually counting WhatsApp messages.

---

# 32. Manual Nudging Metric

If possible, establish a baseline before launch:

- Number of orders per day/week
- Number of reminder messages initiated by Navera

Then measure after launch:

**Manual nudges avoided**

This is one of the most meaningful measures of whether the website is solving the original problem.

---

# 33. Feature Priority

## P0 — Must Have

- Mobile-first ordering
- Product selection
- Delivery rules
- Cutoff logic
- Customer details
- Order database
- Admin authentication
- RLS
- Admin order list
- Manual WhatsApp order entry
- WhatsApp deep links
- Production calculation
- Milk forecast
- Order source tracking
- Order references

## P1 — High Value

- Order Again
- Private customer link
- Change upcoming order
- Skip
- Pause
- Weekly Delivery
- Seven-day forecast
- Delivery reminder
- Feedback integration
- Export

## P2 — Later

- Online payment
- Referral flow
- Articles / SEO
- WhatsApp Cloud API
- Loyalty points
- Advanced customer accounts
- Delivery slot selection
- Animations

Do not move P2 features into P0/P1 without a business reason.

---

# 34. Deliberately Postponed

Do not prioritize:

- Blog/SEO
- Online payments
- WhatsApp Cloud API
- Referral system
- Loyalty points
- Password-based customer accounts
- Multiple delivery time slots
- Fancy animations

These do not solve the current core problem faster than the basic ordering/reordering/forecasting loop.

---

# 35. Business Decision Rules

The following must be explicitly confirmed before implementation:

- Domain
- Delivery days
- Cutoff time
- Delivery communities
- Delivery window
- Minimum order
- Delivery charge
- After-cutoff behaviour
- Replacement policy
- Weekly Delivery days
- Weekly Delivery skip rule
- Weekly Delivery missed-delivery rule
- Weekly Delivery pricing/discount

If not decided, label as:

**BUSINESS DECISION REQUIRED**

Never silently invent a rule.

---

# 36. Change Management

This document contains three categories.

## LOCKED

Business rules and product principles that should not change casually.

Changing a locked item requires explicit business approval.

## FLEXIBLE

UX, layout, copy, technical implementation, and visual design can change based on testing.

## EXPERIMENT

Ideas being tested, such as:

- Weekly discount
- New CTA wording
- Alternative reorder presentation
- Marketing source experiments

Experiments should not become permanent rules without evidence.

---

# 37. AI Behaviour Rules

Both Claude and ChatGPT should:

1. Read this document before making major product decisions.
2. Respect locked business rules.
3. Identify conflicts instead of silently resolving them.
4. Avoid unnecessary feature expansion.
5. Prefer the simplest solution that solves the business problem.
6. Preserve Navera's trust-based brand voice.
7. Consider the realities of a small fresh-food operation.
8. Prioritize mobile customer experience.
9. Consider Gowri's operational workflow.
10. Consider production and milk forecasting whenever order logic changes.
11. Distinguish facts, assumptions, experiments, and recommendations.
12. Do not claim a feature works until it has been tested.
13. Do not change prices, delivery rules, or policies without explicit approval.
14. When reviewing a proposed feature, ask: **Does this reduce friction or manual work?**
15. When in doubt, prefer a smaller MVP.

---

# 38. ChatGPT Review Checklist

When ChatGPT reviews a new feature or implementation, consider:

### Customer

- Is it easier?
- Is it understandable?
- Does it reduce typing?
- Does it work naturally on mobile?
- Does it preserve trust?
- Does it make WhatsApp available when needed?

### Business

- Does it reduce manual work?
- Does it support repeat ordering?
- Does it improve forecast accuracy?
- Does it fit Navera's production constraints?
- Does it introduce unnecessary cost?

### Operations

- Can Gowri use it quickly?
- Does it work at 5 AM?
- Does it handle WhatsApp orders?
- Does it handle exceptions?
- Does it maintain accurate production numbers?

### Security

- Is customer data protected?
- Is admin access protected?
- Are customer links private?
- Could one customer see another customer's data?

### Scope

- Is this actually needed now?
- Is it P0, P1, or P2?
- Is it a genuine business need or feature creep?

---

# 39. Claude Implementation Checklist

Before considering a feature complete:

- Business rule confirmed
- UX implemented
- Mobile tested
- Database behaviour tested
- RLS/security tested
- Cutoff behaviour tested
- WhatsApp behaviour tested where applicable
- Admin workflow tested
- Forecast impact tested
- Error states handled
- Edge cases tested
- No unrelated features added

---

# 40. Current Build Philosophy

Build in small increments.

Recommended sequence:

**Foundation**
→ **First order**
→ **Admin + WhatsApp entry**
→ **Production forecast**
→ **Order Again**
→ **My Navera**
→ **Change / Skip**
→ **Weekly Delivery**
→ **Seven-day forecast**
→ **Operational hardening**

Do not attempt to build the entire product before testing with real customers.

---

# 41. The 28-Day Build Plan

The current agreed build sequence is:

## Week 1 — First real order

- Freeze business rules
- Supabase + security
- Ordering page
- Trust block
- Cutoff logic
- Admin view
- Manual WhatsApp order entry
- Production forecast
- WhatsApp actions
- Deploy
- Test
- Soft launch with three customers

## Week 2 — Repeat ordering

- Fix real-world issues
- Order Again
- My Navera
- Change upcoming order
- Connect domain
- Publish links
- Measure source and behaviour

## Week 3 — Weekly Delivery

- Define weekly rules
- Build Weekly Delivery
- Skip
- Pause
- Cancel
- Seven-day production forecast
- Test complete cycle
- Convert regular customers

## Week 4 — Operational maturity

- Delivery reminder
- Compliance footer
- Existing system integration
- Feedback integration
- Export / backup
- Security review
- Full rehearsal
- Month 2 decision

---

# 42. Month 2 Decision Framework

At Day 28, review:

- Orders by source
- Active Weekly Deliveries
- Order Again usage
- Manual WhatsApp order volume
- Manual reminder messages
- Forecast accuracy
- Milk actually purchased vs forecast
- Customer feedback
- Operational effort

Then select **one** major next investment.

Possible choices:

- Online payment
- Articles / SEO
- Referral flow
- Nothing new; continue operating

Doing nothing new is a valid decision.

---

# 43. Final Product Definition

The Navera Ordering Site is successful when:

> **A customer can order fresh paneer without needing Navera to manually nudge them.**

And:

> **A repeat customer can reorder or receive fresh paneer every week without repeatedly contacting Navera.**

And:

> **Gowri can see exactly what needs to be prepared and how much milk is needed, regardless of whether orders arrived through the website or WhatsApp.**

Everything else is secondary.

---

## Change Log

### Version 1.0 — Locked Foundation

Based on the agreed Navera 28-Day Build Plan and subsequent product review.

Key decisions incorporated:

- Website as repeat-order engine
- WhatsApp remains supported
- One database for all order channels
- Manual WhatsApp order entry
- One cutoff for order/change/skip
- Order Again
- Private customer link
- Change upcoming order
- Weekly Delivery
- Skip/Pause
- Production and milk forecasting
- Security/RLS from Day 1
- ChatGPT as reviewer/tester
- Claude as builder/developer
- Deliberate postponement of non-essential features
