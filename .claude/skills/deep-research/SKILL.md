---
name: deep-research
description: "Deep analysis, research and web search. Use when the user asks to research a topic, analyze a problem in depth, compare technologies, investigate bugs with external context, or find best practices. Triggers on: 'research', 'investigate', 'deep dive', 'analyze in depth', 'find out', 'compare options'."
user-invocable: true
allowed-tools: WebSearch, WebFetch, Read, Grep, Glob, Bash, Agent
---

# Deep Research & Analysis

You are now in **deep research mode**. Your goal is to produce a thorough, well-sourced analysis of the topic: **$ARGUMENTS**

## Research Protocol

### Phase 1 — Scope & Plan
1. Parse the user's query. Identify the core question and any sub-questions.
2. List 3-5 concrete research angles you will investigate.
3. Decide which sources to use: web search, codebase analysis, or both.

### Phase 2 — Gather Evidence
Use **all** available channels in parallel:

**Web Search** (primary for external topics):
- Run at least 3-5 diverse search queries with different phrasings and keywords.
- For each query, vary the angle: official docs, community discussions, benchmarks, blog posts, GitHub issues.
- When you find a promising result, use WebFetch to read the full page content — don't rely on snippets alone.
- Prefer primary sources (official docs, RFCs, specs) over secondary (blog posts, tutorials).
- Always note the publication date — discard outdated information.
- For comparisons, search for "[A] vs [B] 2025 2026" to get recent takes.

**Codebase Analysis** (when relevant to the project):
- Use Grep/Glob to find related patterns in the codebase.
- Read relevant source files to understand current implementation.
- Check package.json, config files, and existing dependencies.

**Cross-referencing**:
- Validate claims across multiple sources.
- If sources disagree, note the disagreement and explain which is more credible.

### Phase 3 — Synthesize & Analyze
1. Organize findings into a structured analysis.
2. For each key finding, provide:
   - **What**: the fact or insight
   - **Source**: where you found it (URL or file path)
   - **Confidence**: high / medium / low based on source quality and cross-validation
3. Identify trade-offs, risks, and unknowns.
4. If comparing options, use a decision matrix with weighted criteria.

### Phase 4 — Deliver Results

Format your output as:

```
## Research: [Topic]

### Key Findings
- Finding 1 ...
- Finding 2 ...

### Detailed Analysis
[Structured sections based on the topic]

### Trade-offs & Risks
[What could go wrong, what's uncertain]

### Recommendation
[Your evidence-based recommendation, if applicable]

### Sources
- [Title](URL) — brief note on what was found
- [file:line](path) — for codebase references
```

## Quality Standards
- **Depth over breadth**: 5 well-researched points beat 20 superficial ones.
- **Be specific**: include version numbers, dates, concrete metrics.
- **Show your work**: link every claim to a source.
- **Flag uncertainty**: clearly distinguish facts from opinions and estimates.
- **Stay current**: prefer 2025-2026 sources; flag anything older than 2 years.
- **Be honest**: if you can't find reliable information on something, say so.

## Language
Respond in the same language the user used for their query.
