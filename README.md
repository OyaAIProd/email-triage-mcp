# @truss-dev/email-triage-mcp

[![SafeSkill 82/100](https://img.shields.io/badge/SafeSkill-82%2F100_Passes%20with%20Notes-yellow)](https://safeskill.dev/scan/claw-factory-email-triage-mcp)

**Agentic email triage for Claude Code.** Classify, extract tasks, auto-label, and manage your inbox — all from your AI agent.

This MCP server connects to Gmail and gives Claude Code (or any MCP-compatible agent) the ability to read, classify, search, and act on your email. No external AI APIs needed — classification runs locally using rule-based pattern matching. Your agent provides the intelligence; this server provides the data.

## Installation

```bash
npm install -g @truss-dev/email-triage-mcp
```

## Claude Code Configuration

Add to your `~/.claude/settings.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "email-triage": {
      "command": "truss-email-triage",
      "env": {
        "GMAIL_CLIENT_ID": "your-client-id",
        "GMAIL_CLIENT_SECRET": "your-client-secret",
        "TRUSS_LICENSE_KEY": "truss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

## Gmail Setup

### 1. Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Enable the **Gmail API** under APIs & Services > Library
4. Go to APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID
5. Application type: **Desktop app**
6. Copy the **Client ID** and **Client Secret**

### 2. Set Environment Variables

```bash
export GMAIL_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export GMAIL_CLIENT_SECRET="your-client-secret"
```

### 3. Authorize

Once the MCP server is running in Claude Code, use the `authorize_gmail` tool:

1. Call `authorize_gmail` with no arguments — it returns an authorization URL
2. Open that URL in your browser, sign in, and grant access
3. Copy the authorization code
4. Call `authorize_gmail` with `code: "the-code-you-got"`

Tokens are stored locally at `~/.truss/gmail-tokens.json` and refresh automatically.

## Tools Reference

### Free Tier (10 classifications/day)

#### `classify_email`
Classify an email by intent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_id` | string | yes | Gmail message ID |

**Returns:** Category (`action_required`, `fyi`, `meeting_request`, `sales_pitch`, `support_ticket`, `newsletter`, `personal`), confidence score, reasoning, and all category scores.

#### `extract_action_items`
Extract action items and deadlines from an email.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_id` | string | yes | Gmail message ID |

**Returns:** List of action items with description, deadline, priority, and assignee.

#### `get_email_digest`
Get a prioritized digest of all unread inbox emails.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_emails` | number | no | Max emails to process (default 25) |

**Returns:** Sorted list of unread emails with classification, priority, and action items.

#### `search_emails`
Search across emails using Gmail query syntax.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Gmail search query |
| `max_results` | number | no | Max results (default 10) |

**Returns:** Matching emails with metadata and snippets.

### Pro Tier ($25/mo — unlimited)

#### `create_task`
Create tasks in Linear, Jira, or Todoist from email content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_id` | string | yes | Gmail message ID |
| `provider` | string | yes | `linear`, `todoist`, or `jira` |
| `custom_title` | string | no | Override auto-generated title |
| `custom_description` | string | no | Override auto-generated description |
| `priority` | string | no | `urgent`, `high`, `medium`, `low` |
| `due_date` | string | no | YYYY-MM-DD format |

#### `auto_label`
Automatically label and archive emails based on classification.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_id` | string | yes | Gmail message ID |
| `archive` | boolean | no | Archive after labeling |
| `mark_read` | boolean | no | Mark as read after labeling |
| `custom_label` | string | no | Additional label to apply |

Creates labels under the `Triage/` prefix (e.g., `Triage/Action Required`, `Triage/Newsletter`).

#### `batch_triage`
Process all unread emails at once. Classify, label, extract tasks, and create external tasks in one operation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_emails` | number | no | Max emails (default 50) |
| `auto_label` | boolean | no | Apply labels (default true) |
| `archive_newsletters` | boolean | no | Auto-archive newsletters |
| `archive_sales` | boolean | no | Auto-archive sales pitches |
| `create_tasks_for_actions` | boolean | no | Create tasks for action_required emails |
| `task_provider` | string | no | `linear`, `todoist`, or `jira` |

#### `smart_reply`
Generate a draft reply based on email context.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email_id` | string | yes | Gmail message ID |
| `tone` | string | no | `professional`, `casual`, `brief`, `detailed` |
| `intent` | string | no | What you want to say |
| `include_action_items` | boolean | no | Reference action items (default true) |

#### `email_analytics`
Get usage patterns and sender analytics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `days` | number | no | Days to analyze (default 7) |

**Returns:** Category breakdown, top senders, response times, busiest hours, and insights.

#### `follow_up_tracker`
Track emails awaiting responses.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | yes | `scan`, `list`, or `mark_resolved` |
| `email_id` | string | no | For `mark_resolved` |
| `days_back` | number | no | Scan window (default 7) |
| `overdue_threshold_days` | number | no | Days before "overdue" (default 3) |

### Utility Tools

#### `check_auth_status`
Check Gmail authentication and license status. No parameters.

#### `authorize_gmail`
Authorize Gmail access via OAuth2 flow.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | no | OAuth code (omit for auth URL) |

## Free vs Pro

| Feature | Free | Pro ($25/mo) |
|---------|------|--------------|
| Email classification | 10/day | Unlimited |
| Action item extraction | Yes | Yes |
| Email digest | Yes | Yes |
| Email search | Yes | Yes |
| Auto-labeling | - | Yes |
| Batch triage | - | Yes |
| Smart reply drafts | - | Yes |
| Task creation (Linear/Jira/Todoist) | - | Yes |
| Email analytics | - | Yes |
| Follow-up tracking | - | Yes |

**Subscribe to Pro:** [https://buy.stripe.com/28E00igAv4605cWfXL7wA06](https://buy.stripe.com/28E00igAv4605cWfXL7wA06)

After subscribing, set the `TRUSS_LICENSE_KEY` environment variable.

## Task Integration Setup

### Linear
```bash
export LINEAR_API_KEY="lin_api_xxxxxxxx"
```
Get your API key at [Linear Settings > API](https://linear.app/settings/api).

### Todoist
```bash
export TODOIST_API_TOKEN="xxxxxxxx"
```
Get your token at [Todoist Integrations > Developer](https://todoist.com/app/settings/integrations/developer).

### Jira
```bash
export JIRA_DOMAIN="yourcompany"       # yourcompany.atlassian.net
export JIRA_EMAIL="you@company.com"
export JIRA_API_TOKEN="xxxxxxxx"
```
Get your API token at [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens).

## How Classification Works

The classifier uses **rule-based pattern matching** with no external AI API dependency. It analyzes:

- **Headers:** `List-Unsubscribe` (newsletter), `In-Reply-To` (thread context), `Content-Type` (calendar invites)
- **Sender patterns:** `noreply@`, support addresses, personal email domains
- **Subject patterns:** Action keywords, ticket numbers, forwarded messages, meeting language
- **Body patterns:** Action verbs, deadlines, meeting links, unsubscribe links, sales language

Each category has weighted rules. The email is scored against all categories and the highest-scoring category wins. Confidence reflects how strongly the patterns matched.

This design is intentional — your AI agent (Claude, etc.) provides the reasoning layer. The MCP server provides fast, deterministic, free email data access.

## Data Storage

All data is stored locally on your machine:

| File | Purpose |
|------|---------|
| `~/.truss/gmail-tokens.json` | OAuth2 refresh token (mode 0600) |
| `~/.truss/usage.db` | Usage tracking, analytics, follow-ups (SQLite) |
| `~/.truss/license-cache.json` | Cached license validation (7-day TTL) |

No email content is sent to TRUSS servers. License validation is a simple key check.

## Troubleshooting

### "Gmail not authenticated"
Run `check_auth_status` to verify, then `authorize_gmail` to set up OAuth.

### "Free tier daily limit reached"
Free tier allows 10 classifications per day (resets at midnight UTC). Upgrade to Pro for unlimited: [Subscribe](https://buy.stripe.com/28E00igAv4605cWfXL7wA06)

### "Gmail OAuth credentials not configured"
Set `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` environment variables. Create credentials at [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

### "This feature requires a TRUSS Pro license"
Pro tools (`create_task`, `auto_label`, `batch_triage`, `smart_reply`, `email_analytics`, `follow_up_tracker`) require a Pro subscription.

### Token refresh errors
Delete `~/.truss/gmail-tokens.json` and re-authorize with `authorize_gmail`.

### SQLite errors
Delete `~/.truss/usage.db` to reset the database. Usage counters will restart.

## Development

```bash
git clone https://github.com/truss-dev/email-triage-mcp.git
cd email-triage-mcp
npm install
npm run build

# Run locally
npm run dev

# Run evals
npm run eval
```

## License

MIT


---

## A2A Discovery

This server publishes a [Google A2A Protocol](https://a2a-protocol.org) Agent Card, making it discoverable by any A2A-compatible agent framework (LangGraph, CrewAI, Google ADK, AutoGen, and others).

**Agent Card:** [`agent-card.json`](./agent-card.json)

The agent card describes this server's skills, capabilities, input/output modalities, and authentication requirements in a machine-readable format. A2A clients can use it to discover and invoke tools automatically without manual configuration.

```bash
# Fetch the agent card
curl https://raw.githubusercontent.com/claw-factory/email-triage-mcp/main/agent-card.json
```
