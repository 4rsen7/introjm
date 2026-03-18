# Landing SEO Roadmap

## Purpose

This document fixes the working context for improving the SEO performance of the public marketing site on `https://iterojm.com`.

The goal is not just "get indexed", but to build a search-ready landing system that:

- is easy for Google to crawl and understand;
- has clean multilingual signals for English and Ukrainian;
- can rank for high-intent product queries;
- can expand into a content cluster without reworking the site architecture later.

This roadmap applies only to the public landing/legal pages on `iterojm.com`.

It does **not** cover:

- `app.iterojm.com`
- `admin.iterojm.com`
- PDF export
- Google OAuth integration

## Current State

### Already implemented

- Public landing pages are split by language:
  - `/en`
  - `/uk`
- Legal pages are split by language:
  - `/en/terms`
  - `/uk/terms`
  - `/en/privacy`
  - `/uk/privacy`
- Root domain redirects:
  - `/` -> `/en`
- Legacy landing/legal paths redirect to the new localized URLs.
- `canonical` and `hreflang` are already added for landing and legal pages.
- Domain is already verified in Google Search Console.

### Current gaps found in codebase

- No dedicated SEO landing pages for enough high-intent search queries yet
- Current home page copy is strong for design/brand, but still under-optimized for search intent coverage

### Progress snapshot

- `robots.txt` is added
- `sitemap.xml` is added
- Landing and legal pages now have page-specific metadata
- Open Graph / Twitter cards are added for landing and legal pages
- Structured data is added for landing and initial SEO pages
- Initial dedicated SEO pages already started:
  - `/en/persona-management-software`
  - `/uk/persona-management-software`
  - `/en/customer-research-repository`
  - `/uk/customer-research-repository`
  - `/en/customer-journey-map-software`
  - `/uk/customer-journey-map-software`
  - `/en/interview-transcription-and-insights`
  - `/uk/interview-transcription-and-insights`
  - `/en/journey-metrics-dashboard`
  - `/uk/journey-metrics-dashboard`

## Primary SEO Goals

### Goal 1: Technical discoverability

Make sure Google can crawl, understand, and index the correct landing and legal pages.

### Goal 2: Search relevance

Make sure each important page clearly signals:

- what the product is;
- who it is for;
- what jobs it solves;
- what adjacent intents it belongs to.

### Goal 3: Expansion path

Create a structure that supports additional SEO pages and content later without another URL migration.

## Target URL Strategy

### Primary public URLs

- `https://iterojm.com/en`
- `https://iterojm.com/uk`
- `https://iterojm.com/en/terms`
- `https://iterojm.com/uk/terms`
- `https://iterojm.com/en/privacy`
- `https://iterojm.com/uk/privacy`

### Canonical strategy

- English pages canonicalize to `/en` versions
- Ukrainian pages canonicalize to `/uk` versions
- `x-default` should point to English for now

### Future SEO page structure

- `/en/customer-journey-map-software`
- `/en/journey-mapping-tool`
- `/en/persona-management-software`
- `/en/interview-insights-software`
- `/en/jtbd-research-tool`
- `/en/service-design-software`
- Ukrainian equivalents under `/uk/...`

## Implementation Phases

## Phase 1: Technical SEO foundation

### Objective

Create the minimum technical baseline required for healthy indexing and search appearance.

### Tasks

1. Add `robots.txt`
   - allow public landing and legal pages
   - reference sitemap URL
   - ensure we do not accidentally expose non-public app/admin paths through the landing host

2. Add `sitemap.xml`
   - include all current public URLs
   - include `lastmod` where practical
   - keep format ready for future SEO pages

3. Add page-specific metadata
   - landing EN title
   - landing UK title
   - landing EN meta description
   - landing UK meta description
   - terms/privacy titles and descriptions for both languages

4. Add social metadata
   - Open Graph title/description/url/image
   - Twitter title/description/image

5. Add structured data
   - `Organization`
   - `WebSite`
   - `SoftwareApplication` if wording stays honest to the actual product

6. Verify resulting page source
   - no duplicate canonical tags
   - correct `hreflang`
   - correct `lang`
   - correct canonical URL per page

### Acceptance criteria

- `https://iterojm.com/robots.txt` exists and is valid
- `https://iterojm.com/sitemap.xml` exists and is valid
- `/en`, `/uk`, `/en/terms`, `/uk/terms`, `/en/privacy`, `/uk/privacy` all expose stable titles and descriptions
- landing pages expose valid canonical and alternate `hreflang`

## Phase 2: Search-intent copy refinement

### Objective

Make the existing landing page understandable not just to humans, but also to Google and to users with high-intent product searches.

### Tasks

1. Refine hero and section copy around search language
   - naturally include phrases around:
     - customer journey map software
     - journey management platform
     - personas and metrics
     - interview insights
     - product and CX collaboration

2. Avoid overpromising
   - keep copy aligned with current product reality
   - do not claim workflow automation or realtime multiplayer if not actually shipped

3. Improve section semantics
   - ensure clean heading hierarchy:
     - one H1
     - logical H2 sections
     - optional H3 subsections

4. Make language versions parallel
   - English and Ukrainian pages should describe the same product intent
   - not necessarily word-for-word, but semantically aligned

### Acceptance criteria

- landing copy remains premium and strong
- core commercial keywords appear naturally
- no major product overclaims
- heading structure is clean and crawl-friendly

## Phase 3: Dedicated SEO pages

### Objective

Expand beyond one home page so Google can rank the site for more than just branded queries.

### Initial candidate pages

#### English

- `customer-journey-map-software`
- `interview-transcription-and-insights`
- `journey-metrics-dashboard`
- `persona-management-software`
- `customer-research-repository`

#### Ukrainian

- direct localized equivalents under `/uk/...`

### Per-page requirements

- unique title
- unique meta description
- unique H1
- problem/solution framing
- product screenshots or relevant visuals
- internal links to landing and related pages
- FAQ section where useful
- honest mapping to existing product capabilities

### Acceptance criteria

- at least 3 strong EN pages and 3 UK pages published
- all included in sitemap
- all internally linked from at least one crawlable page

### Current status

- `customer-journey-map-software`: implemented in EN and UK
- `interview-transcription-and-insights`: implemented in EN and UK
- `journey-metrics-dashboard`: implemented in EN and UK
- `persona-management-software`: implemented in EN and UK
- `customer-research-repository`: implemented in EN and UK
- internal linking pass implemented:
  - landing now links into the first-wave SEO pages through a dedicated deep-dive section
  - each first-wave SEO page links to the other related feature pages
- next recommended work:
  - submit and request indexing for the new URLs
  - consider second-wave pages such as `journey-mapping-tool`, `jtbd-research-tool`, `service-design-software`

## Phase 4: Search Console workflow

### Objective

Turn SEO from a one-time launch into an operating loop.

### Tasks

1. Submit sitemap in Search Console
2. Request indexing for key URLs:
   - `/en`
   - `/uk`
   - legal pages
   - each new SEO landing page

3. Monitor:
   - indexing status
   - impressions
   - queries
   - CTR
   - top pages

4. Adjust based on real query data
   - improve titles
   - improve descriptions
   - create pages for emerging search terms

### Acceptance criteria

- sitemap submitted
- key public URLs indexed
- Search Console starts showing non-branded impressions over time

## Phase 5: Content cluster growth

### Objective

Increase long-tail discoverability and support the product pages with supporting content.

### Candidate content types

- comparisons:
  - IteroJM vs Smaply
  - IteroJM vs Miro for journey mapping
- use-case pages:
  - for product teams
  - for service designers
  - for UX researchers
- educational content:
  - how to build a customer journey map
  - JTBD interview analysis workflow
  - how to connect research and metrics in one workspace

### Acceptance criteria

- content supports commercial pages instead of cannibalizing them
- internal linking graph becomes richer

## Technical Notes For Implementation

### Files likely to be touched

- `/Users/avrdnn/Desktop/iterojm/iterojm/client/src/pages/LandingPage.jsx`
- `/Users/avrdnn/Desktop/iterojm/iterojm/client/src/pages/TermsPage.jsx`
- `/Users/avrdnn/Desktop/iterojm/iterojm/client/src/pages/PrivacyPage.jsx`
- `/Users/avrdnn/Desktop/iterojm/iterojm/client/src/App.jsx`
- `/Users/avrdnn/Desktop/iterojm/iterojm/client/index.html`
- `/Users/avrdnn/Desktop/iterojm/iterojm/client/public/robots.txt`
- `/Users/avrdnn/Desktop/iterojm/iterojm/client/public/sitemap.xml`
- `/Users/avrdnn/Desktop/iterojm/iterojm/server/index.js`

### Important constraints

- Do not introduce SEO route logic into `app.iterojm.com`
- Keep app/admin excluded from public search positioning
- Keep landing metadata honest to real product features

## Risks

- Over-optimizing one landing page for too many keywords can weaken clarity and conversions
- Creating SEO pages with claims not supported by the product may hurt trust
- Duplicate metadata across EN and UK pages can reduce SEO quality
- Forgetting to update sitemap when new SEO pages ship will slow discovery

## Recommended Work Order

1. Phase 1: technical SEO foundation
2. Phase 2: landing copy refinement for search intent
3. Phase 3: first wave of dedicated SEO pages
4. Phase 4: Search Console monitoring loop
5. Phase 5: content cluster expansion

## Definition of Success

This work is successful when:

- Google reliably indexes both EN and UK landing/legal pages
- the site has a valid sitemap and crawl instructions
- the landing has strong titles/descriptions and structured metadata
- the site begins to rank for non-branded product-intent queries
- new SEO pages can be added without reworking architecture again

## Next Action

When resuming this work, start with Phase 1:

- create `robots.txt`
- create `sitemap.xml`
- add landing/legal page titles and meta descriptions
- add structured data
