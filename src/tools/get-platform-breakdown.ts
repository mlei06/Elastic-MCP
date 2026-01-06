import { BaseTool } from './base-tool.js';
import { z } from 'zod';
import { FIELD_CONSTANTS } from '../utils/field-constants.js';
import { buildCommonFilters } from '../utils/query-helpers.js';
import { StandardResponse } from './types.js';
import { AGGREGATION_LIMITS, calculateTermsSize } from '../utils/aggregation-limits.js';

const GetPlatformBreakdownArgsSchema = z.object({
  role: z.enum(['provider', 'patient']).describe('Role: "provider" for provider platforms/versions, "patient" for patient platforms/versions'),
  breakdownType: z.enum(['platform', 'version']).describe('Breakdown type: "platform" for platform breakdown (Web/iOS/Android), "version" for platform version breakdown'),
  topN: z.number().int().min(1).max(100).optional().default(5).describe('Number of top items to return (default: 10, max: 100)'),
  startDate: z.string().optional().describe('Start date in date math (e.g., "now-30d", "now-1y") or ISO format (YYYY-MM-DD)'),
  endDate: z.string().optional().describe('End date in date math (e.g., "now") or ISO format (YYYY-MM-DD)'),
  account: z.string().optional().describe('Optional account name to filter data to'),
  group: z.string().optional().describe('Optional group name to filter data to'),
}).strict();

export type GetPlatformBreakdownArgs = z.infer<typeof GetPlatformBreakdownArgsSchema>;

export interface PlatformMetrics {
  platform: string;
  count_records: number;
  unique_accounts: number;
  unique_providers: number;
  unique_patients: number;
}

export type PlatformBreakdownResult = StandardResponse<{
  top_items: PlatformMetrics[];
  other_items: PlatformMetrics | null;
}>;

export class GetPlatformBreakdownTool extends BaseTool<typeof GetPlatformBreakdownArgsSchema, PlatformBreakdownResult> {
  constructor(elasticsearch: any, logger: any) {
    super(elasticsearch, logger, 'elastic_get_platform_breakdown');
  }

  get schema() {
    return GetPlatformBreakdownArgsSchema;
  }

  get description() {
    return 'Get breakdown of top N platforms or platform versions, can optionally be filtered by account or group. Supports both provider and patient roles.';
  }

  protected async run(args: GetPlatformBreakdownArgs): Promise<PlatformBreakdownResult> {
    const topN = Math.min(args.topN || 10, 50);
    const { startIso: startDateIso, endIso: endDateIso } =
      this.resolveTimeRange(args.startDate, args.endDate, 'now-14d', 'now');

    this.logger.info('Getting platform breakdown', {
      role: args.role,
      breakdownType: args.breakdownType,
      topN,
      originalTopN: args.topN,
      startDate: startDateIso,
      endDate: endDateIso,
      account: args.account,
      group: args.group,
    });

    const client = this.elasticsearch.getClient();
    const index = FIELD_CONSTANTS.index;
    const timeField = FIELD_CONSTANTS.timeField;
    const accountField = FIELD_CONSTANTS.accountField;
    const providerField = FIELD_CONSTANTS.providerField;
    const patientField = FIELD_CONSTANTS.patientField;
    const callDurationField = FIELD_CONSTANTS.callDurationField;

    let aggregationField: string;
    if (args.role === 'provider') {
      aggregationField = args.breakdownType === 'version'
        ? 'provider0_platform_version.keyword'
        : 'provider0_platform.keyword';
    } else {
      aggregationField = args.breakdownType === 'version'
        ? 'patient0_platform_version.keyword'
        : 'patient0_platform.keyword';
    }

    // Use helper for common filters
    const filters = buildCommonFilters({
      startDate: startDateIso,
      endDate: endDateIso,
      account: args.account,
      group: args.group,
      excludeTestVisits: true
    });

    // Platform specific extra filters (call duration or meeting based false)
    filters.push({
      bool: {
        should: [
          { exists: { field: callDurationField } },
          { term: { [FIELD_CONSTANTS.meetingBasedField]: false } },
        ],
        minimum_should_match: 1,
      },
    });

    const query = {
      index,
      size: 0,
      body: {
        track_total_hits: false,
        query: {
          bool: {
            filter: filters,
          },
        },
        aggs: {
          by_item: {
            terms: {
              field: aggregationField,
              size: calculateTermsSize(topN || 10, 2, AGGREGATION_LIMITS.LARGE),
              order: { _count: 'desc' },
            },
            aggs: {
              count_records: {
                value_count: { field: timeField },
              },
              unique_accounts: {
                cardinality: { field: accountField },
              },
              unique_providers: {
                cardinality: { field: providerField },
              },
              unique_patients: {
                cardinality: { field: patientField },
              },
            },
          },
        },
      },
    };

    this.logger.debug('Executing query', { query: JSON.stringify(query, null, 2) });
    const response = await client.search(query);

    const aggs = response.aggregations as any;
    const itemBuckets = aggs?.by_item?.buckets || [];

    const topItems: PlatformMetrics[] = [];
    let otherRecords = 0;
    let otherAccounts = 0;
    let otherProviders = 0;
    let otherPatients = 0;

    for (let i = 0; i < itemBuckets.length; i++) {
      const bucket = itemBuckets[i];
      const item = bucket.key as string;
      const countRecords = (bucket.count_records as any)?.value || bucket.doc_count || 0;
      const uniqueAccounts = (bucket.unique_accounts as any)?.value || 0;
      const uniqueProviders = (bucket.unique_providers as any)?.value || 0;
      const uniquePatients = (bucket.unique_patients as any)?.value || 0;

      const itemMetrics: PlatformMetrics = {
        platform: item,
        count_records: countRecords,
        unique_accounts: uniqueAccounts,
        unique_providers: uniqueProviders,
        unique_patients: uniquePatients,
      };

      if (i < topN) {
        topItems.push(itemMetrics);
      } else {
        otherRecords += countRecords;
        otherAccounts += uniqueAccounts;
        otherProviders += uniqueProviders;
        otherPatients += uniquePatients;
      }
    }

    let otherItems: PlatformMetrics | null = null;
    if (itemBuckets.length > topN) {
      otherItems = {
        platform: `Other (${itemBuckets.length - topN} ${args.breakdownType === 'version' ? 'versions' : 'platforms'})`,
        count_records: otherRecords,
        unique_accounts: otherAccounts,
        unique_providers: otherProviders,
        unique_patients: otherPatients,
      };
    }

    return this.buildResponse({
      top_items: topItems,
      other_items: otherItems
    }, {
      description: `Platform breakdown by ${args.breakdownType} for ${args.role}s from ${startDateIso} to ${endDateIso}`,

      time: {
        start: startDateIso,
        end: endDateIso
      },
      visualization: {
        type: 'pie',
        title: `Top ${topN} ${args.role} ${args.breakdownType}s`,
        description: `${startDateIso.split('T')[0]} to ${endDateIso.split('T')[0]}`,
        xAxisLabel: args.breakdownType === 'version' ? 'Version' : 'Platform',
        yAxisLabel: 'Records'
      }
    });
  }
}
