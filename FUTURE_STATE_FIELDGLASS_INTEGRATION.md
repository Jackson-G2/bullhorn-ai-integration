# Future State: SAP Fieldglass Integration

## Overview

This document outlines the Phase 2 roadmap for integrating SAP Fieldglass Vendor Management System (VMS) with the Bullhorn AI ranking engine. Once candidates are ranked in Bullhorn (Phase 1), Phase 2 will automatically submit top-ranked candidates to Fieldglass work orders, enabling end-to-end automation from evaluation to client submission.

**Prerequisite:** Phase 1 (Bullhorn AI Ranking) must be operational before beginning this integration.

---

## Business Case

### Current Manual Process

```mermaid
flowchart LR
    subgraph Manual [Current State: Manual]
        A1[AI Ranks Candidates<br/>in Bullhorn] --> A2[Recruiter Reviews<br/>Rank 1 Candidates]
        A2 --> A3[Recruiter Manually<br/>Logs into Fieldglass]
        A3 --> A4[Recruiter Manually<br/>Enters Candidate Data]
        A4 --> A5[Recruiter Manually<br/>Submits to Work Order]
    end

    style A3 fill:#DC3545,color:#fff
    style A4 fill:#DC3545,color:#fff
    style A5 fill:#DC3545,color:#fff
```

### Automated Future State

```mermaid
flowchart LR
    subgraph Automated [Future State: Automated]
        B1[AI Ranks Candidates<br/>in Bullhorn] --> B2[Rank 1 Candidates<br/>Auto-Identified]
        B2 --> B3[Middleware Formats<br/>Submission Payload]
        B3 --> B4[Auto-Submit to<br/>Fieldglass API]
        B4 --> B5[Candidate Status<br/>Synced Back to Bullhorn]
    end

    style B4 fill:#28A745,color:#fff
    style B5 fill:#28A745,color:#fff
```

### Expected Benefits

| Benefit | Impact |
|---------|--------|
| Eliminate manual data entry | Save 15-30 minutes per submission |
| Reduce submission errors | Zero re-keying of candidate data |
| Faster time-to-submit | Submit within minutes of ranking |
| Consistent data format | Standardized submissions every time |
| Audit trail | Full visibility into submission history |

---

## SAP Fieldglass Platform Overview

### What is SAP Fieldglass?

SAP Fieldglass is a cloud-based Vendor Management System (VMS) used by large enterprises to manage contingent workforce programs. Clients (buyers) post work orders, and staffing agencies (suppliers) submit candidates through the platform.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Work Order** | A job requisition posted by the client in Fieldglass |
| **Worker Profile** | A candidate's profile submitted to a work order |
| **Supplier** | Your staffing agency (the vendor) |
| **Buyer** | The client company using Fieldglass |
| **Statement of Work (SOW)** | Contract defining the engagement terms |
| **Time Sheet** | Hours logged by the worker once placed |

---

## Authentication

### OAuth 2.0 Client Credentials Flow

SAP Fieldglass uses OAuth 2.0 with the Client Credentials grant type for server-to-server API access.

```mermaid
sequenceDiagram
    participant MW as Middleware
    participant Auth as SAP Identity Auth
    participant FG as Fieldglass API

    Note over MW: Step 1: Request Access Token
    MW->>Auth: POST /oauth2/token<br/>grant_type=client_credentials<br/>client_id, client_secret
    Auth->>MW: Access Token (JWT)

    Note over MW: Step 2: Call Fieldglass API
    MW->>FG: GET/POST /api/v1/...<br/>Authorization: Bearer {token}
    FG->>MW: JSON Response
```

### Token Request

```http
POST /oauth2/token HTTP/1.1
Host: {tenant}.authentication.sap.hana.ondemand.com
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
```

### Token Response

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "api.fieldglass"
}
```

> **Note:** Tokens typically expire in 1 hour. Implement proactive refresh 5 minutes before expiry.

---

## API Endpoints

### Authentication Setup

Before calling the Fieldglass API, you need:

1. **SAP BTP Account** - SAP Business Technology Platform tenant
2. **Fieldglass API Subscription** - Enabled in your SAP BTP cockpit
3. **Client Credentials** - Obtained from SAP BTP service key
4. **Supplier ID** - Your agency's Fieldglass supplier identifier
5. **API Base URL** - Varies by data center region

### Core Endpoints

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Get Work Orders | GET | `/api/v1/workorders` | Retrieve open work orders |
| Get Work Order Details | GET | `/api/v1/workorders/{id}` | Full details of a specific work order |
| Create Worker Profile | POST | `/api/v1/workorders/{id}/workers` | Submit candidate to a work order |
| Get Worker Status | GET | `/api/v1/workers/{id}/status` | Check submission status |
| Update Worker Profile | PUT | `/api/v1/workers/{workerId}` | Update candidate information |

---

## Integration Architecture

### End-to-End Data Flow

```mermaid
flowchart TD
    subgraph Phase1 [Phase 1: Bullhorn AI Ranking]
        BH[(Bullhorn CRM)]
        AI[AI Ranking Engine]
        BH -->|Candidate Data| AI
        AI -->|Rank 1-4| BH
    end

    subgraph Phase2 [Phase 2: Fieldglass Auto-Submit]
        MW[Integration Middleware]
        FG[(SAP Fieldglass)]
    end

    BH -->|Rank 1 Candidates| MW
    MW -->|Worker Profile| FG
    FG -->|Submission Status| MW
    MW -->|Status Update| BH

    style Phase1 fill:#E8F4FD
    style Phase2 fill:#FFF3E0
```

### Detailed Submission Workflow

```mermaid
flowchart TD
    Start([Trigger: New Rank 1 Detected]) --> Fetch[Fetch Candidate<br/>from Bullhorn]
    Fetch --> Validate{Valid for<br/>Submission?}

    Validate -->|Missing Data| Hold[Flag for<br/>Manual Review]
    Validate -->|Valid| Map[Map Bullhorn Fields<br/>to Fieldglass Schema]

    Map --> CheckWO{Work Order<br/>Still Open?}
    CheckWO -->|No| Closed[Log: Work Order<br/>No Longer Open]
    CheckWO -->|Yes| Submit[POST Worker Profile<br/>to Fieldglass API]

    Submit --> Response{Submission<br/>Successful?}
    Response -->|Yes| Status[Update Bullhorn:<br/>Submitted to FG]
    Response -->|No| Retry[Retry 3x with<br/>Exponential Backoff]

    Retry --> Success{Success?}
    Success -->|Yes| Status
    Success -->|No| Fail[Alert: Manual<br/>Intervention Required]

    Status --> Audit[Log Submission<br/>to Audit Trail]
    Hold --> Audit
    Fail --> Audit

    style Submit fill:#28A745,color:#fff
    style Fail fill:#DC3545,color:#fff
```

---

## Data Mapping

### Bullhorn to Fieldglass Field Mapping

| Bullhorn Field | Fieldglass Field | Notes |
|----------------|-----------------|-------|
| `candidate.firstName` | `worker.firstName` | Direct mapping |
| `candidate.lastName` | `worker.lastName` | Direct mapping |
| `candidate.email` | `worker.email` | Primary email |
| `candidate.phone` | `worker.phone` | Primary phone |
| `candidate.description` | `worker.resume` | Resume text / attachment |
| `candidate.address.city` | `worker.location.city` | City |
| `candidate.address.country` | `worker.location.country` | ISO country code |
| `candidate.customInt1` (Rank) | N/A | Used for filtering Rank 1 only |
| `jobOrder.title` | `workOrder.title` | Reference only |
| `jobOrder.clientCorporation.name` | `workOrder.buyer` | Client name |

### Worker Profile Submission Payload

```json
{
  "worker": {
    "firstName": "Alanzo",
    "lastName": "Smith",
    "email": "alanzo.smith@email.com",
    "phone": "+1-555-0123",
    "location": {
      "city": "New York",
      "state": "NY",
      "country": "US"
    },
    "resume": {
      "text": "Senior Java Developer with 7 years of experience...",
      "format": "TEXT"
    },
    "rate": {
      "amount": 85.00,
      "currency": "USD",
      "unit": "HOURLY"
    },
    "availability": {
      "startDate": "2026-04-15",
      "type": "FULL_TIME"
    },
    "skills": [
      {"name": "Java", "proficiency": "EXPERT"},
      {"name": "Spring Boot", "proficiency": "EXPERT"},
      {"name": "AWS", "proficiency": "ADVANCED"},
      {"name": "Docker", "proficiency": "ADVANCED"},
      {"name": "Kubernetes", "proficiency": "INTERMEDIATE"}
    ],
    "workHistory": [
      {
        "company": "Investment Bank Corp",
        "title": "Senior Java Developer",
        "startDate": "2022-01",
        "endDate": "2026-03",
        "description": "Led development of distributed microservices..."
      }
    ]
  }
}
```

---

## Submission Logic

### Rank-Based Filtering

Only candidates ranked **1 (Top Tier)** by the AI engine are eligible for automatic submission to Fieldglass.

```mermaid
flowchart LR
    All[All Ranked Candidates] --> R1[Rank 1: Top Tier]
    All --> R2[Rank 2: Strong]
    All --> R3[Rank 3: Average]
    All --> R4[Rank 4: Unqualified]

    R1 --> Auto[Auto-Submit to Fieldglass]
    R2 --> Hold[Hold in Bullhorn<br/>Recruiter Decision]
    R3 --> Hold
    R4 --> Archive[Archive / Do Not Submit]

    style Auto fill:#28A745,color:#fff
    style Hold fill:#FFC107,color:#000
    style Archive fill:#DC3545,color:#fff
```

### Pre-Submission Validation Checklist

Before submitting a candidate to Fieldglass, the middleware must verify:

- [ ] Candidate rank is 1 (Top Tier)
- [ ] Candidate has a valid email address
- [ ] Candidate has a phone number
- [ ] Resume/description is not empty
- [ ] Candidate has not already been submitted to this work order
- [ ] Work order is still open and accepting submissions
- [ ] Candidate is available within the work order timeline
- [ ] Bill rate is within the work order budget range

### Duplicate Detection

```python
def check_duplicate_submission(candidate_id, work_order_id):
    """
    Prevent submitting the same candidate to the same work order twice.
    Check submission history in Bullhorn or a local audit table.
    """
    # Check Bullhorn for existing submission record
    existing = bullhorn_search(
        entity="Placement",
        query=f"candidate.id:{candidate_id} "
              f"AND jobOrder.id:{work_order_id}"
    )
    return len(existing) > 0
```

---

## Bi-Directional Sync

### Status Synchronization

```mermaid
flowchart LR
    subgraph Bullhorn [Bullhorn CRM]
        BHStatus[Candidate Status]
    end

    subgraph Fieldglass [SAP Fieldglass]
        FGStatus[Worker Status]
    end

    BHStatus -->|Submitted| FGStatus
    FGStatus -->|Accepted / Rejected| BHStatus

    style BHStatus fill:#4A90D9,color:#fff
    style FGStatus fill:#0070F2,color:#fff
```

### Fieldglass Worker Status Values

| Fieldglass Status | Bullhorn Equivalent | Action |
|-------------------|-------------------|--------|
| Submitted | Application Submitted | Log submission in Bullhorn |
| Under Review | Application Submitted | No change |
| Interview Scheduled | Interview Stage | Update Bullhorn stage |
| Offer Extended | Offer Stage | Alert recruiter |
| Accepted / Confirmed | Placed | Create placement record |
| Rejected | Application Rejected | Update candidate status |
| Withdrawn | Application Withdrawn | Log withdrawal |

### Sync Polling Strategy

```
Poll Fieldglass API every 30 minutes for status changes on submitted workers.
Update Bullhorn candidate status accordingly.
Notify recruiter via email for status changes requiring action.
```

---

## Error Handling

### Fieldglass API Error Codes

| HTTP Status | Meaning | Recovery Action |
|-------------|---------|-----------------|
| **400** | Invalid request payload | Log error, validate data, do not retry |
| **401** | Token expired or invalid | Refresh token and retry |
| **403** | Insufficient permissions | Alert admin, check API scope |
| **409** | Duplicate submission | Log and skip (expected) |
| **429** | Rate limit exceeded | Wait and retry with backoff |
| **500** | Fieldglass server error | Retry 3x with exponential backoff |

### Retry Strategy

```python
import time

def submit_with_retry(payload, max_retries=3):
    for attempt in range(max_retries):
        response = fieldglass_submit(payload)

        if response.status_code == 200:
            return response  # Success

        if response.status_code == 409:
            return None  # Duplicate, not an error

        if response.status_code in (401, 429, 500):
            wait_time = 2 ** attempt  # 1s, 2s, 4s
            time.sleep(wait_time)
            continue

        break  # Non-retryable error

    return None  # All retries exhausted
```

---

## Implementation Timeline

### Phase 2 Rollout Plan

```mermaid
gantt
    title Phase 2: Fieldglass Integration Timeline
    dateFormat  YYYY-MM-DD
    section Prerequisites
    Phase 1 Live                    :done, a1, 2026-04-01, 1d
    SAP BTP Account Setup           :a2, 2026-04-01, 7d
    Fieldglass API Access           :a3, after a2, 5d
    section Development
    Auth Module                     :b1, after a3, 5d
    Data Mapping Layer              :b2, after a3, 7d
    Submission Logic                :b3, after b2, 10d
    Status Sync Module              :b4, after b3, 7d
    section Testing
    Sandbox Testing                 :c1, after b4, 7d
    UAT with Recruiter              :c2, after c1, 5d
    section Deployment
    Production Rollout              :d1, after c2, 3d
    Monitoring Setup                :d2, after d1, 3d
```

### Prerequisites Checklist

- [ ] Phase 1 (Bullhorn AI Ranking) is live and stable
- [ ] SAP BTP account provisioned
- [ ] Fieldglass API access granted by SAP
- [ ] Client credentials obtained from SAP BTP cockpit
- [ ] Supplier ID confirmed in Fieldglass
- [ ] Test work order available in Fieldglass sandbox
- [ ] Field mapping validated with sample data

---

## Security Considerations

### Data Flow Security

```mermaid
flowchart TB
    subgraph Security [Security Layers]
        L1[HTTPS/TLS 1.2+<br/>All API Calls]
        L2[OAuth 2.0 Client Credentials<br/>API Authentication]
        L3[PII Masking<br/>Logs and Monitoring]
        L4[Role-Based Access<br/>Bullhorn + Fieldglass]
    end

    L1 --> L2 --> L3 --> L4

    style L1 fill:#28A745,color:#fff
    style L2 fill:#0070F2,color:#fff
```

### Compliance Requirements

1. **GDPR/CCPA** - Mask candidate PII in logs (names, emails, phone numbers)
2. **Data Residency** - Confirm Fieldglass data center location matches compliance region
3. **Audit Trail** - Log all submissions, status changes, and errors
4. **Access Control** - Restrict API credentials to integration service account only
5. **Token Storage** - Store tokens in AWS Secrets Manager or Azure Key Vault

---

## Cost Estimation

### API Usage Costs

| Component | Estimated Cost | Notes |
|-----------|---------------|-------|
| SAP BTP Subscription | Varies | Contact SAP for pricing |
| Fieldglass API Calls | Included | Typically included in subscription |
| Additional Middleware | Minimal | Serverless function costs |
| Monitoring & Logging | Minimal | CloudWatch / Azure Monitor |

### ROI Impact

| Metric | Before (Manual) | After (Automated) |
|--------|-----------------|-------------------|
| Time per submission | 15-30 minutes | < 1 minute |
| Submissions per day | 5-10 | 20-50 |
| Data entry errors | 5-10% | < 1% |
| Time-to-submit | 1-2 hours | < 5 minutes |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Fieldglass API changes | Medium | High | Abstract API layer, version pinning |
| Rate limiting during peak | Medium | Medium | Implement queuing and backoff |
| Duplicate submissions | Low | Medium | Dedup check before submit |
| Token expiration mid-batch | Low | Low | Proactive token refresh |
| Fieldglass outage | Low | High | Queue submissions, retry on recovery |

---

## Related Documentation

- **README.md** - Executive overview and Phase 1 summary
- **ARCHITECTURE_AND_WORKFLOW.md** - System architecture for Phase 1
- **BULLHORN_IMPLEMENTATION_SPEC.md** - Bullhorn API specifications
- **LLM_PROMPT_ENGINEERING.md** - AI prompt design and ranking criteria
- **INTEGRATION_PROMPT.md** - Ready-to-use AI prompt implementation
