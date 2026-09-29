# PDF Export Polish Plan

## Context

We already implemented a new server-side PDF export MVP for journey maps.

Current state:
- export is generated on the backend via Playwright/Chromium
- export document is rendered through a signed export route
- PDF is now generated as a single page
- editor still has a fallback to the legacy browser-side export flow

Main remaining issue:
- metric/chart cards can show `Recharts` sizing warnings during export render
- PDF generation succeeds, but chart rendering needs polishing for more stable and predictable output quality

## Goal

Bring PDF export quality closer to Smaply-level stability for large journey maps, with special focus on metric/chart blocks.

## Problem Statement

During export rendering, some metric cards rely on responsive chart containers that do not always receive stable width/height values in the headless export environment.

Observed symptom:
- `Recharts` warns that container `width(-1)` and `height(-1)` are invalid

Risk:
- charts may render inconsistently
- labels or bars may shift
- some chart blocks may appear visually weaker than the rest of the exported map

## Desired Outcome

Exported PDF should:
- stay single-page for one-map exports
- render chart blocks without `Recharts` size warnings
- preserve visual layout consistently in headless mode
- keep readable labels and chart proportions
- remain compatible with large maps

## Scope

In scope:
- journey map PDF export rendering
- metric cards used inside journey map export
- export-specific chart sizing strategy
- export-only layout adjustments if needed

Out of scope:
- async export job queue
- storage/download history
- multi-format export options
- interview/persona/metric standalone PDF reports

## Likely Root Cause

`JourneyMetricCard` currently uses `ResponsiveContainer` from `Recharts`.

This is good for interactive UI, but in export/headless rendering:
- parent size can be unresolved at the moment charts mount
- export DOM uses `inline-flex / w-max` layout
- some chart containers resolve late or ambiguously

As a result, the interactive chart layout model is not always ideal for deterministic PDF rendering.

## Recommended Implementation Strategy

### Phase 1: Export-Safe Chart Rendering

Introduce an export-aware chart mode for journey metric cards.

Plan:
- add an `isExport` prop to [JourneyMetricCard.jsx](/Users/avrdnn/Desktop/iterojm/iterojm/client/src/components/journey/JourneyMetricCard.jsx)
- pass `isExport` through export rendering path only
- for export mode, replace fully responsive chart sizing with fixed explicit dimensions

Recommended approach:
- keep current responsive behavior for normal app usage
- use deterministic width/height values for export mode

Examples:
- line/area chart export height: fixed
- bar chart export height: fixed
- pie/donut chart export height and legend area: fixed

### Phase 2: Export Layout Stabilization

Ensure export layout provides charts with stable bounding boxes.

Plan:
- review export container styles in [JourneyExportPage.jsx](/Users/avrdnn/Desktop/iterojm/iterojm/client/src/pages/JourneyExportPage.jsx)
- ensure metric cards render in containers with explicit pixel width/height in export mode
- if needed, add export-only classnames or data attributes for chart wrappers

### Phase 3: Visual Quality Pass

Tune chart rendering for readability inside PDF.

Plan:
- verify font sizes for axis labels, value labels, legends
- verify truncation rules for long labels
- verify pie/donut legend spacing
- verify bar label contrast and clipping
- verify line/area chart label overlap

## Detailed File-Level Plan

### 1. Journey metric rendering

Primary file:
- [JourneyMetricCard.jsx](/Users/avrdnn/Desktop/iterojm/iterojm/client/src/components/journey/JourneyMetricCard.jsx)

Expected changes:
- add `isExport = false` prop
- define export-specific fixed dimensions per chart type
- avoid relying purely on `ResponsiveContainer` in export mode
- optionally swap to direct `width` / `height` props for chart components during export

Possible implementation pattern:
- normal mode:
  - keep `ResponsiveContainer`
- export mode:
  - render chart with explicit numeric width/height
  - wrap in fixed-size container

### 2. Journey card pass-through

Primary file:
- [JourneyCard.jsx](/Users/avrdnn/Desktop/iterojm/iterojm/client/src/components/journey/JourneyCard.jsx)

Expected changes:
- allow `JourneyCard` to receive/pass export context if needed
- forward `isExport` to metric card rendering

### 3. Text lane pass-through

Primary file:
- [TextLane.jsx](/Users/avrdnn/Desktop/iterojm/iterojm/client/src/components/journey/TextLane.jsx)

Expected changes:
- pass export mode down where needed

### 4. Journey map export view

Primary files:
- [JourneyMapView.jsx](/Users/avrdnn/Desktop/iterojm/iterojm/client/src/components/journey/JourneyMapView.jsx)
- [JourneyExportPage.jsx](/Users/avrdnn/Desktop/iterojm/iterojm/client/src/pages/JourneyExportPage.jsx)

Expected changes:
- pass export context down the tree
- add any export-only stable sizing wrappers if needed

### 5. Optional server-side tuning

Primary file:
- [server/index.js](/Users/avrdnn/Desktop/iterojm/iterojm/server/index.js)

Expected changes only if necessary:
- wait slightly longer before PDF capture if charts need a deterministic settle period
- optionally wait for a stronger export-ready signal that includes chart readiness

## Suggested Technical Approaches

### Option A: Fixed export dimensions inside existing chart components

Pros:
- smallest change
- easiest to keep UI and export rendering close

Cons:
- still tied to `Recharts`
- may need chart-by-chart tuning

### Option B: Export-specific chart wrappers

Pros:
- cleaner separation between app UI and PDF rendering
- easier to stabilize layout

Cons:
- more code duplication

### Recommendation

Start with Option A.

If chart issues remain after fixed sizing, move specific chart types to export-specific wrappers.

## Acceptance Criteria

Functional:
- exported PDF remains single-page for the tested journey map
- metric cards render without visible chart collapse
- export completes successfully through the new server-side flow

Visual:
- no clipped chart content
- labels remain readable
- pie/donut legends do not overflow awkwardly
- bars/lines/areas stay aligned and proportional

Technical:
- no `Recharts width(-1)/height(-1)` warnings during export render
- client build succeeds
- server export endpoint still returns valid PDF

## Test Plan

### Local verification

Use the current local export flow on an existing map containing metrics.

Verify:
- PDF downloads successfully
- only one page is produced
- chart blocks look stable

### Console verification

Check Chromium/export page logs for:
- no `Recharts` invalid dimension warnings

### Regression checks

Verify export still works for:
- map without metrics
- map with linked journeys
- map with multiple metric chart types

## Risks

- export-only chart sizing may slightly differ from interactive UI appearance
- some chart types may need individual tuning
- fixed export dimensions that look good on one map may need adjustment for denser maps

## Follow-Up After Polish

Once chart stability is done, next planned upgrade should be:
- async export pipeline with `create/status/download`

That will move the feature closer to the Smaply architecture already observed in HAR analysis.
