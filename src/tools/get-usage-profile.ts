import { BaseTool } from './base-tool.js';
import { z } from 'zod';
import { FIELD_CONSTANTS } from '../utils/field-constants.js';
import { buildCommonFilters } from '../utils/query-helpers.js';
import { StandardResponse } from './types.js';
import { AGGREGATION_LIMITS } from '../utils/aggregation-limits.js';

const GetUsageProfileArgsSchema = z.object({
  startDate: z.string().optional().describe('Start date in ISO format (YYYY-MM-DD) or date math (e.g., "now-30d", "now-1y"). Defaults to "now-30d"'),
  endDate: z.string().optional().describe('End date in ISO format (YYYY-MM-DD) or date math (e.g., "now"). Defaults to "now"'),
  account: z.string().optional().describe('Optional account name to filter by'),
  group: z.string().optional().describe('Optional group name to filter by'),
  subscription: z.string().optional().describe('Optional subscription tier to filter by'),
  groupBy: z.enum(['none', 'subscription', 'account', 'group']).optional().default('none').describe('Optional grouping dimension (default: none). When set, returns separate summaries for each group value.'),
}).strict();

export type GetUsageProfileArgs = z.infer<typeof GetUsageProfileArgsSchema>;

export interface UsageProfileItem extends Record<string, any> {
  total_visits: number;
  unique_accounts: number;
  unique_groups: number;
  unique_providers: number;
  unique_patients: number;
}

export type UsageProfileResult = StandardResponse<UsageProfileItem[]>;

export class GetUsageProfileTool extends BaseTool<typeof GetUsageProfileArgsSchema, UsageProfileResult> {
  constructor(elasticsearch: any, logger: any) {
    super(elasticsearch, logger, 'elastic_get_usage_profile');
  }

  get schema() {
    return GetUsageProfileArgsSchema;
  }

  get description() {
    return 'Get a comprehensive usage profile for a specific scope (global, or a specific account/group). Returns high-level usage counts: total visits, unique accounts, unique groups, unique providers, and unique patients.';
  }

  protected async run(args: GetUsageProfileArgs): Promise<UsageProfileResult> {
    const groupBy = args.groupBy || 'none';
    const { startIso: startDateIso, endIso: endDateIso } =
      this.resolveTimeRange(args.startDate, args.endDate, 'now-2w', 'now');

    this.logger.info('Executing usage profile', {
      startDate: startDateIso,
      endDate: endDateIso,
      account: args.account,
      group: args.group,
      subscription: args.subscription,
      groupBy,
    });

    const client = this.elasticsearch.getClient();
    const index = FIELD_CONSTANTS.index;
    const timeField = FIELD_CONSTANTS.timeField;
    const accountField = FIELD_CONSTANTS.accountField;
    const groupField = FIELD_CONSTANTS.groupField;
    const subscriptionField = FIELD_CONSTANTS.subscriptionField;
    const providerField = FIELD_CONSTANTS.providerField;
    const patientField = FIELD_CONSTANTS.patientField;

    const filters = buildCommonFilters({
      startDate: startDateIso,
      endDate: endDateIso,
      account: args.account,
      group: args.group,
      subscription: args.subscription,
      excludeTestVisits: true
    });

    // Extra filters
    filters.push({
      bool: {
        should: [
          { term: { [FIELD_CONSTANTS.meetingBasedField]: false } },
        ],
        minimum_should_match: 0,
      },
    });

    const buildSummaryAggs = () => ({
      total_visits: {
        value_count: { field: timeField },
      },
      unique_accounts: {
        cardinality: { field: accountField },
      },
      unique_groups: {
        cardinality: { field: groupField },
      },
      unique_providers: {
        cardinality: { field: providerField },
      },
      unique_patients: {
        cardinality: { field: patientField },
      }
    });

    let aggs: any;

    if (groupBy === 'none') {
      aggs = buildSummaryAggs();
    } else {
      let groupFieldName: string;
      switch (groupBy) {
        case 'subscription':
          groupFieldName = subscriptionField;
          break;
        case 'account':
          groupFieldName = accountField;
          break;
        case 'group':
          groupFieldName = groupField;
          break;
        default:
          groupFieldName = subscriptionField;
      }

      aggs = {
        by_group: {
          terms: {
            field: groupFieldName,
            size: AGGREGATION_LIMITS.MEDIUM, // Safeguard: cap at 50 to prevent data limits
          },
          aggs: buildSummaryAggs(),
        },
      };
    }

    const query = {
      index,
      size: 0,
      body: {
        query: {
          bool: {
            filter: filters,
          },
        },
        aggs,
      },
    };

    this.logger.debug('Executing query', { query: JSON.stringify(query, null, 2) });
    const response = await client.search(query);
    const responseAggs = response.aggregations as any;

    const processSummaryItem = (itemAggs: any): UsageProfileItem => {
      const totalVisits = itemAggs?.total_visits?.value || 0;

      return {
        total_visits: totalVisits,
        unique_accounts: itemAggs?.unique_accounts?.value || 0,
        unique_groups: itemAggs?.unique_groups?.value || 0,
        unique_providers: itemAggs?.unique_providers?.value || 0,
        unique_patients: itemAggs?.unique_patients?.value || 0,
      };
    };

    let summary: UsageProfileItem[];

    if (groupBy === 'none') {
      summary = [processSummaryItem(responseAggs)];
    } else {
      const valueKey = `${groupBy}_value`;
      const groupBuckets = responseAggs?.by_group?.buckets || [];
      summary = groupBuckets.map((bucket: any) => ({
        [valueKey]: bucket.key as string,
        ...processSummaryItem(bucket),
      }));
    }

    this.logger.info('Successfully retrieved usage summary', {
      groupBy,
      itemCount: summary.length,
    });

    return this.buildResponse(summary, {
      description: `Usage profile from ${startDateIso} to ${endDateIso}${groupBy !== 'none' ? ` grouped by ${groupBy}` : ''}`,

      time: {
        start: startDateIso,
        end: endDateIso
      },
      visualization: {
        type: 'table',
        title: `Usage Profile${groupBy !== 'none' ? ` by ${groupBy}` : ''}`,
        description: `${startDateIso.split('T')[0]} to ${endDateIso.split('T')[0]}`,
      }
    });
  }
}
