# Architecture and Workflow

## System Overview

This document describes the technical architecture and data flow for the Bullhorn AI Candidate Ranking integration. The system connects Bullhorn CRM to an AI evaluation engine to automate candidate ranking.

**Core Principle:** Bullhorn is the single source of truth. All data originates from and returns to Bullhorn.

---

## High-Level System Context

```mermaid
flowchart TB
    subgraph External [External Systems]
        Client[Clients<br/>Submit Job Reqs]
    end
    
    subgraph YourAgency [Your Recruitment Agency]
        Recruiter[Recruiters<br/>Manage Pipeline]
        BH[(Bullhorn CRM<br/>Source of Truth)]
        MW[Integration<br/>Middleware]
        AI[AI Ranking<br/>Engine]
    end
    
    Client -->|Job Requirements| Recruiter
    Recruiter -->|Add Candidates| BH
    BH -->|Extract Data| MW
    MW -->|Evaluate| AI
    AI -->|Rankings| MW
    MW -->|Update Records| BH
    BH -->|Ranked Shortlist| Recruiter
    
    style BH fill:#4A90D9,color:#fff
    style AI fill:#7B68EE,color:#fff
    style MW fill:#FF6B6B,color:#fff
```

---

## Component Architecture

### System Components

```mermaid
flowchart LR
    subgraph BullhornSystem [Bullhorn CRM]
        BHAuth[OAuth 2.0<br/>Authentication]
        BHSearch[Search API<br/>Lucene Index]
        BHEntity[Entity API<br/>CRUD Operations]
        BHDB[(Candidate<br/>Records)]
    end
    
    subgraph MiddlewareSystem [Integration Middleware]
        Scheduler[Job Scheduler<br/>Cron/Trigger]
        Extractor[Data Extractor]
        Formatter[Payload Formatter]
        Parser[Response Parser]
        Updater[Record Updater]
    end
    
    subgraph AISystem [AI Engine]
        LLM[Large Language<br/>Model]
        Prompt[Prompt<br/>Engineering]
    end
    
    BHAuth --> Extractor
    BHSearch --> Extractor
    Extractor --> Formatter
    Formatter --> Prompt
    Prompt --> LLM
    LLM --> Parser
    Parser --> Updater
    Updater --> BHEntity
    BHEntity --> BHDB
    
    style BHDB fill:#4A90D9,color:#fff
    style LLM fill:#7B68EE,color:#fff
```

### Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| **Bullhorn OAuth 2.0** | Authenticate and obtain session token | REST API, OAuth 2.0 |
| **Bullhorn Search API** | Query candidates using Lucene syntax | REST API, Lucene |
| **Bullhorn Entity API** | Update candidate records with rankings | REST API, JSON |
| **Job Scheduler** | Trigger integration at scheduled intervals | Cron, AWS EventBridge, etc. |
| **Data Extractor** | Pull candidate data from Bullhorn | Python/Node.js |
| **Payload Formatter** | Structure data for LLM consumption | JSON processing |
| **AI Engine** | Evaluate and rank candidates | LLM (OpenAI, Claude, Gemini) |
| **Response Parser** | Extract rankings from LLM response | JSON parsing |
| **Record Updater** | Write rankings back to Bullhorn | REST API calls |

---

## Authentication Flow

### Bullhorn OAuth 2.0 Login Sequence

```mermaid
sequenceDiagram
    participant App as Integration App
    participant BH as Bullhorn OAuth
    participant API as Bullhorn REST API
    
    Note over App: Step 1: Get Authorization Code
    App->>BH: GET /oauth/authorize<br/>client_id, redirect_uri
    BH->>App: Authorization Code
    
    Note over App: Step 2: Exchange for Access Token
    App->>BH: POST /oauth/token<br/>code, client_secret
    BH->>App: Access Token
    
    Note over App: Step 3: Get Session Token
    App->>API: GET /login<br/>access_token
    API->>App: BhRestToken + restUrl
    
    Note over App: Step 4: Make API Calls
    App->>API: GET/POST with BhRestToken
    API->>App: Data Response
```

### Session Token Requirements

- **BhRestToken:** Must be included in all API requests
- **restUrl:** Data center-specific URL (varies by region)
- **Token Lifetime:** Typically 10 hours, implement refresh logic
- **Storage:** Store securely, never expose in logs

---

## Data Flow

### Complete Integration Workflow

```mermaid
flowchart TD
    Start([Trigger: Scheduled Job]) --> Auth{Valid Session?}
    Auth -->|No| Login[Login to Bullhorn<br/>Get BhRestToken]
    Auth -->|Yes| Search[Search Candidates<br/>GET /search/Candidate]
    Login --> Search
    
    Search --> Extract[Extract Required Fields<br/>id, name, description]
    Extract --> Batch{More than<br/>10 candidates?}
    
    Batch -->|Yes| Split[Split into Batches<br/>5-10 per batch]
    Batch -->|No| Format[Format LLM Payload]
    Split --> Format
    
    Format --> Send[Send to LLM API<br/>Job Description + Candidates]
    Send --> Eval[AI Evaluates Candidates<br/>Assigns Rank 1-4]
    
    Eval --> Parse[Parse JSON Response<br/>Extract Rankings]
    Parse --> Loop{More Candidates<br/>to Update?}
    
    Loop -->|Yes| Update[Update Candidate Record<br/>POST /entity/Candidate/id]
    Update --> Log[Log Update Success]
    Log --> Loop
    
    Loop -->|No| Summary[Generate Summary Report]
    Summary --> End([Complete])
    
    style Start fill:#E8F5E9
    style Eval fill:#F3E8FF
    style End fill:#E8F5E9
    style Update fill:#4A90D9,color:#fff
```

### Data Transformation Pipeline

```mermaid
flowchart LR
    subgraph Input [Input Data]
        JD[Job Description<br/>Text]
        Cand[Candidate Records<br/>JSON Array]
    end
    
    subgraph Transform [Transformation]
        Clean[Clean & Normalize<br/>Text Data]
        Struct[Structure for LLM<br/>JSON Payload]
    end
    
    subgraph AI [AI Processing]
        Eval[Evaluation<br/>Compare to JD]
        Rank[Ranking<br/>1-4 Scale]
    end
    
    subgraph Output [Output Data]
        Result[Rankings<br/>JSON Array]
        Store[Store in Bullhorn<br/>customInt1]
    end
    
    JD --> Clean
    Cand --> Clean
    Clean --> Struct
    Struct --> Eval
    Eval --> Rank
    Rank --> Result
    Result --> Store
    
    style Eval fill:#7B68EE,color:#fff
    style Store fill:#4A90D9,color:#fff
```

---

## Batch Processing Strategy

### Why Batch Processing?

LLMs have context window limits. Sending 50+ full resumes at once may:
- Exceed token limits
- Increase latency
- Reduce evaluation quality

### Recommended Batch Sizes

```mermaid
flowchart TD
    Total[Total Candidates] --> Check{Count?}
    Check -->|1-10| Single[Single Batch<br/>Process All at Once]
    Check -->|11-30| Medium[Medium Batches<br/>10 per Request]
    Check -->|31+| Large[Large Batches<br/>5 per Request]
    
    Single --> Process[Send to LLM]
    Medium --> Split1[Split into 3 batches]
    Large --> Split2[Split into 7+ batches]
    
    Split1 --> Process
    Split2 --> Process
    
    style Single fill:#28A745,color:#fff
    style Medium fill:#FFC107,color:#000
    style Large fill:#DC3545,color:#fff
```

### Batch Processing Flow

```mermaid
sequenceDiagram
    participant MW as Middleware
    participant BH as Bullhorn
    participant AI as LLM Engine
    
    Note over MW: Extract 25 candidates
    MW->>MW: Split into 3 batches<br/>[10, 10, 5]
    
    loop Batch 1 (10 candidates)
        MW->>AI: Evaluate Batch 1
        AI->>MW: Rankings for 10
        MW->>BH: Update 10 records
    end
    
    loop Batch 2 (10 candidates)
        MW->>AI: Evaluate Batch 2
        AI->>MW: Rankings for 10
        MW->>BH: Update 10 records
    end
    
    loop Batch 3 (5 candidates)
        MW->>AI: Evaluate Batch 3
        AI->>MW: Rankings for 5
        MW->>BH: Update 5 records
    end
    
    Note over MW: All 25 candidates ranked
```

---

## Error Handling

### Error Handling Flow

```mermaid
flowchart TD
    Start([API Call]) --> Call[Execute Request]
    Call --> Check{Success?}
    
    Check -->|Yes| Parse[Parse Response]
    Check -->|No| Error{Error Type?}
    
    Error -->|401 Unauthorized| Reauth[Re-authenticate<br/>Get New Token]
    Error -->|429 Rate Limit| Wait[Wait 60s<br/>Retry with Backoff]
    Error -->|500 Server Error| Retry[Retry 3x<br/>with Exponential Backoff]
    Error -->|Other| Log[Log Error<br/>Alert Team]
    
    Reauth --> Call
    Wait --> Call
    Retry --> Check2{Retries<br/>Exhausted?}
    Check2 -->|No| Call
    Check2 -->|Yes| Log
    Log --> End([Handle Manually])
    Parse --> Success([Continue])
    
    style Error fill:#DC3545,color:#fff
    style Success fill:#28A745,color:#fff
```

### Common Error Scenarios

| Error Code | Meaning | Recovery Action |
|------------|---------|-----------------|
| **401** | Session expired | Re-authenticate with OAuth 2.0 |
| **429** | Rate limit exceeded | Implement exponential backoff |
| **500** | Bullhorn server error | Retry with backoff, max 3 attempts |
| **400** | Bad request (invalid JSON) | Log and skip, fix payload structure |
| **404** | Candidate not found | Log and skip, candidate may be deleted |

---

## Security Architecture

### Security Layers

```mermaid
flowchart TB
    subgraph Layer1 [Network Security]
        HTTPS[HTTPS Only<br/>TLS 1.2+]
        VPN[VPN/Private Link<br/>Optional]
    end
    
    subgraph Layer2 [Authentication]
        OAuth[OAuth 2.0<br/>Client Credentials]
        Token[Session Token<br/>BhRestToken]
    end
    
    subgraph Layer3 [Data Security]
        Encrypt[Encrypt at Rest<br/>Sensitive Data]
        Mask[Mask PII in Logs<br/>Candidate Names]
    end
    
    subgraph Layer4 [Access Control]
        RBAC[Role-Based Access<br/>Bullhorn Permissions]
        API[API Key Management<br/>Secure Storage]
    end
    
    Layer1 --> Layer2
    Layer2 --> Layer3
    Layer3 --> Layer4
    
    style OAuth fill:#4A90D9,color:#fff
    style Encrypt fill:#28A745,color:#fff
```

### Best Practices

1. **Never log credentials or session tokens**
2. **Store API keys in environment variables or secret managers**
3. **Use HTTPS for all API communications**
4. **Implement token refresh before expiration**
5. **Mask candidate PII in application logs**
6. **Follow Bullhorn API rate limits (check documentation)**

---

## Deployment Architecture

### Deployment Options

```mermaid
flowchart TB
    subgraph Option1 [Option 1: Serverless]
        Lambda[AWS Lambda<br/>or Azure Functions]
        Trigger[CloudWatch/EventBridge<br/>Scheduled Trigger]
        Secrets[AWS Secrets Manager<br/>or Azure Key Vault]
    end
    
    subgraph Option2 [Option 2: Container]
        Docker[Docker Container]
        K8s[Kubernetes<br/>CronJob]
        Config[ConfigMaps/Secrets]
    end
    
    subgraph Option3 [Option 3: Traditional]
        Server[VM/Server]
        Cron[Cron Job<br/>Linux Scheduler]
        Env[Environment Variables]
    end
    
    style Lambda fill:#FF9900,color:#fff
    style Docker fill:#2496ED,color:#fff
    style Server fill:#6C757D,color:#fff
```

### Recommended: Serverless Architecture

**Benefits:**
- No server management
- Pay-per-execution
- Automatic scaling
- Built-in logging and monitoring

**Components:**
- **AWS Lambda** or **Azure Functions** for compute
- **CloudWatch Events** or **EventBridge** for scheduling
- **Secrets Manager** or **Key Vault** for credential storage
- **CloudWatch Logs** for monitoring and debugging

---

## Monitoring and Observability

### Monitoring Dashboard

```mermaid
flowchart LR
    subgraph Metrics [Key Metrics]
        M1[API Response Time]
        M2[Success/Failure Rate]
        M3[Candidates Processed]
        M4[LLM Token Usage]
    end
    
    subgraph Alerts [Alert Conditions]
        A1[Error Rate > 5%]
        A2[Response Time > 10s]
        A3[Auth Failures > 3]
    end
    
    subgraph Actions [Actions]
        Notify[Send Alert<br/>Email/Slack]
        Log[Log to CloudWatch]
        Retry[Auto-Retry Logic]
    end
    
    Metrics --> Alerts
    Alerts --> Actions
    
    style A1 fill:#DC3545,color:#fff
    style A2 fill:#FFC107,color:#000
    style Notify fill:#FF6B6B,color:#fff
```

### Key Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Response Time | < 2 seconds | > 10 seconds |
| Success Rate | > 98% | < 95% |
| Candidates Processed/Hour | Varies | N/A |
| Authentication Failures | 0 | > 3 consecutive |
| LLM Token Usage | Track cost | Budget limit |

---

## Scalability Considerations

### Scaling Strategy

```mermaid
flowchart TD
    Current[Current State<br/>100 candidates/day] --> Growth{Growth?}
    
    Growth -->|10x| Scale1[1,000 candidates/day<br/>Optimize Batching]
    Growth -->|100x| Scale2[10,000 candidates/day<br/>Parallel Processing]
    
    Scale1 --> Tactics1[Smaller Batches<br/>Async Processing]
    Scale2 --> Tactics2[Queue-Based Architecture<br/>Multiple Workers]
    
    Tactics1 --> Cloud[Cloud Auto-Scaling]
    Tactics2 --> Cloud
    
    style Current fill:#E8F5E9
    style Scale2 fill:#DC3545,color:#fff
```

### Performance Optimization

1. **Parallel API calls** for independent operations
2. **Connection pooling** for HTTP clients
3. **Caching** for authentication tokens
4. **Asynchronous processing** for large batches
5. **Database optimization** for logging and audit trails

---

## Next Steps

1. Review **BULLHORN_IMPLEMENTATION_SPEC.md** for API details
2. Review **LLM_PROMPT_ENGINEERING.md** for prompt design
3. Set up development environment with API credentials
4. Implement authentication flow first
5. Test with small batch of candidates (5-10)
6. Monitor and optimize before production deployment

---

## Related Documentation

- **README.md** - Executive overview
- **BULLHORN_IMPLEMENTATION_SPEC.md** - API specifications
- **LLM_PROMPT_ENGINEERING.md** - Prompt design
- **FUTURE_STATE_FIELDGLASS_INTEGRATION.md** - Phase 2 roadmap
- **INTEGRATION_PROMPT.md** - Ready-to-use implementation
