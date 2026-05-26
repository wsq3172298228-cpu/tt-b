---
name: browser-mcp
description: Browser automation and web data fetching using Browser MCP. Use when the user needs to scrape websites, fetch web data, automate frontend testing, fill forms, take screenshots, or interact with web pages.
---

# Browser MCP Skill

Automate browser tasks using Browser MCP, which controls your existing Chrome browser with all login sessions and cookies intact.

## Trigger Conditions

Activate this skill when the user mentions:
- Fetching data from websites
- Web scraping
- Frontend testing
- Browser automation
- Filling forms
- Taking screenshots of web pages
- Testing UI components
- Checking website behavior
- Crawling pages

## Prerequisites

1. Chrome must be running
2. Browser MCP extension must be installed and active in Chrome
3. The `browsermcp` MCP server must be configured in `~/.claude/settings.json`

## Available Tools

Use the `browsermcp` MCP tools:

### Navigation
- `browser_navigate` - Go to a URL
- `browser_go_back` / `browser_go_forward` - Navigation history
- `browser_reload` - Refresh current page

### Interaction
- `browser_click` - Click element by selector
- `browser_type` - Type text into input fields
- `browser_select` - Select dropdown option
- `browser_hover` - Hover over element
- `browser_drag` - Drag and drop elements
- `browser_fill` - Fill form fields (multiple at once)

### Information Extraction
- `browser_snapshot` - Get page accessibility tree (structured)
- `browser_get_text` - Extract text content
- `browser_screenshot` - Capture page screenshot
- `browser_get_url` - Get current URL
- `browser_get_title` - Get page title

### Advanced
- `browser_evaluate` - Execute JavaScript in page context
- `browser_wait_for` - Wait for element or condition
- `browser_tabs` - Manage browser tabs
- `browser_scroll` - Scroll page

## Usage Patterns

### Pattern 1: Fetch Data from Website

```python
# Navigate to the target page
browser_navigate(url="https://example.com")

# Get structured content
snapshot = browser_snapshot()

# Or extract specific text
text = browser_get_text(selector=".content")

# Take screenshot for verification
browser_screenshot()
```

### Pattern 2: Automate Form Submission

```python
# Navigate to form
browser_navigate(url="https://example.com/form")

# Fill fields
browser_fill(selector="input[name='email']", value="user@example.com")
browser_fill(selector="input[name='password']", value="password123")

# Submit
browser_click(selector="button[type='submit']")

# Wait for result
browser_wait_for(selector=".success-message")
```

### Pattern 3: Frontend Testing

```python
# Navigate to component
browser_navigate(url="http://localhost:3000/component")

# Test interaction
browser_click(selector=".dropdown-trigger")
browser_wait_for(selector=".dropdown-menu")

# Verify state
snapshot = browser_snapshot()

# Take screenshot for visual regression
browser_screenshot()
```

### Pattern 4: Multi-page Crawling

```python
# Start at listing page
browser_navigate(url="https://example.com/products")

# Get all product links
links = browser_evaluate(script="""
  Array.from(document.querySelectorAll('.product a'))
    .map(a => a.href)
""")

# Visit each page
for link in links:
    browser_navigate(url=link)
    data = browser_snapshot()
    # Process data...
```

## Error Handling

- If `browsermcp` tools fail, check that Chrome is running and the extension is active
- Use `browser_wait_for` instead of `sleep` for dynamic content
- If element not found, try `browser_snapshot` first to understand page structure

## Fallback

If Browser MCP is unavailable, fall back to:
1. `fetcher-mcp` or `mcp-fetch-server` for simple page fetches
2. `@playwright/mcp` for headless browser automation (no existing sessions)

## Example: Scraping a Table

```python
browser_navigate(url="https://example.com/data-table")

# Wait for table to load
browser_wait_for(selector="table tbody tr")

# Extract table data
data = browser_evaluate(script="""
  const rows = document.querySelectorAll('table tbody tr');
  Array.from(rows).map(row => {
    const cells = row.querySelectorAll('td');
    return Array.from(cells).map(cell => cell.textContent.trim());
  });
""")
```

## Notes

- Browser MCP uses your real Chrome, so login sessions are preserved
- No need to handle cookies or authentication manually
- For headless automation without UI, use `@playwright/mcp` instead
