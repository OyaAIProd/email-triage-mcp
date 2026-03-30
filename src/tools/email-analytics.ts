import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requirePro } from '../lib/license.js';
import { recordToolUsage, getAnalyticsData } from '../lib/usage.js';

export function registerEmailAnalytics(server: McpServer): void {
  server.tool(
    'email_analytics',
    '[Pro] Get email usage patterns, response time tracking, sender importance ranking, and category breakdown over a time period.',
    {
      days: z.number().optional().default(7).describe('Number of days to analyze (default 7)'),
    },
    async ({ days }) => {
      await requirePro();

      const data = getAnalyticsData(days);

      recordToolUsage('email_analytics');

      // Format busiest hours for readability
      const busiestHoursFormatted = data.busiestHours.slice(0, 5).map((h) => ({
        hour: `${h.hour.toString().padStart(2, '0')}:00 UTC`,
        emailCount: h.count,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              period: `Last ${days} days`,
              total_emails_processed: data.totalProcessed,
              category_breakdown: data.categoryBreakdown,
              top_senders: data.topSenders.map((s) => ({
                sender: s.sender,
                email_count: s.count,
                avg_response_time_hours: s.avgResponseTime ? Math.round(s.avgResponseTime * 10) / 10 : null,
              })),
              avg_response_time_hours: data.avgResponseTime ? Math.round(data.avgResponseTime * 10) / 10 : null,
              busiest_hours: busiestHoursFormatted,
              insights: generateInsights(data),
            }, null, 2),
          },
        ],
      };
    }
  );
}

function generateInsights(data: ReturnType<typeof getAnalyticsData>): string[] {
  const insights: string[] = [];

  if (data.totalProcessed === 0) {
    insights.push('No email data yet. Use classify_email or batch_triage to start building analytics.');
    return insights;
  }

  // Category insights
  const categories = Object.entries(data.categoryBreakdown).sort((a, b) => b[1] - a[1]);
  if (categories.length > 0) {
    const [topCategory, topCount] = categories[0];
    const percentage = Math.round((topCount / data.totalProcessed) * 100);
    insights.push(`${percentage}% of your emails are "${topCategory}" (${topCount} of ${data.totalProcessed}).`);
  }

  // Newsletter burden
  const newsletters = data.categoryBreakdown['newsletter'] ?? 0;
  if (newsletters > 5) {
    insights.push(`You received ${newsletters} newsletters. Consider using batch_triage with archive_newsletters=true.`);
  }

  // Response time
  if (data.avgResponseTime !== null) {
    const hours = Math.round(data.avgResponseTime * 10) / 10;
    if (hours > 24) {
      insights.push(`Average response time is ${hours} hours. Consider prioritizing action_required emails.`);
    } else {
      insights.push(`Average response time is ${hours} hours.`);
    }
  }

  // Top sender
  if (data.topSenders.length > 0) {
    const top = data.topSenders[0];
    insights.push(`Your most frequent correspondent is ${top.sender} (${top.count} emails).`);
  }

  // Busy hours
  if (data.busiestHours.length > 0) {
    const peak = data.busiestHours[0];
    insights.push(`Peak email hour: ${peak.hour.toString().padStart(2, '0')}:00 UTC (${peak.count} emails).`);
  }

  return insights;
}
