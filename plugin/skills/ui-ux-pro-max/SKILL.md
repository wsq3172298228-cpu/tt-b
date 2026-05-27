---
name: ui-ux-pro-max
description: "UI/UX design system skill with design tokens, typography, colors, icons, and platform-specific templates"
argument-hint: "<design query or component type>"
user-invocable: true
---

Search the UI/UX design system for: $ARGUMENTS

## What This Skill Does

This skill provides a comprehensive UI/UX design system with BM25 search capabilities across multiple design domains:

- **Styles** — Design styles, effects, animations, and implementation checklists
- **Colors** — Color palettes for different product types
- **Charts** — Data visualization recommendations and accessibility guidelines
- **Landing Pages** — Landing page patterns and conversion optimization
- **Products** — Product-specific design recommendations
- **UX Guidelines** — UX issues, do's and don'ts, and code examples
- **Typography** — Font pairings and typography recommendations
- **Icons** — Icon libraries and usage guidelines
- **Google Fonts** — Google Fonts recommendations
- **React Performance** — React performance optimization patterns
- **UI Reasoning** — UI reasoning and decision-making patterns
- **App Interface** — App interface design patterns
- **Draft** — Draft design patterns

## How to Use

### 1. Search for Design Guidance

```bash
# Search for a specific style
python3 plugin/skills/ui-ux-pro-max/scripts/core.py style "modern minimalist dark mode"

# Search for color palette
python3 plugin/skills/ui-ux-pro-max/scripts/core.py color "e-commerce product page"

# Search for chart recommendations
python3 plugin/skills/ui-ux-pro-max/scripts/core.py chart "time series data visualization"

# Search for landing page patterns
python3 plugin/skills/ui-ux-pro-max/scripts/core.py landing "SaaS pricing page"

# Search for UX guidelines
python3 plugin/skills/ui-ux-pro-max/scripts/core.py ux "mobile navigation hamburger menu"
```

### 2. Available Search Categories

| Category | Description | Example Query |
|----------|-------------|---------------|
| `style` | Design styles and effects | "glassmorphism card component" |
| `color` | Color palettes | "dark mode dashboard" |
| `chart` | Data visualization | "pie chart vs donut chart" |
| `landing` | Landing page patterns | "hero section with CTA" |
| `product` | Product-specific design | "social media app" |
| `ux` | UX guidelines | "form validation error messages" |
| `typography` | Font pairings | "professional corporate headings" |
| `icons` | Icon recommendations | "navigation icons" |
| `google-fonts` | Google Fonts | "serif headings sans-serif body" |
| `react-performance` | React optimization | "list rendering virtualization" |
| `ui-reasoning` | UI decision patterns | "tabs vs accordion" |
| `app-interface` | App interface patterns | "settings page layout" |
| `draft` | Draft patterns | "wireframe components" |

### 3. Output Format

The search returns structured results with:
- **Relevance score** — BM25-based ranking
- **Key fields** — Category-specific important information
- **Implementation details** — Code examples, CSS variables, technical keywords
- **Best practices** — Do's and don'ts, accessibility notes

## Example Queries

```bash
# Find modern dark mode styles
python3 plugin/skills/ui-ux-pro-max/scripts/core.py style "dark mode glassmorphism"

# Get color palette for a food delivery app
python3 plugin/skills/ui-ux-pro-max/scripts/core.py color "food delivery mobile app"

# Find the best chart for showing trends
python3 plugin/skills/ui-ux-pro-max/scripts/core.py chart "monthly revenue trend"

# Get landing page pattern for SaaS
python3 plugin/skills/ui-ux-pro-max/scripts/core.py landing "SaaS free trial conversion"

# Find UX guidelines for form design
python3 plugin/skills/ui-ux-pro-max/scripts/core.py ux "multi-step form wizard"

# Get typography recommendations
python3 plugin/skills/ui-ux-pro-max/scripts/core.py typography "tech startup landing page"
```

## Data Files

The skill includes CSV data files in `plugin/skills/ui-ux-pro-max/data/`:
- `styles.csv` — 50+ design styles with implementation details
- `colors.csv` — 30+ product-specific color palettes
- `charts.csv` — 20+ chart type recommendations
- `landing.csv` — 15+ landing page patterns
- `products.csv` — 25+ product type recommendations
- `ux-guidelines.csv` — 40+ UX guidelines with code examples
- `typography.csv` — 30+ font pairings
- `icons.csv` — Icon library recommendations
- `google-fonts.csv` — Google Fonts recommendations
- `react-performance.csv` — React optimization patterns
- `ui-reasoning.csv` — UI decision patterns
- `app-interface.csv` — App interface patterns
- `draft.csv` — Draft design patterns

## Platform Templates

The skill includes platform-specific templates in `plugin/skills/ui-ux-pro-max/templates/platforms/`:
- `cursor.json` — Cursor IDE configuration
- `roocode.json` — RooCode configuration

## Integration

This skill can be used standalone or integrated with other tt-b skills:
- Use `/remember` to save design decisions discovered through this skill
- Use `/goal-ttb` to implement UI/UX improvements based on search results
- Use `/recall` to retrieve past design decisions

## Requirements

- Python 3.7+
- No external dependencies (uses only standard library)

## Limitations

- Search is BM25-based (keyword matching), not semantic search
- Results are limited to the pre-built CSV data
- No real-time design tool integration
- No image or visual search capabilities
