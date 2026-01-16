# Elasticsearch Analytics MCP Server

> **MCP server with a hardcoded schema for `stats-*` indices. Specialized analytics tools for visit trends, account/group metrics, platform breakdowns, and rating distributions.**

[![npm version](https://badge.fury.io/js/elasticsearch-analytics-mcp.svg)](https://www.npmjs.com/package/elasticsearch-analytics-mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-005571?logo=elasticsearch&logoColor=white)](https://www.elastic.co/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**elasticsearch-analytics-mcp** is a Model Context Protocol (MCP) server that exposes specialized analytics tools for Elasticsearch clusters. It targets a fixed `stats-*` index pattern and a hardcoded field schema, so tools can ship with opinionated, ready-to-use aggregations rather than requiring callers to construct queries from scratch. Built with TypeScript and optimized for Elastic Cloud environments.

## 🚀 Features

- **🔐 Secure by Design**: Input validation, script sanitization, injection prevention
- **☁️ Elastic Cloud Ready**: Native support for cloud ID and API key authentication
- **⚡ High Performance**: Connection pooling, optimized query execution, efficient aggregations
- **🛠️ Comprehensive Tools**: Specialized tools for analytics, summaries, and data exploration
- **📊 Advanced Querying**: Full Elasticsearch DSL support with aggregations and highlighting
- **🔍 Smart Validation**: Zod-based schemas with security-first validation
- **📝 Full TypeScript**: Complete type safety with strict null checks

## 🎯 Purpose

This MCP server provides specialized analytics tools for querying Elasticsearch `stats-*` indices. The index pattern and field names are hardcoded so the tools can offer a focused, analytics-oriented surface area — visit trends, account/group metrics, platform breakdowns, rating distributions, and similar — without callers having to know the underlying schema.

It works with any MCP-compatible client (Claude Desktop, the Claude API, IDE extensions, etc.).

## 📦 Usage

Add it to any MCP client configuration. For example:

```json
{
  "mcpServers": {
    "elasticsearch": {
      "command": "npx",
      "args": ["-y", "elasticsearch-analytics-mcp"],
      "env": {
        "ELASTIC_NODE": "https://your-cluster.es.region.aws.found.io",
        "ELASTIC_USERNAME": "your-username",
        "ELASTIC_PASSWORD": "your-password",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

The server reads configuration from environment variables (see [Configuration](#%EF%B8%8F-configuration)) and registers all analytics tools on startup.

## 🔄 Updating and Publishing

1. **Develop locally**: Make changes under `src/`
2. **Test your changes**: Use `npm run test:tools` to test against your Elasticsearch instance
3. **Build**: Run `npm run build` to compile TypeScript
4. **Publish**: Bump the version in `package.json`, then `npm publish --access public`

Consumers using `npx -y elasticsearch-analytics-mcp@<version>` will pick up the new release on next start. Using `@latest` always pulls the most recent published version; pinning a version is recommended for production stability.

## 🛠️ Available Tools

| Tool | Description | Use Cases |
|------|-------------|-----------|
| `get_index_fields` | Discover index fields and types | Schema exploration, field discovery |
| `top_change` | Find top accounts or groups with highest visit increase/decrease | Trend analysis, account/group monitoring |
| `get_subscription_breakdown` | Compare subscription tiers with metrics per tier | Subscription-tier analysis and comparisons |
| `get_platform_breakdown` | Platform or platform version breakdown (provider/patient, platform/version) | Platform adoption, device preferences, version analysis |
| `get_rating_distribution` | Rating histograms with statistics | Satisfaction analysis |
| `get_visit_trends` | Time series visit trends (daily/weekly/monthly) | Trend visualization |
| `get_usage_profile` | Comprehensive metrics summary with flexible filtering and grouping | Multi-dimensional analysis and comparisons |
| `get_usage_leaderboard` | Ranked leaderboard of accounts/groups/platforms | High-usage entities, outliers |

## 📋 Tool Examples

### Get Top Accounts by Growth

```json
{
  "tool": "top_change",
  "arguments": {
    "groupBy": "account",
    "direction": "increase",
    "topN": 10,
    "currentPeriodDays": 30,
    "previousPeriodDays": 30
  }
}
```

### Get Platform Breakdown

```json
{
  "tool": "get_platform_breakdown",
  "arguments": {
    "role": "provider",
    "breakdownType": "version",
    "topN": 10,
    "startDate": "now-30d",
    "endDate": "now"
  }
}
```

### Get Visit Trends

```json
{
  "tool": "get_visit_trends",
  "arguments": {
    "interval": "daily",
    "startDate": "now-30d",
    "endDate": "now",
    "groupBy": "subscription"
  }
}
```

## ⚙️ Configuration

### Index Pattern

The server targets the `stats-*` index pattern by default for all analytics tools. This is hardcoded into the tools themselves; the matching field schema is also hardcoded. If you need to point the analytics tools at a different index, update the defaults in the tool implementations under `src/tools/`.

### Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `ELASTIC_NODE` | Elasticsearch URL | Yes | `https://your-cluster.es.region.aws.found.io` |
| `ELASTIC_USERNAME` | Basic auth username | Yes | `your-username` |
| `ELASTIC_PASSWORD` | Basic auth password | Yes | `your-password` |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Disable TLS verification (for self-signed certs) | No | `"0"` |

### Alternative: Elastic Cloud Authentication

If using Elastic Cloud with cloud ID and API key:

| Variable | Description | Required |
|----------|-------------|----------|
| `ELASTIC_CLOUD_ID` | Elastic Cloud deployment ID | Yes* |
| `ELASTIC_API_KEY` | Elasticsearch API key | Yes* |

*Either `ELASTIC_CLOUD_ID` + `ELASTIC_API_KEY` OR `ELASTIC_NODE` + `ELASTIC_USERNAME` + `ELASTIC_PASSWORD` is required

## 🔒 Security Features

### Input Validation
- **Zod Schemas**: Strict type validation for all inputs
- **Field Name Validation**: Prevents reserved field usage
- **Size Limits**: Document size, array length, string length limits
- **Depth Validation**: Prevents deeply nested objects/queries

### Script Security
- **Script Sanitization**: Blocks dangerous script patterns
- **Parameter Validation**: Validates script parameters
- **Execution Limits**: Prevents resource exhaustion

### Query Security
- **Injection Prevention**: Sanitizes and validates all queries
- **Script Query Blocking**: Prevents script-based queries in sensitive operations
- **Rate Limiting**: Protects against abuse

### Data Protection
- **Credential Masking**: Never logs sensitive information
- **Secure Connections**: TLS/SSL support
- **Access Control**: Validates permissions before operations

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │◄──►│Elasticsearch MCP│◄──►│  Elasticsearch  │
│  (Claude, etc.) │    │     Server      │    │    Cluster      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌─────────────┐
                       │   Tools     │
                       │             │
                       │ • search    │
                       │ • fields    │
                       │ • summaries │
                       │ • trends    │
                       │ • analytics │
                       └─────────────┘
```

## 📊 Performance

### Benchmarks
- **Search**: <500ms average response time
- **Aggregations**: Optimized for large-scale analytics
- **Memory Usage**: <100MB for typical operations
- **Concurrent Requests**: Up to 10 simultaneous operations

### Optimization Features
- **Connection Pooling**: Reuses Elasticsearch connections
- **Optimized Queries**: Efficient aggregation pipelines
- **Smart Caching**: Reduced redundant queries
- **Health Monitoring**: Automatic reconnection on failures

## 🔧 Development

### Setup Development Environment

```bash
# Install dependencies
npm install

# Set up environment variables
export ELASTIC_NODE="https://your-elasticsearch-url"
export ELASTIC_USERNAME="your-username"
export ELASTIC_PASSWORD="your-password"
export NODE_TLS_REJECT_UNAUTHORIZED="0"  # If needed for self-signed certs

# Run in development mode
npm run dev

# Test tools against live Elasticsearch
npm run test:tools

# Build for production
npm run build

# Publish new version (after incrementing version in package.json)
npm publish --access public
```

### Project Structure

```
elasticsearch-analytics-mcp/
├── src/
│   ├── tools/           # MCP tool implementations
│   ├── elasticsearch/   # ES client and connection management
│   ├── validation/      # Input validation schemas
│   ├── errors/          # Error handling utilities
│   ├── config.ts        # Configuration management
│   ├── logger.ts        # Structured logging
│   └── server.ts        # Main MCP server
├── tests/               # Test suite
└── build/               # Compiled output
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Elasticsearch Documentation](https://www.elastic.co/guide/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
